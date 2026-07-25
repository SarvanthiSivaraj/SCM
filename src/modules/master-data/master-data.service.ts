import { Injectable, OnModuleInit } from '@nitrostack/core';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseService } from '../../shared/database.service.js';
import type { PurchaseOrder } from '../../shared/schemas.js';

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
    // purchase_orders table is created by MigrationService (v1).
    // We only seed here if the table is empty (idempotent guard).
    const rows = (await this.database.sql(
      'SELECT COUNT(*) AS count FROM purchase_orders',
    )) as { count: number }[];
    if ((rows[0]?.count ?? 0) === 0) {
      await this.seedDatabase();
    }
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
}
