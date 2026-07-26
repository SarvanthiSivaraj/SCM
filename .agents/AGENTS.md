# Project-Scoped Rules for ALE SCM

## 1. Text-Only Invoices & ERP Queries
If the user provides invoice details directly as text in the chat (e.g. "Process invoice INV-004 from Tech Supplies Ltd for PO-002... 50 units of BAT-002 at $65.00 each") instead of uploading a physical file:
- **Do not refuse** the request or demand a file upload.
- **Fetch the PO from ERP/Master Data**: Immediately invoke the `validate_against_master_data` tool using the SKU and PO number provided to retrieve the master record.
- **Run the full workflow**: Call `execute_workflow` by constructing a structured text representation of the invoice details and passing it as the `file_content` (using a filename like `invoice_INV-004.txt`).
- **Provide matching results**: Compare the user's provided details against the retrieved ERP master record (e.g., highlighting any unit price discrepancies like $65.00 vs $49.99).
