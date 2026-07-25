# ALE MCP Server — Production Extension Plan (SQLite)

Same scope as before — extending the 12-hour vertical slice into a production-grade MCP server on NitroStack — but staying on **SQLite** instead of moving to Postgres. Assumes the hackathon foundation exists: `purchase_orders` table seeded via Python Faker, `execute_workflow` / `match_invoice_to_po` / `validate_against_master_data` working.

New modules (Analytics, Customs & Compliance, Communication & Alerting, AP Invoice Automation) are unchanged from the prior plan. What changes is the data layer and a few production-hardening details that follow from staying on SQLite.

---

## 1. Current State → Production Gaps

| Hackathon choice | Production requirement (SQLite-friendly) |
|---|---|
| SQLite/JSON master data | Same SQLite file, but with WAL mode, foreign keys enforced, proper indexes, and a real migration tool instead of ad-hoc scripts |
| Faker mock `purchase_orders` | Keep Faker for seed/demo data; add a real ingestion path (CSV/ERP import) writing into the same schema |
| API-key guard only | OAuth 2.1 / scoped API keys per client, rate limiting |
| `exceptions.json` file | `exceptions` table with a status lifecycle, not a flat file |
| `route_task` stubbed (console log) | Real email delivery + retry/dead-letter handling |
| No observability | Structured logs, request tracing, metrics, error tracking |
| No idempotency | Idempotency keys on all mutating tools so re-running a workflow doesn't double-post |
| Single-shot LLM calls, no fallback | Retry policy, timeout, circuit breaker on LLM calls; fallback to human review queue on repeated failure |
| No audit trail | Immutable `audit_log` table, append-only, every tool call logged with input/output hash |
| No concurrency plan | SQLite is single-writer — see Section 8 for how the orchestrator handles this in production |

---

## 2. New Module: Analytics & Reporting

### Feature ideas
- Shipment/invoice throughput dashboards (volume by day/week, by vendor, by lane)
- Cycle-time analytics: invoice receipt → auto-approval or exception resolution
- Exception rate & root-cause breakdown (price mismatch vs qty mismatch vs missing PO vs missing HS code)
- Vendor scorecards (mismatch rate per vendor)
- Straight-through-processing (STP) rate as a tracked KPI over time
- Cost/token spend analytics — LLM spend per invoice processed
- Anomaly flags — sudden spike in a vendor's invoice amounts vs historical average
- Exportable reports (CSV/PDF) for finance close periods

### Recommended scope for first production release
- `get_invoice_analytics(filters)` — volume, cycle time, exception rate, filterable by date range/vendor
- `get_exception_breakdown(filters)` — grouped by discrepancy type
- `get_vendor_scorecard(vendorId)` — mismatch rate, average cycle time, invoice count
- `audit_transaction(transactionId)` — full trace of a single workflow run, backed by the real `audit_log` table

### Implementation notes (SQLite-specific)
- SQLite has no native materialized views. Replicate the effect with **summary tables** (e.g., `analytics_daily_summary`) refreshed by a scheduled worker job (cron or a NitroStack background task) every 15 minutes, and have analytics tools query the summary table instead of aggregating raw rows live.
- Keep analytics reads on a **separate read connection** from the orchestrator's write connection where possible, so a heavy analytics query doesn't hold up invoice-processing writes.
- Don't put analytics behind an LLM call — pure SQL, structured JSON out. Reserve Claude for narrative summaries only if explicitly asked.

---

## 3. New Module: Customs & Compliance

### Feature ideas
- Real `recommend_hs_code` backed by an actual HS/HTS reference table (seeded and maintained, not the canned mock)
- `validate_compliance(entry, rules)` — checks against a rules table (restricted commodities, denied-party screening, country-specific documentation requirements)
- `prepare_customs_entry(shipmentId)` — consolidates invoice + PO + product master data into a customs-entry-ready JSON payload
- Denied Party Screening (DPS) — cross-check vendor/consignee names against sanctions lists (OFAC, EU consolidated list) if this ever touches real trade data
- Country-of-origin / preferential trade agreement eligibility check (e.g., USMCA)
- `sync_with_customs_system(entry)` — mock adapter for now, designed so a real broker API can be swapped in later without changing the tool contract

