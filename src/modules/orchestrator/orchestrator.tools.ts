import {
  ToolDecorator as Tool,
  ControllerDecorator as Controller,
  ExecutionContext,
  Widget,
  z,
} from '@nitrostack/core';
import { ValidationService } from './validation.service.js';
import { ExceptionService } from './exception.service.js';
import { MasterDataService } from '../master-data/master-data.service.js';
import { IngestionTools } from '../ingestion/ingestion.tools.js';
import {
  ExtractedInvoiceSchema,
  PurchaseOrderSchema,
  ValidationResultSchema,
  type ExtractedInvoice,
  type PurchaseOrder,
  type ValidationResult,
} from '../../shared/schemas.js';

@Controller('orchestrator')
export class OrchestratorTools {
  constructor(
    private readonly validation: ValidationService,
    private readonly exceptions: ExceptionService,
    private readonly masterData: MasterDataService,
    private readonly ingestion: IngestionTools,
  ) {}

  // ── match_invoice_to_po ──────────────────────────────────────────────────

  @Tool({
    name: 'match_invoice_to_po',
    description:
      'Compare an extracted invoice against a purchase order. Returns match/mismatch/exception status with discrepancy details.',
    inputSchema: z.object({
      invoice: ExtractedInvoiceSchema.describe('The extracted invoice data'),
      po: PurchaseOrderSchema.describe('The purchase order to match against'),
    }),
    outputSchema: ValidationResultSchema,
  })
  async matchInvoiceToPO(
    input: { invoice: ExtractedInvoice; po: PurchaseOrder },
    _ctx: ExecutionContext,
  ): Promise<ValidationResult> {
    return this.validation.matchInvoiceToPO(input.invoice, input.po);
  }

  // ── flag_exception ───────────────────────────────────────────────────────

  @Tool({
    name: 'flag_exception',
    description: 'Log a workflow exception to the local exceptions store.',
    inputSchema: z.object({
      workflowId: z.string().describe('Workflow identifier'),
      reason: z.string().describe('Human-readable reason for the exception'),
      data: z.any().describe('Arbitrary payload (invoice diff, validation result, etc.)'),
    }),
    outputSchema: z.object({
      exceptionId: z.string(),
      status: z.literal('flagged'),
    }),
  })
  async flagException(
    input: { workflowId: string; reason: string; data: unknown },
    _ctx: ExecutionContext,
  ) {
    const record = this.exceptions.flag(input.workflowId, input.reason, input.data);
    return { exceptionId: record.exceptionId, status: 'flagged' as const };
  }

  // ── route_task ───────────────────────────────────────────────────────────

  @Tool({
    name: 'route_task',
    description:
      'Route a task to a stakeholder. STUBBED — logs to console. Real Slack/email integration is Phase 2.',
    inputSchema: z.object({
      task: z.string().describe('Task description'),
      stakeholder: z.string().describe('Target stakeholder (e.g. finance_team)'),
      priority: z.enum(['low', 'medium', 'high']).default('medium'),
    }),
    outputSchema: z.object({
      routed: z.boolean(),
      message: z.string(),
    }),
  })
  async routeTask(
    input: { task: string; stakeholder: string; priority: string },
    _ctx: ExecutionContext,
  ) {
    // STUB: log only
    console.error(
      `[ROUTE_TASK] → ${input.stakeholder} | priority=${input.priority} | task="${input.task}"`,
    );
    return {
      routed: true,
      message: `Task routed to ${input.stakeholder} (stub — no real notification sent)`,
    };
  }

  // ── execute_workflow ─────────────────────────────────────────────────────

  @Tool({
    name: 'execute_workflow',
    description:
      'Run the full invoice processing workflow: classify → extract → validate PO → match → flag/route exceptions.',
    inputSchema: z.object({
      workflowId: z.literal('invoice_processing'),
      input: z.object({
        file_name: z.string().describe('Document file name'),
        file_content: z.string().describe('Plain-text document content (or base64 for PDF)'),
        file_type: z.string().default('text/plain').describe('MIME type'),
      }),
    }),
    outputSchema: z.object({
      status: z.string(),
      summary: z.string(),
      output: z.any(),
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
    const { file_name, file_content } = input.input;
    const workflowId = `wf_${Date.now()}`;

    // Step 1 — classify
    const classification = await this.ingestion.classifyDocument(
      { filename: file_name, content: file_content },
      ctx,
    );

    if (classification.docType !== 'invoice') {
      return {
        status: 'aborted',
        summary: `Document classified as '${classification.docType}', not an invoice. Workflow aborted.`,
        output: { classification },
      };
    }

    // Step 2 — extract
    const invoice = await this.ingestion.extractDocumentData(
      { content: file_content, mimeType: input.input.file_type },
      ctx,
    );

    // Step 3 — validate PO
    const masterDataResult = await this.validateAndGetPO(invoice.poNumber, workflowId);
    if (!masterDataResult.exists || !masterDataResult.poRecord) {
      await this.flagException(
        { workflowId, reason: 'PO not found in master data', data: { poNumber: invoice.poNumber } },
        ctx,
      );
      await this.routeTask(
        { task: `Missing PO ${invoice.poNumber}`, stakeholder: 'procurement_team', priority: 'high' },
        ctx,
      );
      return {
        status: 'exception',
        summary: `PO ${invoice.poNumber} not found in master data. Routed to procurement_team.`,
        output: { invoice, masterDataResult },
      };
    }

    // Step 4 — match
    const validationResult = await this.matchInvoiceToPO(
      { invoice, po: masterDataResult.poRecord },
      ctx,
    );

    // Step 5 — handle mismatch
    if (validationResult.status === 'mismatch') {
      await this.flagException(
        { workflowId, reason: 'Invoice/PO mismatch', data: validationResult },
        ctx,
      );
      await this.routeTask(
        { task: `Invoice mismatch on ${invoice.invoiceNumber}`, stakeholder: 'finance_team', priority: 'high' },
        ctx,
      );
      return {
        status: 'Flagged',
        summary: `Mismatch detected. Discrepancies: ${validationResult.discrepancies.join('; ')}`,
        output: { invoice, po: masterDataResult.poRecord, validationResult },
      };
    }

    return {
      status: 'Auto-approved',
      summary: `Invoice ${invoice.invoiceNumber} matched PO ${invoice.poNumber} successfully.`,
      output: { invoice, po: masterDataResult.poRecord, validationResult },
    };
  }

  // ── internal helper ──────────────────────────────────────────────────────

  private async validateAndGetPO(poNumber: string, _workflowId: string) {
    const po = this.masterData.findPO(poNumber);
    return { exists: po !== null, poRecord: po };
  }
}
