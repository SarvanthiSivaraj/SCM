#!/usr/bin/env python3
import json
import random
import uuid
import sys
from pathlib import Path
from datetime import datetime, timedelta

try:
    from faker import Faker
except ImportError:
    print("Faker not installed. Please install it using: pip install Faker")
    sys.exit(1)

fake = Faker()
Faker.seed(42)
random.seed(42)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / "data" / "master-data.json"

def generate_data():
    # 1. Purchase Orders (150)
    vendors = [fake.company() for _ in range(30)]
    pos = []
    for i in range(1, 151):
        pos.append({
            "poNumber": f"PO-MOCK-{i:04d}",
            "vendor": random.choice(vendors),
            "sku": f"{fake.word().upper()[:3]}-{random.randint(100, 999)}",
            "orderedQty": random.randint(10, 1000),
            "unitPrice": round(random.uniform(5.0, 5000.0), 2),
            "hsCode": f"{random.randint(1000, 9999)}.{random.randint(10, 99)}",
            "createdAt": fake.date_time_between(start_date='-1y', end_date='now').isoformat()
        })

    # 2. Invoices (150)
    invoices = []
    statuses = ['pending', 'auto_approved', 'pending_approval', 'flagged']
    for i in range(1, 151):
        po = random.choice(pos)
        invoices.append({
            "invoiceNumber": f"INV-MOCK-{i:04d}",
            "poNumber": po["poNumber"],
            "vendor": po["vendor"],
            "invoiceDate": fake.date_between(start_date='-1y', end_date='today').isoformat(),
            "totalAmount": round(random.uniform(10.0, 10000.0), 2),
            "status": random.choice(statuses),
            "createdAt": fake.date_time_between(start_date='-1y', end_date='now').isoformat()
        })

    # 3. Invoice Line Items (200)
    line_items = []
    for i in range(200):
        inv = random.choice(invoices)
        qty = random.randint(1, 100)
        price = round(random.uniform(1.0, 500.0), 2)
        line_items.append({
            "invoiceNumber": inv["invoiceNumber"],
            "sku": f"SKU-MOCK-{random.randint(100, 999)}",
            "description": fake.sentence(nb_words=4),
            "quantity": qty,
            "unitPrice": price,
            "total": round(qty * price, 2)
        })

    # 4. Goods Receipts (120)
    grs = []
    for i in range(120):
        po = random.choice(pos)
        grs.append({
            "poNumber": po["poNumber"],
            "sku": po["sku"],
            "receivedQty": random.randint(1, po["orderedQty"]),
            "receivedDate": fake.date_between(start_date='-1y', end_date='today').isoformat()
        })

    # 5. Exceptions (110)
    exceptions = []
    for i in range(110):
        status = random.choice(['flagged', 'resolved'])
        created_at = fake.date_time_between(start_date='-6m', end_date='now')
        exceptions.append({
            "workflowId": str(uuid.uuid4()),
            "invoiceNumber": random.choice(invoices)["invoiceNumber"],
            "reason": random.choice(['Price Mismatch', 'Quantity Mismatch', 'Missing PO', 'Invalid HS Code']),
            "discrepancies": json.dumps([fake.sentence(nb_words=3) for _ in range(random.randint(1, 3))]),
            "status": status,
            "createdAt": created_at.isoformat(),
            "resolvedAt": (created_at + timedelta(days=random.randint(1, 10))).isoformat() if status == 'resolved' else None
        })

    # 6. Audit Log (150)
    audit = []
    for i in range(150):
        audit.append({
            "workflowId": str(uuid.uuid4()),
            "toolName": random.choice(['execute_workflow', 'match_invoice_to_po', 'classify', 'extract']),
            "inputHash": fake.sha256(),
            "outputHash": fake.sha256(),
            "actor": random.choice(['system', 'finance_user', 'admin']),
            "createdAt": fake.date_time_between(start_date='-6m', end_date='now').isoformat()
        })

    # 7. HS Code Reference (120)
    hs_codes = []
    for i in range(120):
        hs_codes.append({
            "hsCode": f"{random.randint(1000, 9999)}.{random.randint(10, 99)}",
            "description": fake.catch_phrase(),
            "keywords": " ".join(fake.words(nb=5))
        })

    # 8. Compliance Rules (100)
    rules = []
    for i in range(100):
        rules.append({
            "ruleType": random.choice(['sanctions', 'customs', 'tax', 'environmental']),
            "ruleDefinition": json.dumps({"param": fake.word(), "value": random.randint(1, 100)}),
            "version": random.randint(1, 5),
            "effectiveDate": fake.date_between(start_date='-2y', end_date='today').isoformat()
        })

    # 9. Alerts (110)
    alerts = []
    for i in range(110):
        status = random.choice(['pending', 'delivered', 'failed'])
        created = fake.date_time_between(start_date='-1m', end_date='now')
        alerts.append({
            "recipient": fake.email(),
            "template": random.choice(['exception_alert', 'approval_reminder', 'stp_summary']),
            "status": status,
            "payload": json.dumps({"invoice": f"INV-{random.randint(1000,9999)}"}),
            "createdAt": created.isoformat(),
            "deliveredAt": (created + timedelta(minutes=random.randint(1, 60))).isoformat() if status == 'delivered' else None
        })

    # 10. FX Rates (120)
    unique_pairs = list(set([f"{fake.currency_code()}/{fake.currency_code()}" for _ in range(300)]))[:120]
    fx = []
    for p in unique_pairs:
        fx.append({
            "currencyPair": p,
            "rate": round(random.uniform(0.01, 1.5), 4),
            "asOfDate": fake.date_between(start_date='-1m', end_date='today').isoformat()
        })

    # 11. Approval Thresholds (100)
    thresholds = []
    for i in range(100):
        thresholds.append({
            "minAmount": i * 1000.0,
            "maxAmount": (i + 1) * 1000.0,
            "requiredApproverRole": random.choice(['manager', 'director', 'vp', 'cfo'])
        })

    # 12. Analytics Daily Summary (120)
    analytics = []
    start_date = datetime.now() - timedelta(days=120)
    for i in range(120):
        inv_c = random.randint(50, 500)
        exc_c = random.randint(0, 50)
        analytics.append({
            "date": (start_date + timedelta(days=i)).date().isoformat(),
            "invoiceCount": inv_c,
            "exceptionCount": exc_c,
            "avgCycleTimeMinutes": round(random.uniform(10.0, 120.0), 2),
            "stpRate": round(1.0 - (exc_c / inv_c), 2) if inv_c > 0 else 1.0,
            "refreshedAt": (start_date + timedelta(days=i, hours=23)).isoformat()
        })

    data = {
        "purchaseOrders": pos,
        "invoices": invoices,
        "invoiceLineItems": line_items,
        "goodsReceipts": grs,
        "exceptions": exceptions,
        "auditLog": audit,
        "hsCodeReference": hs_codes,
        "complianceRules": rules,
        "alerts": alerts,
        "fxRates": fx,
        "approvalThresholds": thresholds,
        "analyticsDailySummary": analytics
    }
    
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"✅ Successfully generated mock data for 12 tables in {DATA_FILE}")

if __name__ == "__main__":
    generate_data()