### Recommended scope for first production release
- `recommend_hs_code` — real lookup against a seeded `hs_code_reference` table (SQLite FTS5 for keyword search over descriptions), confidence score, LLM-assisted fallback only when the FTS match is weak
- `validate_compliance` — rule-based checks first (missing HS code, missing country of origin, value threshold flags); extend to sanctions screening once a real data source exists
- `prepare_customs_entry` — pure data consolidation tool, no external filing yet

### Compliance-specific production requirement
- Every compliance decision logs the rule version that produced it — `compliance_rules` is versioned, never mutated in place.
- No LLM is the sole decision-maker on a sanctions/denied-party match — always routed to human review, never auto-cleared.

---

## 4. New Module: Communication & Alerting (Email)

### Feature ideas
- Real email sending for `route_task` (replacing the console-log stub)
- Inbound email ingestion — parse incoming operational emails and feed attachments into `execute_workflow`
- Digest/summary emails — daily digest of exceptions needing attention
- Slack/Teams webhook alerts as an alternative channel
- SLA-based escalation — unresolved exception past N hours escalates to a manager
- Templated, versioned emails per notification type

### Recommended scope for first production release
- `send_alert(recipient, template, data)` — real SMTP/transactional-email-provider integration (SES, Postmark, SendGrid), template-based, logged to an `alerts` table
- `ingest_email_inbox(inboxId)` — polls or webhook-receives an inbox, classifies attachments via existing `classify_document`, triggers `execute_workflow`
- Retry + dead-letter queue for failed sends

### Implementation notes
- Treat this as queue-backed, not synchronous — `send_alert` enqueues into a `alerts_queue` table and returns immediately; a worker processes it with retries. This avoids holding a SQLite write lock open while waiting on a slow network call to an email provider.
- Log every alert's delivery status (`queued` → `sent` → `delivered`/`failed`).

---

## 5. New Module: AP Invoice Automation (deepened)

### Feature ideas
- Full three-way match: PO ↔ Goods Receipt ↔ Invoice
- Accrual reconciliation against pre-booked estimates
- Multi-currency support via an `fx_rates` table
- Duplicate invoice detection (same invoice number/vendor/amount within a window)
- Approval routing by dollar threshold
- Payment status tracking (sent to payment vs paid)
- Vendor self-service status lookup tool

### Recommended scope for first production release
- `match_invoice_to_po` — extend to three-way match if goods-receipt data is available; degrade gracefully to two-way match otherwise, with a flag noting the partial match
- `process_ap_invoice` — full pipeline: extract → match → accrual check → route for approval or auto-approve based on threshold rules (`sop_rules.yaml`, extended with `approval_thresholds`)
- Duplicate detection as a cheap guard inside `process_ap_invoice`, before matching runs

---

## 6. Updated Data Model (SQLite)

```sql
-- existing, hardened
CREATE TABLE purchase_orders (
  po_number TEXT PRIMARY KEY,
  vendor TEXT NOT NULL,
  sku TEXT NOT NULL,
  ordered_qty INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  hs_code TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE invoices (
  invoice_number TEXT PRIMARY KEY,
  po_number TEXT REFERENCES purchase_orders(po_number),
  vendor TEXT NOT NULL,
  invoice_date TEXT,
  total_amount REAL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE invoice_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT REFERENCES invoices(invoice_number),
  sku TEXT, description TEXT, quantity INTEGER, unit_price REAL, total REAL
);

-- new
CREATE TABLE goods_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number TEXT REFERENCES purchase_orders(po_number),
  sku TEXT, received_qty INTEGER, received_date TEXT
);

CREATE TABLE exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT,
  invoice_number TEXT REFERENCES invoices(invoice_number),
  reason TEXT,
  discrepancies TEXT, -- JSON array, use SQLite json1 functions to query
  status TEXT DEFAULT 'flagged',
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE audit_log ( -- append-only, never UPDATE or DELETE
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT,
  tool_name TEXT,
  input_hash TEXT,
  output_hash TEXT,
  actor TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE hs_code_reference (
  hs_code TEXT PRIMARY KEY,
  description TEXT,
  keywords TEXT -- space-separated, indexed via FTS5 virtual table
);
CREATE VIRTUAL TABLE hs_code_fts USING fts5(hs_code, description, keywords);

CREATE TABLE compliance_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_type TEXT,
  rule_definition TEXT, -- JSON
  version INTEGER,
  effective_date TEXT
);

CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT, template TEXT, status TEXT,
  payload TEXT, -- JSON
  created_at TEXT DEFAULT (datetime('now')),
  delivered_at TEXT
);

CREATE TABLE fx_rates (
  currency_pair TEXT PRIMARY KEY,
  rate REAL,
  as_of_date TEXT
);

CREATE TABLE approval_thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  min_amount REAL, max_amount REAL, required_approver_role TEXT
);

-- analytics summary table, refreshed by scheduled worker (no native materialized views in SQLite)
CREATE TABLE analytics_daily_summary (
  date TEXT PRIMARY KEY,
  invoice_count INTEGER,
  exception_count INTEGER,
  avg_cycle_time_minutes REAL,
  stp_rate REAL,
  refreshed_at TEXT
);
```

