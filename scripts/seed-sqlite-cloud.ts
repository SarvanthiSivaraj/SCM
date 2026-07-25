#!/usr/bin/env node
/**
 * scripts/seed-sqlite-cloud.ts
 *
 * Run once against your SQLite Cloud database to create the schema and
 * insert the mock data for all 12 tables.
 *
 * Usage:
 *   npx tsx scripts/seed-sqlite-cloud.ts
 *
 * Requires SQLITECLOUD_URL in your environment (or a .env file).
 */

import 'dotenv/config';
import { Database } from '@sqlitecloud/drivers';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MASTER_JSON_PATH = join(__dirname, '..', 'data', 'master-data.json');

const DDL = [
  "DROP TABLE IF EXISTS invoice_line_items",
  "DROP TABLE IF EXISTS exceptions",
  "DROP TABLE IF EXISTS goods_receipts",
  "DROP TABLE IF EXISTS invoices",
  "DROP TABLE IF EXISTS purchase_orders",
  "DROP TABLE IF EXISTS audit_log",
  "DROP TABLE IF EXISTS hs_code_fts",
  "DROP TABLE IF EXISTS hs_code_reference",
  "DROP TABLE IF EXISTS compliance_rules",
  "DROP TABLE IF EXISTS alerts",
  "DROP TABLE IF EXISTS fx_rates",
  "DROP TABLE IF EXISTS approval_thresholds",
  "DROP TABLE IF EXISTS analytics_daily_summary",

  `CREATE TABLE purchase_orders (po_number TEXT PRIMARY KEY, vendor TEXT NOT NULL, sku TEXT NOT NULL, ordered_qty INTEGER NOT NULL, unit_price REAL NOT NULL, hs_code TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE invoices (invoice_number TEXT PRIMARY KEY, po_number TEXT REFERENCES purchase_orders(po_number), vendor TEXT NOT NULL, invoice_date TEXT, total_amount REAL, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE invoice_line_items (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_number TEXT REFERENCES invoices(invoice_number), sku TEXT, description TEXT, quantity INTEGER, unit_price REAL, total REAL)`,
  `CREATE TABLE goods_receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, po_number TEXT REFERENCES purchase_orders(po_number), sku TEXT, received_qty INTEGER, received_date TEXT)`,
  `CREATE TABLE exceptions (id INTEGER PRIMARY KEY AUTOINCREMENT, workflow_id TEXT, invoice_number TEXT REFERENCES invoices(invoice_number), reason TEXT, discrepancies TEXT, status TEXT DEFAULT 'flagged', created_at TEXT DEFAULT (datetime('now')), resolved_at TEXT)`,
  `CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, workflow_id TEXT, tool_name TEXT, input_hash TEXT, output_hash TEXT, actor TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE hs_code_reference (hs_code TEXT PRIMARY KEY, description TEXT, keywords TEXT)`,
  `CREATE VIRTUAL TABLE hs_code_fts USING fts5(hs_code, description, keywords)`,
  `CREATE TABLE compliance_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, rule_type TEXT, rule_definition TEXT, version INTEGER, effective_date TEXT)`,
  `CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient TEXT, template TEXT, status TEXT, payload TEXT, created_at TEXT DEFAULT (datetime('now')), delivered_at TEXT)`,
  `CREATE TABLE fx_rates (currency_pair TEXT PRIMARY KEY, rate REAL, as_of_date TEXT)`,
  `CREATE TABLE approval_thresholds (id INTEGER PRIMARY KEY AUTOINCREMENT, min_amount REAL, max_amount REAL, required_approver_role TEXT)`,
  `CREATE TABLE analytics_daily_summary (date TEXT PRIMARY KEY, invoice_count INTEGER, exception_count INTEGER, avg_cycle_time_minutes REAL, stp_rate REAL, refreshed_at TEXT)`
];

