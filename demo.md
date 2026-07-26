# Advanced Agentic Supply Chain (ALE MCP Server) - Demo Script

Welcome to the demo of the **ALE Supply Chain Management MCP Server**. This project demonstrates an advanced, agentic AI architecture designed to autonomously process accounts payable (AP) invoices, enforce corporate compliance, route approvals based on financial thresholds, and provide real-time operational analytics—all without human intervention unless an exception occurs.

## 🌍 The Problem Statement
Globally, mid-to-large enterprises process millions of Accounts Payable (AP) invoices and supply chain documents annually. 
**The current gap in the market:** These processes are highly manual, error-prone, and bottlenecked by rigid legacy ERP systems (like SAP or Oracle). 
When an invoice arrives with a price mismatch or from a flagged vendor, human accountants must manually cross-reference purchase orders (POs), goods receipts, and compliance databases (e.g., denied parties lists). This manual "stare-and-compare" leads to:
1. **High Processing Costs:** Processing a single invoice costs an average of $15 to $40.
2. **SLA Breaches & Late Fees:** Bottlenecks lead to missed early-payment discounts and incurred late penalties.
3. **Compliance Risks:** Manual compliance checks are often skipped under pressure, exposing companies to massive regulatory fines.

## 🚀 The Novelty: Agentic Supply Chain Orchestration
Traditional automation relies on fragile rules and OCR templates (RPA). This project introduces a paradigm shift: **Agentic Supply Chain Orchestration**. 
By exposing the core ERP business logic directly to a Large Language Model (LLM) via the **Model Context Protocol (MCP)**, the AI acts as an autonomous financial analyst. 

**Why this is a game-changer:**
- **Dynamic Reasoning:** The AI doesn't just read data; it actively chains tools to *reason*. If a vendor is blocked, it knows to halt the invoice. If there is a price mismatch, it automatically logs a discrepancy and triggers a review workflow.
- **Zero-UI Backoffice:** Humans only intervene when the AI explicitly escalates a complex exception (Management by Exception).

## 💰 Return on Investment (Time & Money Saved)
For an enterprise processing 100,000 invoices annually:
- **Financial Savings:** Slashing the cost per invoice from $15 to under $1.50 saves **~$1.35 million per year**.
- **Time Savings:** Reducing manual processing time from 10 days to under 10 seconds per invoice entirely eliminates the backlog, recovering thousands of human hours for strategic financial planning.
- **Risk Mitigation:** 100% automated, zero-trust screening for every vendor prevents multi-million dollar sanctions.

---

## 🎬 Demo Commands (Prompts)

Here are 5 powerful prompts you can paste into your MCP client (like Claude Desktop or NitroStudio) to showcase the capabilities of the system. Each command requires the AI to chain multiple tools and reason about the company's master data.

### Command 1: The "Happy Path" with Financial Thresholds
**Prompt:**
> *"I just received invoice INV-999 for PO-001 from Acme Corp. They are billing us for 10 units of LAP-001 at $999.00 each. Can you process this invoice into the system and tell me what the next steps are?"*

**Behind the Scenes (Tool Calling):**
1. The AI extracts the structured data from natural language.
2. It calls the `submitInvoice` tool.
3. The server internally fetches **PO-001** from the ERP Adapter to validate the vendor (Acme Corp) and the agreed unit price ($999.00).
4. The server calculates the total ($9,990) and checks the `approval_thresholds` table.
5. **Result:** The AI explains that the invoice is valid but exceeds the $5,000 auto-approval threshold. It correctly notes that the invoice is now in `pending_approval` status and has been routed to the `finance_manager`.

---

### Command 2: Compliance Screening & Historical Risk
**Prompt:**
> *"Before we sign a new contract with 'Blake and Sons Restricted 5', can you run a compliance screen on them? While you're at it, pull up their historical vendor scorecard to see our past exception rates with them."*

**Behind the Scenes (Tool Calling):**
1. The AI calls `screenVendor` (ComplianceTools) to check the entity against the denied parties list.
2. The AI concurrently calls `getVendorScorecard` (AnalyticsTools) to fetch past operational metrics.
3. **Result:** The AI alerts you that `Blake and Sons Restricted 5` is **BLOCKED** due to Export Violations (based on our mock ERP data). It provides the scorecard but strongly advises against doing business with them.

---

### Command 3: The "Discrepancy" Exception Flow
**Prompt:**
> *"Please process invoice INV-004 from Tech Supplies Ltd for PO-002. They billed us for 50 units of BAT-002 at $65.00 each. Let me know if everything looks good."*

**Behind the Scenes (Tool Calling):**
1. The AI calls the `submitInvoice` tool with the provided data.
2. The server compares the billed price ($65.00) against the ERP Master Data for PO-002 ($49.99).
3. The server rejects the invoice, setting its status to `exception`, and logs a `Price Mismatch` discrepancy.
4. **Result:** The AI apologizes and informs you that the invoice was flagged. It explicitly details the price mismatch ($15.01 per unit overage) and notes that an exception workflow has been triggered for manual review.

---

### Command 4: Operational Analytics & Bottleneck Identification
**Prompt:**
> *"Can you pull the exception breakdown for this month and analyze the primary reasons our invoices are getting flagged? I need to know where our biggest operational bottleneck is."*

**Behind the Scenes (Tool Calling):**
1. The AI calls `getExceptionBreakdown` (AnalyticsTools) without a specific vendor filter to get global stats.
2. The server runs aggregate SQL queries across the `exceptions` and `invoices` tables.
3. **Result:** The AI receives the statistical breakdown (e.g., Price Mismatches vs. Quantity Mismatches) and reasons over the data. It writes a concise, analytical summary pointing out the most frequent exception reason, acting as a fractional data analyst.

---

### Command 5: SLA Escalation & Background Jobs
**Prompt:**
> *"Are there any invoice exceptions in the system that have been open for too long and breached our SLA? If so, please run the escalation routine and send them directly to the CFO (cfo@acmecorp.com)."*

**Behind the Scenes (Tool Calling):**
1. The AI calls `checkSlaEscalations` (InboxTools) with the target email `cfo@acmecorp.com`.
2. The server queries the database for exceptions in `under_review` or `flagged` status that are older than the 24-hour SLA.
3. The server automatically enqueues emails into the `alerts_queue` for the background worker to dispatch.
4. **Result:** The AI reports back on exactly how many exceptions were found, providing a summary of the invoices that were just escalated to the CFO's inbox.

---

## 🏗️ Architecture Summary

During this demo, you'll notice the AI never asks for a database schema or tries to write SQL. Instead, it relies on strict, Zod-validated TypeScript functions exposed via the `@Tool()` decorator. 

Under the hood, these tools execute isolated business logic, persisting state to a SQLite database and querying an abstracted `ErpAdapter`—proving that Agentic AI can be safely integrated into mission-critical ERP supply chain workflows!
