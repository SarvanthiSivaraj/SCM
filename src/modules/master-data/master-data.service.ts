import { Injectable, OnModuleInit } from '@nitrostack/core';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseService } from '../../shared/database.service.js';
import type { PurchaseOrder, GoodsReceipt } from '../../shared/schemas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MASTER_JSON_PATH = join(__dirname, '..', '..', '..', 'data', 'master-data.json');

// ─── Seed data fallback ─────────────────────────────────────────────────────────

const FALLBACK_SEED_POS: PurchaseOrder[] = [
  { poNumber: 'PO-001', vendor: 'Acme Corp',          sku: 'LAP-001', orderedQty: 10,  unitPrice: 999.00,  hsCode: '8471.30' },
  { poNumber: 'PO-002', vendor: 'Tech Supplies Ltd',  sku: 'BAT-002', orderedQty: 50,  unitPrice: 49.99,   hsCode: '8507.60' },
  { poNumber: 'PO-003', vendor: 'Global Parts Co',    sku: 'MON-003', orderedQty: 5,   unitPrice: 450.00,  hsCode: '8528.52' },
  { poNumber: 'PO-004', vendor: 'Acme Corp',          sku: 'LAP-001', orderedQty: 10,  unitPrice: 10.00,   hsCode: '8471.30' },
  { poNumber: 'PO-005', vendor: 'Office Depot',       sku: 'CHR-005', orderedQty: 20,  unitPrice: 199.99,  hsCode: '9401.30' },
  { poNumber: 'PO-006', vendor: 'FastShip Logistics', sku: 'CAB-006', orderedQty: 200, unitPrice: 2.50,    hsCode: '8544.42' },
  { poNumber: 'PO-007', vendor: 'Tech Supplies Ltd',  sku: 'SSD-007', orderedQty: 30,  unitPrice: 89.99,   hsCode: '8471.70' },
  { poNumber: 'PO-008', vendor: 'Global Parts Co',    sku: 'KBD-008', orderedQty: 15,  unitPrice: 75.00,   hsCode: '8471.60' },
  { poNumber: 'PO-009', vendor: 'Acme Corp',          sku: 'MSE-009', orderedQty: 25,  unitPrice: 35.00,   hsCode: '8471.60' },
  { poNumber: 'PO-010', vendor: 'Office Depot',       sku: 'DSK-010', orderedQty: 8,   unitPrice: 299.99,  hsCode: '9403.10' },
];

function getSeedPOs(): PurchaseOrder[] {
  if (existsSync(MASTER_JSON_PATH)) {
    try {
      const content = readFileSync(MASTER_JSON_PATH, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.purchaseOrders) && parsed.purchaseOrders.length > 0) {
        return parsed.purchaseOrders as PurchaseOrder[];
      }
    } catch {
      console.warn('[MasterDataService] Could not parse master-data.json, using fallback seed POs.');
    }
  }
  return FALLBACK_SEED_POS;
}

// ─── Row → PurchaseOrder mapper ───────────────────────────────────────────────

