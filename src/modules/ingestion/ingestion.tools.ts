import {
  ToolDecorator as Tool,
  ControllerDecorator as Controller,
  ExecutionContext,
  z,
} from '@nitrostack/core';
import { ClaudeClient } from '../../shared/claude.client.js';
import {
  ExtractedInvoiceSchema,
  InvoiceLineItemSchema,
  type ExtractedInvoice,
  type InvoiceLineItem,
} from '../../shared/schemas.js';

const CLASSIFY_SYSTEM = `You are a document classification engine.
Output ONLY valid JSON matching this schema, no prose, no markdown fences:
{"docType":"invoice"|"po"|"packing_list"|"unknown","confidence":0.0}`;

const EXTRACT_SYSTEM = (schema: string) =>
  `You are a document extraction engine.
Output ONLY valid JSON matching this schema, no prose, no markdown fences:
${schema}`;

@Controller('ingestion')
export class IngestionTools {
  constructor(private readonly claude: ClaudeClient) {}

  // ── classify_document ────────────────────────────────────────────────────

  @Tool({
    name: 'classify_document',
    description:
      'Classify an uploaded document as invoice, PO, packing_list, or unknown using the first 2000 characters.',
    inputSchema: z.object({
      filename: z.string().describe('Original file name'),
      content: z.string().describe('Plain-text document content'),
    }),
    outputSchema: z.object({
      docType: z.enum(['invoice', 'po', 'packing_list', 'unknown']),
      confidence: z.number().min(0).max(1),
    }),
  })
  async classifyDocument(
    input: { filename: string; content: string },
    _ctx: ExecutionContext,
  ) {
    const snippet = input.content.slice(0, 2000);
    const raw = await this.claude.complete(
      CLASSIFY_SYSTEM,
      `Classify this document (filename: ${input.filename}):\n\n${snippet}`,
      'claude-haiku-20240307',
      0.1,
    );

    const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned) as { docType: string; confidence: number };
    return {
      docType: parsed.docType as 'invoice' | 'po' | 'packing_list' | 'unknown',
      confidence: parsed.confidence,
    };
  }

  // ── extract_invoice_line_items ───────────────────────────────────────────

  @Tool({
    name: 'extract_invoice_line_items',
    description:
      'Extract individual line items from invoice text. Called internally by extract_document_data.',
    inputSchema: z.object({
      content: z.string().describe('Plain-text invoice content'),
    }),
    outputSchema: z.array(InvoiceLineItemSchema),
  })
  async extractInvoiceLineItems(
    input: { content: string },
    _ctx: ExecutionContext,
  ): Promise<InvoiceLineItem[]> {
    const schema = JSON.stringify(
      [{ sku: 'string', description: 'string', quantity: 'number', unitPrice: 'number', total: 'number' }],
    );
    return this.claude.completeAndParse(
      z.array(InvoiceLineItemSchema),
      EXTRACT_SYSTEM(schema),
      `Extract all line items from the following invoice:\n\n${input.content}`,
      'claude-haiku-20240307',
    );
  }

  // ── extract_document_data ────────────────────────────────────────────────

  @Tool({
    name: 'extract_document_data',
    description:
      'Extract structured invoice data from full document text. Calls extract_invoice_line_items internally.',
    inputSchema: z.object({
      content: z.string().describe('Full plain-text document content'),
      mimeType: z.string().default('text/plain').describe('MIME type, e.g. text/plain or application/pdf'),
    }),
    outputSchema: ExtractedInvoiceSchema,
  })
  async extractDocumentData(
    input: { content: string; mimeType: string },
    ctx: ExecutionContext,
  ): Promise<ExtractedInvoice> {
    // If PDF, NitroStack's util would convert it first — content arrives as text here
    const schema = JSON.stringify({
      invoiceNumber: 'string',
      poNumber: 'string',
      vendor: 'string',
      invoiceDate: 'ISO 8601 date string',
      totalAmount: 'number',
      lineItems: [{ sku: 'string', description: 'string', quantity: 'number', unitPrice: 'number', total: 'number' }],
    });

    return this.claude.completeAndParse(
      ExtractedInvoiceSchema,
      EXTRACT_SYSTEM(schema),
      `Extract all invoice data from the following document:\n\n${input.content}`,
      // Use Sonnet only for demo/verification — default Haiku for dev loop
      'claude-haiku-20240307',
    );
  }
}
