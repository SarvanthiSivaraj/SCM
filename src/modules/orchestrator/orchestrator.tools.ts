import {
  ToolDecorator as Tool,
  ControllerDecorator as Controller,
  ExecutionContext,
  Widget,
  z,
} from '@nitrostack/core';
import { ValidationService } from './validation.service.js';
import { ExceptionService } from './exception.service.js';
import { WorkflowEngine, type StepHandler } from './workflow.engine.js';
import { WorkflowContextStore } from './workflow-context.store.js';
import { SopLoaderService } from './sop-loader.service.js';
import { InvoiceRepository } from './invoice.repository.js';
import { MasterDataService } from '../master-data/master-data.service.js';
import { MasterDataTools } from '../master-data/master-data.tools.js';
import { IngestionTools } from '../ingestion/ingestion.tools.js';
import { AuditLogService } from '../../shared/audit-log.service.js';
import {
  ExtractedInvoiceSchema,
  PurchaseOrderSchema,
  ValidationResultSchema,
  type ExtractedInvoice,
  type PurchaseOrder,
  type ValidationResult,
} from '../../shared/schemas.js';

// ─── helper: build a short plain-English summary from engine output ───────────

function buildSummary(
  status: string,
  data: Record<string, unknown>,
  exitStep?: string,
  exitReason?: string,
): string {
  if (status === 'failed') {
    return `Workflow failed at step "${exitStep}": ${exitReason}`;
  }

  const invoice = data['invoice'] as ExtractedInvoice | undefined;
  const vr      = data['validationResult'] as ValidationResult | undefined;

  if (vr?.status === 'mismatch') {
    return `Mismatch detected on invoice ${invoice?.invoiceNumber ?? ''}. Discrepancies: ${vr.discrepancies.join('; ')}`;
  }
  if (data['__po_missing']) {
    return `PO ${(data['poNumber'] as string) ?? ''} not found in master data. Routed to procurement_team.`;
  }
  if (invoice) {
    return `Invoice ${invoice.invoiceNumber} matched PO ${invoice.poNumber} successfully.`;
  }
  return 'Workflow completed.';
}

// ─── helper: resolve final workflow status label ──────────────────────────────