async function main() {
  const url = process.env['SQLITECLOUD_URL'];
  if (!url) {
    console.error('❌  SQLITECLOUD_URL is not set. Check your .env file.');
    process.exit(1);
  }

  console.log('🔗  Connecting to SQLite Cloud…');
  const db = new Database(url);

  console.log('🏗   Applying Schema (dropping existing tables)...');
  for (const query of DDL) {
    await db.sql(query);
  }

  if (!existsSync(MASTER_JSON_PATH)) {
    console.error(`❌  ${MASTER_JSON_PATH} not found.`);
    process.exit(1);
  }

  console.log('📖  Reading master-data.json...');
  const data = JSON.parse(readFileSync(MASTER_JSON_PATH, 'utf-8'));

  // 1. purchase_orders
  if (data.purchaseOrders) {
    console.log(`🌱  Seeding ${data.purchaseOrders.length} purchase_orders...`);
    for (const row of data.purchaseOrders) {
      await db.sql(
        `INSERT INTO purchase_orders (po_number, vendor, sku, ordered_qty, unit_price, hs_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        row.poNumber, row.vendor, row.sku, row.orderedQty, row.unitPrice, row.hsCode, row.createdAt
      );
    }
  }

  // 2. invoices
  if (data.invoices) {
    console.log(`🌱  Seeding ${data.invoices.length} invoices...`);
    for (const row of data.invoices) {
      await db.sql(
        `INSERT INTO invoices (invoice_number, po_number, vendor, invoice_date, total_amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        row.invoiceNumber, row.poNumber, row.vendor, row.invoiceDate, row.totalAmount, row.status, row.createdAt
      );
    }
  }

  // 3. invoice_line_items
  if (data.invoiceLineItems) {
    console.log(`🌱  Seeding ${data.invoiceLineItems.length} invoice_line_items...`);
    for (const row of data.invoiceLineItems) {
      await db.sql(
        `INSERT INTO invoice_line_items (invoice_number, sku, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?)`,
        row.invoiceNumber, row.sku, row.description, row.quantity, row.unitPrice, row.total
      );
    }
  }

  // 4. goods_receipts
  if (data.goodsReceipts) {
    console.log(`🌱  Seeding ${data.goodsReceipts.length} goods_receipts...`);
    for (const row of data.goodsReceipts) {
      await db.sql(
        `INSERT INTO goods_receipts (po_number, sku, received_qty, received_date) VALUES (?, ?, ?, ?)`,
        row.poNumber, row.sku, row.receivedQty, row.receivedDate
      );
    }
  }

  // 5. exceptions
  if (data.exceptions) {
    console.log(`🌱  Seeding ${data.exceptions.length} exceptions...`);
    for (const row of data.exceptions) {
      await db.sql(
        `INSERT INTO exceptions (workflow_id, invoice_number, reason, discrepancies, status, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        row.workflowId, row.invoiceNumber, row.reason, row.discrepancies, row.status, row.createdAt, row.resolvedAt
      );
    }
  }

  // 6. audit_log
  if (data.auditLog) {
    console.log(`🌱  Seeding ${data.auditLog.length} audit_log...`);
    for (const row of data.auditLog) {
      await db.sql(
        `INSERT INTO audit_log (workflow_id, tool_name, input_hash, output_hash, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        row.workflowId, row.toolName, row.inputHash, row.outputHash, row.actor, row.createdAt
      );
    }
  }

  // 7. hs_code_reference
  if (data.hsCodeReference) {
    console.log(`🌱  Seeding ${data.hsCodeReference.length} hs_code_reference...`);
    for (const row of data.hsCodeReference) {
      await db.sql(
        `INSERT INTO hs_code_reference (hs_code, description, keywords) VALUES (?, ?, ?)`,
        row.hsCode, row.description, row.keywords
      );
      await db.sql(
        `INSERT INTO hs_code_fts (hs_code, description, keywords) VALUES (?, ?, ?)`,
        row.hsCode, row.description, row.keywords
      );
    }
  }

  // 8. compliance_rules
  if (data.complianceRules) {
    console.log(`🌱  Seeding ${data.complianceRules.length} compliance_rules...`);
    for (const row of data.complianceRules) {
      await db.sql(
        `INSERT INTO compliance_rules (rule_type, rule_definition, version, effective_date) VALUES (?, ?, ?, ?)`,
        row.ruleType, row.ruleDefinition, row.version, row.effectiveDate
      );
    }
  }

  // 9. alerts
  if (data.alerts) {
    console.log(`🌱  Seeding ${data.alerts.length} alerts...`);
    for (const row of data.alerts) {
      await db.sql(
        `INSERT INTO alerts (recipient, template, status, payload, created_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?)`,
        row.recipient, row.template, row.status, row.payload, row.createdAt, row.deliveredAt
      );
    }
  }

  // 10. fx_rates
  if (data.fxRates) {
    console.log(`🌱  Seeding ${data.fxRates.length} fx_rates...`);
    for (const row of data.fxRates) {
      await db.sql(
        `INSERT INTO fx_rates (currency_pair, rate, as_of_date) VALUES (?, ?, ?)`,
        row.currencyPair, row.rate, row.asOfDate
      );
    }
  }

  // 11. approval_thresholds
  if (data.approvalThresholds) {
    console.log(`🌱  Seeding ${data.approvalThresholds.length} approval_thresholds...`);
    for (const row of data.approvalThresholds) {
      await db.sql(
        `INSERT INTO approval_thresholds (min_amount, max_amount, required_approver_role) VALUES (?, ?, ?)`,
        row.minAmount, row.maxAmount, row.requiredApproverRole
      );
    }
  }

  // 12. analytics_daily_summary
  if (data.analyticsDailySummary) {
    console.log(`🌱  Seeding ${data.analyticsDailySummary.length} analytics_daily_summary...`);
    for (const row of data.analyticsDailySummary) {
      await db.sql(
        `INSERT INTO analytics_daily_summary (date, invoice_count, exception_count, avg_cycle_time_minutes, stp_rate, refreshed_at) VALUES (?, ?, ?, ?, ?, ?)`,
        row.date, row.invoiceCount, row.exceptionCount, row.avgCycleTimeMinutes, row.stpRate, row.refreshedAt
      );
    }
  }

  console.log(`\n✅  Database Seeded in SQLite Cloud successfully!`);
  await db.close();
}

main().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