function rowToPO(row: Record<string, unknown>): PurchaseOrder {
  return {
    poNumber:   row['po_number']   as string,
    vendor:     row['vendor']      as string,
    sku:        row['sku']         as string,
    orderedQty: row['ordered_qty'] as number,
    unitPrice:  row['unit_price']  as number,
    hsCode:     row['hs_code']     as string,
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class MasterDataService implements OnModuleInit {
  constructor(private readonly database: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    // purchase_orders table is created by MigrationService.
    // We seed here if empty (idempotent guard).
    const rows = (await this.database.sql(
      'SELECT COUNT(*) AS count FROM purchase_orders',
    )) as { count: number }[];
    if ((rows[0]?.count ?? 0) === 0) {
      await this.seedDatabase();
    }

    await this.seedFxRates();
    await this.seedApprovalThresholds();

    console.error('[MasterDataService] Ready ✓');
  }

  // ─── Seed ──────────────────────────────────────────────────────────────────

  private async seedDatabase(): Promise<void> {
    const seedPOs = getSeedPOs();
    for (const po of seedPOs) {
      await this.database.sql(
        `INSERT OR IGNORE INTO purchase_orders
           (po_number, vendor, sku, ordered_qty, unit_price, hs_code)
         VALUES (?, ?, ?, ?, ?, ?)`,
        po.poNumber, po.vendor, po.sku, po.orderedQty, po.unitPrice, po.hsCode,
      );
    }
    console.error(`[MasterDataService] Seeded ${seedPOs.length} purchase orders ✓`);
  }

  // ─── Query API ─────────────────────────────────────────────────────────────

  async findPO(poNumber: string): Promise<PurchaseOrder | null> {
    const rows = (await this.database.sql(
      'SELECT * FROM purchase_orders WHERE po_number = ?',
      poNumber,
    )) as Record<string, unknown>[];
    return rows.length > 0 ? rowToPO(rows[0]!) : null;
  }

  async findBySku(sku: string): Promise<PurchaseOrder | null> {
    const rows = (await this.database.sql(
      'SELECT * FROM purchase_orders WHERE sku = ? LIMIT 1',
      sku,
    )) as Record<string, unknown>[];
    return rows.length > 0 ? rowToPO(rows[0]!) : null;
  }

  async getAllPOs(): Promise<PurchaseOrder[]> {
    const rows = (await this.database.sql(
      'SELECT * FROM purchase_orders ORDER BY po_number',
    )) as Record<string, unknown>[];
    return rows.map(rowToPO);
  }

  // ─── AP Invoice: invoices table ────────────────────────────────────────────

  async upsertInvoice(params: {
    invoiceNumber: string;
    poNumber?: string;
    vendor: string;
    invoiceDate?: string;
    totalAmount?: number;
    currency?: string;
    status: string;
    idempotencyKey?: string;
  }): Promise<void> {
    await this.database.sql(
      `INSERT INTO invoices
         (invoice_number, po_number, vendor, invoice_date, total_amount, currency, status, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(invoice_number) DO UPDATE SET
         status           = excluded.status,
         total_amount     = excluded.total_amount,
         idempotency_key  = excluded.idempotency_key`,
      params.invoiceNumber,
      params.poNumber ?? null,
      params.vendor,
      params.invoiceDate ?? null,
      params.totalAmount ?? null,
      params.currency ?? 'USD',
      params.status,
      params.idempotencyKey ?? null,
    );
  }

  async findInvoice(invoiceNumber: string): Promise<Record<string, unknown> | null> {
    const rows = (await this.database.sql(
      'SELECT * FROM invoices WHERE invoice_number = ?',
      invoiceNumber,
    )) as Record<string, unknown>[];
    return rows[0] ?? null;
  }

  async listInvoices(params: { status?: string; vendor?: string; limit?: number; offset?: number }): Promise<Record<string, unknown>[]> {
    const conditions: string[] = [];
    const args: unknown[] = [];

    if (params.status) { conditions.push('status = ?'); args.push(params.status); }
    if (params.vendor) { conditions.push('vendor = ?'); args.push(params.vendor); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    args.push(params.limit ?? 50);
    args.push(params.offset ?? 0);

    return (await this.database.sql(
      `SELECT * FROM invoices ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      ...args,
    )) as Record<string, unknown>[];
  }

  async detectDuplicate(invoiceNumber: string, vendor: string, totalAmount: number): Promise<boolean> {
    const rows = (await this.database.sql(
      `SELECT COUNT(*) AS cnt FROM invoices
       WHERE invoice_number = ? AND vendor = ? AND ABS(total_amount - ?) < 0.01
         AND created_at >= datetime('now', '-30 days')`,
      invoiceNumber, vendor, totalAmount,
    )) as { cnt: number }[];
    return (rows[0]?.cnt ?? 0) > 0;
  }

  // ─── AP Invoice: invoice_line_items table ──────────────────────────────────

  async insertLineItems(invoiceNumber: string, items: Array<{
    sku: string; description: string; quantity: number; unitPrice: number; total: number;
  }>): Promise<void> {
    for (const item of items) {
      await this.database.sql(
        `INSERT INTO invoice_line_items (invoice_number, sku, description, quantity, unit_price, total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        invoiceNumber, item.sku, item.description, item.quantity, item.unitPrice, item.total,
      );
    }
  }

  // ─── AP Invoice: goods_receipts table ─────────────────────────────────────

  async insertGoodsReceipt(gr: Omit<GoodsReceipt, 'id'>): Promise<void> {
    await this.database.sql(
      `INSERT INTO goods_receipts (po_number, sku, received_qty, received_date)
       VALUES (?, ?, ?, ?)`,
      gr.poNumber, gr.sku, gr.receivedQty, gr.receivedDate,
    );
  }

  async findGoodsReceipt(poNumber: string, sku: string): Promise<GoodsReceipt | null> {
    const rows = (await this.database.sql(
      `SELECT * FROM goods_receipts WHERE po_number = ? AND sku = ?
       ORDER BY received_date DESC LIMIT 1`,
      poNumber, sku,
    )) as Record<string, unknown>[];
    if (rows.length === 0) return null;
    const r = rows[0]!;
    return {
      id: r['id'] as number,
      poNumber: r['po_number'] as string,
      sku: r['sku'] as string,
      receivedQty: r['received_qty'] as number,
      receivedDate: r['received_date'] as string,
    };
  }

  // ─── AP Invoice: exceptions table ─────────────────────────────────────────

  async insertException(params: {
    workflowId: string;
    invoiceNumber?: string;
    reason: string;
    discrepancies?: string[];
  }): Promise<number> {
    await this.database.sql(
      `INSERT INTO exceptions (workflow_id, invoice_number, reason, discrepancies)
       VALUES (?, ?, ?, ?)`,
      params.workflowId,
      params.invoiceNumber ?? null,
      params.reason,
      JSON.stringify(params.discrepancies ?? []),
    );
    const rows = (await this.database.sql('SELECT last_insert_rowid() AS id')) as { id: number }[];
    return rows[0]?.id ?? -1;
  }

  // ─── AP Invoice: audit_log table ──────────────────────────────────────────

  async appendAuditLog(params: {
    workflowId: string;
    toolName: string;
    inputHash: string;
    outputHash: string;
    actor?: string;
    payload?: unknown;
  }): Promise<number> {
    await this.database.sql(
      `INSERT INTO audit_log (workflow_id, tool_name, input_hash, output_hash, actor, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
      params.workflowId,
      params.toolName,
      params.inputHash,
      params.outputHash,
      params.actor ?? 'system',
      params.payload !== undefined ? JSON.stringify(params.payload) : null,
    );
    const rows = (await this.database.sql('SELECT last_insert_rowid() AS id')) as { id: number }[];
    return rows[0]?.id ?? -1;
  }

  async findAuditLogByIdempotencyKey(workflowId: string, toolName: string): Promise<Record<string, unknown> | null> {
    const rows = (await this.database.sql(
      `SELECT * FROM audit_log WHERE workflow_id = ? AND tool_name = ? ORDER BY id DESC LIMIT 1`,
      workflowId, toolName,
    )) as Record<string, unknown>[];
    return rows[0] ?? null;
  }

  // ─── AP Invoice: fx_rates table ───────────────────────────────────────────

  async findFxRate(currencyPair: string): Promise<number | null> {
    const rows = (await this.database.sql(
      'SELECT rate FROM fx_rates WHERE currency_pair = ?',
      currencyPair,
    )) as { rate: number }[];
    return rows[0]?.rate ?? null;
  }

  private async seedFxRates(): Promise<void> {
    const defaults: Array<[string, number]> = [
      ['USD/USD', 1.0],
      ['EUR/USD', 1.09],
      ['GBP/USD', 1.27],
      ['JPY/USD', 0.0067],
      ['CAD/USD', 0.74],
      ['AUD/USD', 0.65],
      ['INR/USD', 0.012],
      ['CNY/USD', 0.14],
    ];
    for (const [pair, rate] of defaults) {
      await this.database.sql(
        `INSERT OR IGNORE INTO fx_rates (currency_pair, rate, as_of_date) VALUES (?, ?, ?)`,
        pair, rate, new Date().toISOString().slice(0, 10),
      );
    }
  }

  // ─── AP Invoice: approval_thresholds table ────────────────────────────────

  async getApprovalThreshold(amount: number): Promise<{ role: string } | null> {
    const rows = (await this.database.sql(
      `SELECT required_approver_role FROM approval_thresholds
       WHERE min_amount <= ? AND (max_amount IS NULL OR max_amount > ?)
       ORDER BY min_amount ASC LIMIT 1`,
      amount, amount,
    )) as { required_approver_role: string }[];
    return rows[0] ? { role: rows[0].required_approver_role } : null;
  }

  private async seedApprovalThresholds(): Promise<void> {
    const count = (await this.database.sql(
      'SELECT COUNT(*) AS cnt FROM approval_thresholds',
    )) as { cnt: number }[];
    if ((count[0]?.cnt ?? 0) > 0) return; // already seeded

    const defaults: Array<[number, number | null, string]> = [
      [0,      5_000,   'auto'],
      [5_000,  50_000,  'finance_manager'],
      [50_000, null,    'cfo'],
    ];
    for (const [min, max, role] of defaults) {
      await this.database.sql(
        `INSERT INTO approval_thresholds (min_amount, max_amount, required_approver_role) VALUES (?, ?, ?)`,
        min, max, role,
      );
    }
  }
}