function resolveStatus(
  engineStatus: string,
  data: Record<string, unknown>,
): string {
  if (engineStatus === 'failed') return 'failed';
  const vr = data['validationResult'] as ValidationResult | undefined;
  if (vr?.status === 'mismatch') return 'Flagged';
  if (data['__po_missing'])       return 'exception';
  const classification = data['classification'] as { docType: string } | undefined;
  if (classification?.docType !== 'invoice') return 'aborted';
  return 'Auto-approved';
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('orchestrator')
export class OrchestratorTools {
  constructor(
    private readonly validation:      ValidationService,
    private readonly exceptions:      ExceptionService,
    private readonly engine:          WorkflowEngine,
    private readonly store:           WorkflowContextStore,
    private readonly sop:             SopLoaderService,
    private readonly invoiceRepo:     InvoiceRepository,
    private readonly masterData:      MasterDataService,
    private readonly masterDataTools: MasterDataTools,
    private readonly ingestion:       IngestionTools,
    private readonly auditLog:        AuditLogService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // execute_workflow
  // ══════════════════════════════════════════════════════════════════════════

  @Tool({
    name: 'execute_workflow',
    description:
      'Run the full invoice processing pipeline driven by sop_rules.yaml: ' +
      'classify → extract → validate PO → recommend HS code → match → flag/route exceptions. ' +
      'Pass a plain-text invoice document.',
    inputSchema: z.object({
      workflowId: z.literal('invoice_processing'),
      input: z.object({
        file_name:    z.string().describe('Document filename (e.g. invoice_001.txt)'),
        file_content: z.string().describe('Plain-text document content (or base64 for PDF)'),
        file_type:    z.string().default('text/plain').describe('MIME type'),
      }),
    }),
    outputSchema: z.object({
      workflowRunId: z.string(),
      status:        z.string(),
      summary:       z.string(),
      stepResults:   z.array(z.any()),
      output:        z.any(),
    }),
  })
  @Widget('invoice-result')
  async executeWorkflow(
    input: {
      workflowId: 'invoice_processing';
      input: { file_name: string; file_content: string; file_type: string };
    },
    ctx: ExecutionContext,
  ) {
    const t0 = Date.now();
    const { file_name, file_content, file_type } = input.input;

    // ── Register step handlers (name matches sop_rules.yaml step.name) ────────

    const handlers = new Map<string, StepHandler>([

      // ── Step: classify ────────────────────────────────────────────────────
      ['classify', async (_step: string, data: Record<string, unknown>, c: ExecutionContext) => {
        const classification = await this.ingestion.classifyDocument(
          { filename: file_name, content: file_content },
          c,
        );
        if (classification.docType !== 'invoice') {
          // Signal downstream steps that we aborted early
          throw new Error(
            `Document classified as "${classification.docType}" (confidence: ${classification.confidence}). ` +
            'Only invoice documents are processed.',
          );
        }
        return { classification };
      }],

      // ── Step: extract ─────────────────────────────────────────────────────
      ['extract', async (_step: string, data: Record<string, unknown>, c: ExecutionContext) => {
        const invoice = await this.ingestion.extractDocumentData(
          { content: file_content, mimeType: file_type },
          c,
        );
        return { invoice };
      }],

      // ── Step: validate_po ─────────────────────────────────────────────────
      ['validate_po', async (_step: string, data: Record<string, unknown>, c: ExecutionContext) => {
        const invoice = data['invoice'] as ExtractedInvoice;
        if (!invoice?.poNumber) {
          throw new Error('No poNumber found in extracted invoice data.');
        }

        const result = await this.masterDataTools.validateAgainstMasterData(
          { sku: invoice.lineItems[0]?.sku ?? '', poNumber: invoice.poNumber },
          c,
        );

        if (!result.exists || !result.poRecord) {
          // Flag missing PO — still want to run hs_code step, so we inject a sentinel
          await this.exceptions.flag(
            data['__workflowRunId'] as string ?? 'unknown',
            `PO ${invoice.poNumber} not found in master data`,
            { poNumber: invoice.poNumber },
          );
          console.error(
            `[ROUTE_TASK → procurement_team] Missing PO ${invoice.poNumber}`,
          );
          return { __po_missing: true, poNumber: invoice.poNumber, masterDataResult: result };
        }

        return { masterDataResult: result, po: result.poRecord };
      }],

      // ── Step: hs_code ─────────────────────────────────────────────────────
      ['hs_code', async (_step: string, data: Record<string, unknown>, c: ExecutionContext) => {
        const invoice = data['invoice'] as ExtractedInvoice | undefined;
        const description = invoice?.lineItems[0]?.description ?? '';
        if (!description) return { hsCodeResult: null };

        const hsCodeResult = await this.masterDataTools.recommendHsCode(
          { productDescription: description },
          c,
        );
        return { hsCodeResult };
      }],

      // ── Step: match ───────────────────────────────────────────────────────
      ['match', async (_step: string, data: Record<string, unknown>, c: ExecutionContext) => {
        if (data['__po_missing']) {
          // Can't match without a PO — skip gracefully
          return { validationResult: { status: 'exception', discrepancies: ['PO not found'] } };
        }

        const invoice = data['invoice'] as ExtractedInvoice;
        const po      = data['po'] as PurchaseOrder;

        const validationResult = await this.matchInvoiceToPO({ invoice, po }, c);

        if (validationResult.status === 'mismatch') {
          await this.exceptions.flag(
            data['__workflowRunId'] as string ?? 'unknown',
            'Invoice/PO mismatch detected',
            validationResult,
          );
          console.error(
            `[ROUTE_TASK → finance_team] Mismatch on invoice ${invoice.invoiceNumber}`,
          );
        }

        return { validationResult };
      }],
    ]);

    // ── Run the engine ────────────────────────────────────────────────────────
    const result = await this.engine.run('invoice_processing', {}, handlers, ctx);

    // Inject workflowRunId into data so step handlers can reference it
    result.data['__workflowRunId'] = result.workflowId;

    const finalStatus  = resolveStatus(result.status, result.data);
    const finalSummary = buildSummary(result.status, result.data, result.exitStep, result.exitReason);

    // ── Persist invoice to SQLite for analytics ────────────────────────────
    const invoice = result.data['invoice'] as ExtractedInvoice | undefined;
    if (invoice) {
      try {
        await this.invoiceRepo.save(invoice, finalStatus, result.workflowId);
      } catch (err) {
        console.error('[OrchestratorTools] Failed to persist invoice:', err);
      }
    }

    // ── Write audit log entry ─────────────────────────────────────────────
    await this.auditLog.log({
      workflowId:  result.workflowId,
      toolName:    'execute_workflow',
      input:       { file_name, file_type },
      output:      { status: finalStatus, stepCount: result.stepResults.length },
      status:      result.status === 'completed' ? 'success' : 'error',
      errorMsg:    result.exitReason,
      durationMs:  Date.now() - t0,
    });

    return {
      workflowRunId: result.workflowId,
      status:        finalStatus,
      summary:       finalSummary,
      stepResults:   result.stepResults,
      output: {
        invoice:          result.data['invoice'],
        po:               result.data['po'],
        validationResult: result.data['validationResult'],
        hsCodeResult:     result.data['hsCodeResult'],
        classification:   result.data['classification'],
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // get_workflow_status
  // ══════════════════════════════════════════════════════════════════════════

  @Tool({
    name: 'get_workflow_status',
    description:
      'Retrieve the current status, step results, and output of a previously executed workflow run. ' +
      'Pass the workflowRunId returned by execute_workflow.',
    inputSchema: z.object({
      workflowRunId: z.string().describe('The workflowRunId returned by execute_workflow'),
    }),
    outputSchema: z.object({
      found:        z.boolean(),
      run:          z.any().optional(),
    }),
  })
  async getWorkflowStatus(input: { workflowRunId: string }, _ctx: ExecutionContext) {
    const run = this.store.get(input.workflowRunId);
    return { found: !!run, run: run ?? undefined };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // list_workflow_runs
  // ══════════════════════════════════════════════════════════════════════════

  @Tool({
    name: 'list_workflow_runs',
    description: 'List all workflow runs executed in the current server session (most recent first).',
    inputSchema: z.object({}),
    outputSchema: z.object({
      runs: z.array(z.any()),
      total: z.number(),
    }),
  })
  async listWorkflowRuns(_input: Record<string, never>, _ctx: ExecutionContext) {
    const runs = this.store.listAll();
    return { runs, total: runs.length };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // match_invoice_to_po  (standalone — usable without full workflow)
  // ══════════════════════════════════════════════════════════════════════════

  @Tool({
    name: 'match_invoice_to_po',
    description:
      'Compare an extracted invoice against a purchase order. ' +
      'Returns match/mismatch/exception status with discrepancy details. ' +
      'Qty or price difference >1% is treated as a mismatch.',
    inputSchema: z.object({
      invoice: ExtractedInvoiceSchema.describe('The extracted invoice data'),
      po:      PurchaseOrderSchema.describe('The purchase order to match against'),
    }),
    outputSchema: ValidationResultSchema,
  })
  async matchInvoiceToPO(
    input: { invoice: ExtractedInvoice; po: PurchaseOrder },
    _ctx?: ExecutionContext,
  ): Promise<ValidationResult> {
    return this.validation.matchInvoiceToPO(input.invoice, input.po);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // flag_exception  (standalone — usable without full workflow)
  // ══════════════════════════════════════════════════════════════════════════

  @Tool({
    name: 'flag_exception',
    description: 'Log a workflow exception to the local exceptions store.',
    inputSchema: z.object({
      workflowId: z.string().describe('Workflow run identifier'),
      reason:     z.string().describe('Human-readable reason for the exception'),
      data:       z.any().describe('Arbitrary payload'),
    }),
    outputSchema: z.object({
      exceptionId: z.string(),
      status:      z.literal('flagged'),
    }),
  })
  async flagException(
    input: { workflowId: string; reason: string; data: unknown },
    _ctx: ExecutionContext,
  ) {
    const record = await this.exceptions.flag(input.workflowId, input.reason, input.data);
    return { exceptionId: record.exceptionId, status: 'flagged' as const };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // route_task  (stubbed — Phase 2 will add Slack/email)
  // ══════════════════════════════════════════════════════════════════════════

  @Tool({
    name: 'route_task',
    description:
      'Route a task to a stakeholder. STUBBED — logs to console. Real Slack/email is Phase 2.',
    inputSchema: z.object({
      task:        z.string().describe('Task description'),
      stakeholder: z.string().describe('Target stakeholder (e.g. finance_team)'),
      priority:    z.enum(['low', 'medium', 'high']).default('medium'),
    }),
    outputSchema: z.object({
      routed:  z.boolean(),
      message: z.string(),
    }),
  })
  async routeTask(
    input: { task: string; stakeholder: string; priority: string },
    _ctx: ExecutionContext,
  ) {
    console.error(
      `[ROUTE_TASK] → ${input.stakeholder} | priority=${input.priority} | task="${input.task}"`,
    );
    return {
      routed:  true,
      message: `Task routed to ${input.stakeholder} (stub — no real notification sent)`,
    };
  }
}
