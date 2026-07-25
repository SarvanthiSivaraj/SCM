# ALE MCP Server — Validation Plan (SQLite)

Companion to the SQLite Production Extension Plan. Same module-by-module validation approach as before, with SQLite-specific additions around concurrency, backup/restore, and file-based deployment.

---

## 1. Validation Layers

| Layer | What it catches | Tooling |
|---|---|---|
| Schema/contract validation | Shape mismatches between tools | Zod, enforced at every tool boundary |
| Unit tests | Logic errors within a single tool (e.g., mismatch threshold math) | Standard test runner (Vitest/Jest) |
| Integration tests | Multi-step workflow breaks | Run against a seeded test SQLite file, not mocks, for DB-touching modules |
| Data validation | Faker/mock data drifting from real-world shapes | Schema diff between Faker-generated rows and real ERP export samples |
| Concurrency validation | SQLite single-writer contention, lock timeouts | Simulated concurrent write load against WAL-mode DB |
| Non-functional validation | Performance, security, reliability under load/failure | Load testing tool, chaos/failure injection, static security scan |
| Human review (compliance only) | Regulatory-risk decisions an LLM shouldn't finalize alone | Manual sign-off checklist, Section 5 |

---

## 2. Per-Module Validation

### Ingestion (`classify_document`, `extract_document_data`, `extract_invoice_line_items`)
- Golden-file test set: fixed sample invoices/POs/packing lists with known-correct expected output; diff against expected JSON on every change.
- Adversarial cases: blurry scans, non-English invoices, missing PO number, multi-page invoices — confirm graceful degradation (`low_confidence` flag, not a silent wrong answer).
- Schema conformance: 100% of extraction outputs pass Zod validation; track retry rate as a health metric.

