#!/usr/bin/env node
/**
 * scripts/seed-sqlite-cloud.ts
 *
 * Run once against your SQLite Cloud database to create the schema and
 * insert the 10 seed purchase orders.
 *
 * Usage:
 *   npx tsx scripts/seed-sqlite-cloud.ts
 *
 * Requires SQLITECLOUD_URL in your environment (or a .env file).
 */

import 'dotenv/config';
import { Database } from '@sqlitecloud/drivers';

const SEED_POS = [
  { poNumber: 'PO-001', vendor: 'Acme Corp',          sku: 'LAP-001', orderedQty: 10,  unitPrice: 999.00,  hsCode: '8471.30' },
  { poNumber: 'PO-002', vendor: 'Tech Supplies Ltd',  sku: 'BAT-002', orderedQty: 50,  unitPrice: 49.99,   hsCode: '8507.60' },
  { poNumber: 'PO-003', vendor: 'Global Parts Co',    sku: 'MON-003', orderedQty: 5,   unitPrice: 450.00,  hsCode: '8528.52' },
  // Intentional mismatch: same SKU as PO-001 but unitPrice is $10 (not $999) — used in exception test
  { poNumber: 'PO-004', vendor: 'Acme Corp',          sku: 'LAP-001', orderedQty: 10,  unitPrice: 10.00,   hsCode: '8471.30' },
  { poNumber: 'PO-005', vendor: 'Office Depot',       sku: 'CHR-005', orderedQty: 20,  unitPrice: 199.99,  hsCode: '9401.30' },
  { poNumber: 'PO-006', vendor: 'FastShip Logistics', sku: 'CAB-006', orderedQty: 200, unitPrice: 2.50,    hsCode: '8544.42' },
  { poNumber: 'PO-007', vendor: 'Tech Supplies Ltd',  sku: 'SSD-007', orderedQty: 30,  unitPrice: 89.99,   hsCode: '8471.70' },
  { poNumber: 'PO-008', vendor: 'Global Parts Co',    sku: 'KBD-008', orderedQty: 15,  unitPrice: 75.00,   hsCode: '8471.60' },
  { poNumber: 'PO-009', vendor: 'Acme Corp',          sku: 'MSE-009', orderedQty: 25,  unitPrice: 35.00,   hsCode: '8471.60' },
  { poNumber: 'PO-010', vendor: 'Office Depot',       sku: 'DSK-010', orderedQty: 8,   unitPrice: 299.99,  hsCode: '9403.10' },
];

async function main() {
  const url = process.env['SQLITECLOUD_URL'];
  if (!url) {
    console.error('❌  SQLITECLOUD_URL is not set. Check your .env file.');
    process.exit(1);
  }

  console.log('🔗  Connecting to SQLite Cloud…');
  const db = new Database(url);

  console.log('🏗   Creating purchase_orders table (if not exists)…');
  await db.sql(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      po_number   TEXT PRIMARY KEY,
      vendor      TEXT NOT NULL,
      sku         TEXT NOT NULL,
      ordered_qty INTEGER NOT NULL,
      unit_price  REAL NOT NULL,
      hs_code     TEXT NOT NULL
    )
  `);

  console.log('🌱  Seeding purchase orders…');
  let inserted = 0;
  for (const po of SEED_POS) {
    await db.sql(
      `INSERT OR IGNORE INTO purchase_orders
         (po_number, vendor, sku, ordered_qty, unit_price, hs_code)
       VALUES (?, ?, ?, ?, ?, ?)`,
      po.poNumber, po.vendor, po.sku, po.orderedQty, po.unitPrice, po.hsCode,
    );
    inserted++;
    console.log(`   ✓  ${po.poNumber}  ${po.vendor}  ${po.sku}`);
  }

  const rows = await db.sql<{ count: number }[]>('SELECT COUNT(*) AS count FROM purchase_orders');
  console.log(`\n✅  Done. ${inserted} rows attempted, ${rows[0]?.count ?? '?'} total rows in table.`);

  await db.close();
}

main().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