Pragmas to set at connection time:
```sql
PRAGMA journal_mode = WAL;       -- allows concurrent readers alongside a writer
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;      -- avoid immediate "database is locked" errors
```

Keep `purchase_orders` Faker-seedable as-is for demo/staging; production ingestion writes to the same table via a real import tool, one schema, two data sources.

---

## 7. Updated Architecture

```
                         ┌────────────────────┐
   inbound email ───────▶│ Communication Module│───▶ alerts / escalations (queued)
                         └─────────┬───────────┘
                                   │
docs/email attachments ──▶ Ingestion Module ──▶ Orchestrator ──▶ Validation Module
                                                     │                 │
                                                     ▼                 ▼
                                          AP Invoice Automation   Master Data
                                                     │             (SQLite, WAL mode)
                                                     ▼                 │
                                        Customs & Compliance ◀─────────┘
                                                     │
                                                     ▼
                                 Analytics & Reporting (reads summary tables)
                                                     │
                                                     ▼
                                        audit_log (all modules write here)
```

---

## 8. Cross-Cutting Production Requirements

- **Auth**: OAuth 2.1 with scopes per module (e.g., `compliance:write` restricted more tightly than `analytics:read`).
- **Observability**: structured JSON logs per tool call, tracing across the orchestrator's multi-step workflow, error tracking for LLM parse failures and DB errors.
- **Idempotency**: every mutating tool accepts an idempotency key; re-invoking `execute_workflow` for the same invoice doesn't create duplicate exceptions or alerts.
- **Resilience**: retries with backoff on Claude API and email provider calls; circuit breaker so a provider outage degrades to a queued/pending state.
- **Secrets**: real secrets manager (Vault, cloud provider secrets store, or NitroCloud's equivalent) — no `.env` in production.
- **Versioning**: tool contracts, `sop_rules.yaml`, and `compliance_rules` are versioned; a workflow run records which version it executed under.

### SQLite-specific production considerations
- **Single writer**: SQLite allows one writer at a time. Serialize writes through the orchestrator (a single write-owning process/worker) rather than letting every tool open its own write connection concurrently. WAL mode lets reads (analytics, status lookups) proceed without blocking on the writer.
- **Backups**: SQLite is a single file — back it up continuously with a tool like Litestream (streams WAL changes to object storage) rather than relying on periodic file copies, which can catch a file mid-write.
- **Scaling ceiling**: SQLite is genuinely fine for the write volumes a single invoice-processing pipeline generates. If this ever needs multiple concurrent writer processes across machines (not just concurrent readers), that's the signal to revisit Postgres — but don't pre-optimize for that until the volume actually demands it.
- **Migrations**: use a real migration tool (e.g., a Node-based migration runner compatible with SQLite) with numbered, reversible migration files — not ad-hoc `ALTER TABLE` scripts run by hand.

---

## 9. Phased Rollout

| Phase | Focus | Depends on |
|---|---|---|
| 0 | Harden existing slice: WAL mode, migrations, audit_log, idempotency, real auth | — |
| 1 | Analytics (read-only, lowest risk, no new write paths) | Phase 0 |
| 2 | Communication & Alerting (real email, queue-backed) | Phase 0 |
| 3 | AP Invoice Automation deepening (three-way match, approval thresholds) | Phase 0, benefits from Phase 1 analytics for threshold tuning |
| 4 | Customs & Compliance (highest regulatory risk, do last, most review needed) | Phase 0, Phase 3 |

Sequencing rationale unchanged from the Postgres version: analytics and alerting are additive and lower-risk; compliance carries real regulatory consequences, so it goes last and gets the most scrutiny.