### Master Data (`validate_against_master_data`, `recommend_hs_code`, seed data)
- Faker data parity check: compare statistical shape of Faker-seeded `purchase_orders` against a real-world sample export.
- HS code lookup accuracy: benchmark `recommend_hs_code` (FTS5 lookup + LLM fallback) against a labeled test set, track precision/recall.
- DB constraint tests: foreign key integrity (`PRAGMA foreign_keys = ON` actually enforced), duplicate PO number rejection.
- FTS5 index test: confirm `hs_code_fts` stays in sync with `hs_code_reference` after inserts/updates (SQLite FTS tables don't auto-sync without triggers — verify the sync trigger works).

### Orchestrator + Validation (`execute_workflow`, `match_invoice_to_po`, `flag_exception`, `route_task`)
- Full workflow integration tests for each SOP-defined path: happy match, price mismatch, quantity mismatch, missing PO, missing HS code, malformed extraction upstream.
- Idempotency test: same workflow input + same idempotency key run twice, confirm no duplicate exception/alert.
- SOP version test: change `sop_rules.yaml`, confirm the workflow picks up the new version and audit log records it.
- **Write-serialization test** (SQLite-specific): fire concurrent `execute_workflow` calls and confirm they queue/serialize through the single writer without silent failures or `SQLITE_BUSY` errors escaping to the caller — `busy_timeout` should absorb contention, not surface it as a tool error.

### Analytics & Reporting
- Numeric correctness: hand-calculate expected cycle time / exception rate / STP rate against a seeded dataset, assert exact match.
- Summary table freshness: confirm the scheduled worker actually refreshes `analytics_daily_summary` on schedule, and that tools reading it clearly report the `refreshed_at` timestamp rather than implying real-time data.
- Read/write isolation test: confirm a heavy analytics query doesn't block or slow down concurrent invoice-processing writes (validates the WAL-mode read/write separation).
- Filter correctness: date-range and vendor filters return exactly the expected subset on a seeded test dataset.

### Customs & Compliance
- Rule-version traceability: every `validate_compliance` result records which `compliance_rules` version applied; a rule change doesn't retroactively alter historical audit records.
- No-auto-clear test: confirm a flagged sanctions/denied-party match is never auto-approved by any workflow path.
- HS code / country-of-origin missing-data handling: confirm the workflow flags for review rather than guessing when required fields are absent.
- **This module requires a human sign-off checklist before go-live** (Section 5).

### Communication & Alerting
- Delivery confirmation test: send to a test inbox, confirm `alerts` table status progresses `queued → sent → delivered`.
- Failure/retry test: simulate provider outage, confirm retry/backoff fires and the alert lands in a dead-letter state rather than being silently dropped.
- Template rendering test: confirm all placeholder fields populate correctly for a range of real workflow outputs.
- Inbound ingestion test: send a test email with an attached invoice PDF, confirm classification and `execute_workflow` trigger correctly.
- Queue durability test (SQLite-specific): confirm `alerts_queue` entries survive a server restart mid-processing — no alert should be lost because the process died before the worker finished.

### AP Invoice Automation
- Three-way match test set: cases where PO/receipt/invoice all agree, and cases where each leg independently disagrees.
- Duplicate detection test: submit the same invoice twice, confirm it's caught before matching runs.
- Approval threshold test: invoices at, just above, and just below each threshold boundary route to the correct approver tier.
- Multi-currency test: invoice in a non-base currency correctly normalizes via `fx_rates` before matching.

---

## 3. Non-Functional Validation

| Area | Test approach | Pass criteria |
|---|---|---|
| Performance | Load test `execute_workflow` at expected peak invoice volume | p95 latency within agreed SLA; no sustained `SQLITE_BUSY` under expected concurrency |
| Security | Static scan + manual review of auth scopes per tool | No tool reachable without the correct OAuth scope; secrets never logged |
| Reliability | Kill the process / Claude API mid-workflow, confirm graceful failure | Workflow lands in `failed` status with a clear reason, not a silent hang or partial write |
| Observability | Trigger a known failure, confirm it's traceable end-to-end | Trace shows the full tool chain; error captured with enough context to debug without re-running |
| Auditability | Pull `audit_log` for a completed workflow | Every tool call in the chain is present, with input/output hashes and SOP/rule versions used |
| **Backup/restore** | Restore the SQLite file from a Litestream (or equivalent) backup into a clean environment | Restored DB matches the source at the backup point-in-time; no corruption, WAL replay succeeds |

---

## 4. Test Environments

- **Local/dev**: Faker-seeded SQLite file, Haiku for LLM calls, mocked email provider.
- **Staging** (NitroCloud): same schema as production, a mix of Faker data + a small real-data sample, Sonnet for extraction verification, real email provider pointed at a test inbox, WAL mode enabled to mirror production behavior.
- **Production**: real data only, production model tier, real email provider, full auth enforced, continuous backup running.

Promotion from staging to production requires all module-level tests green, the concurrency/write-serialization test green, plus the compliance sign-off checklist below.

---

## 5. Compliance Module Sign-Off Checklist (manual, required before go-live)

- [ ] Confirmed no workflow path can auto-clear a flagged compliance exception without human action.
- [ ] Confirmed every compliance decision logs the rule version applied.
- [ ] Confirmed HS code recommendations below a defined confidence threshold are routed to human review, not auto-applied.
- [ ] Reviewed a sample of at least 20 real (or realistic) customs entries end-to-end with a subject-matter reviewer, not just the engineering team.
- [ ] Confirmed rollback plan exists if a compliance rule change produces unexpected results in production.

---

## 6. Rollback / Incident Plan

- Snapshot the SQLite file (or confirm the latest Litestream restore point) immediately before any schema migration or major deploy — rollback means restoring that snapshot, not attempting to reverse-migrate live.
- `sop_rules.yaml` and `compliance_rules` changes are versioned and revertible independently of code/DB deploys.
- If an incident is found post-deploy: (1) halt new workflow executions for the affected path via a feature flag, not a full server takedown, (2) `audit_log` is the source of truth for identifying which historical records were affected, (3) fix forward with a new rule/schema version rather than mutating historical audit records.
- Because SQLite is a single file, a bad migration is unusually easy to fully undo (restore the file) — make sure that operational muscle memory is actually rehearsed once in staging, not just documented.

---

## 7. Ongoing Validation (post-launch)

- Weekly review of the Ingestion retry rate and Analytics STP rate — regressions here are the earliest signal of model drift, prompt drift, or upstream document format changes.
- Monthly Faker-vs-real data parity check.
- Monthly backup/restore drill — actually restore a recent backup into a scratch environment and verify it, rather than assuming Litestream (or equivalent) is working.
- Quarterly compliance rule review with whoever owns regulatory ownership of this system.
- Watch SQLite file size and WAL file growth over time — a WAL that never checkpoints down is a sign something is holding a long-running read transaction open and should be investigated.
