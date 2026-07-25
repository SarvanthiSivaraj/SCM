#!/usr/bin/env python3
"""
scripts/generate_mock_data.py

Generates 500 mock Purchase Order records into `data/master-data.json` using Faker.
Preserves initial PO-001 through PO-010 seed records.

Usage:
    .venv/bin/python scripts/generate_mock_data.py
"""

import json
import random
from pathlib import Path
from faker import Faker

fake = Faker()
Faker.seed(42)
random.seed(42)

# Directory structure
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / "data" / "master-data.json"

# Preserved initial seed records (PO-001 to PO-010)
INITIAL_SEED_POS = [
    {"poNumber": "PO-001", "vendor": "Acme Corp",          "sku": "LAP-001", "orderedQty": 10,  "unitPrice": 999.00, "hsCode": "8471.30"},
    {"poNumber": "PO-002", "vendor": "Tech Supplies Ltd",  "sku": "BAT-002", "orderedQty": 50,  "unitPrice": 49.99,  "hsCode": "8507.60"},
    {"poNumber": "PO-003", "vendor": "Global Parts Co",    "sku": "MON-003", "orderedQty": 5,   "unitPrice": 450.00, "hsCode": "8528.52"},
    {"poNumber": "PO-004", "vendor": "Acme Corp",          "sku": "LAP-001", "orderedQty": 10,  "unitPrice": 10.00,  "hsCode": "8471.30"},
    {"poNumber": "PO-005", "vendor": "Office Depot",       "sku": "CHR-005", "orderedQty": 20,  "unitPrice": 199.99, "hsCode": "9401.30"},
    {"poNumber": "PO-006", "vendor": "FastShip Logistics", "sku": "CAB-006", "orderedQty": 200, "unitPrice": 2.50,   "hsCode": "8544.42"},
    {"poNumber": "PO-007", "vendor": "Tech Supplies Ltd",  "sku": "SSD-007", "orderedQty": 30,  "unitPrice": 89.99,  "hsCode": "8471.70"},
    {"poNumber": "PO-008", "vendor": "Global Parts Co",    "sku": "KBD-008", "orderedQty": 15,  "unitPrice": 75.00,  "hsCode": "8471.60"},
    {"poNumber": "PO-009", "vendor": "Acme Corp",          "sku": "MSE-009", "orderedQty": 25,  "unitPrice": 35.00,  "hsCode": "8471.60"},
    {"poNumber": "PO-010", "vendor": "Office Depot",       "sku": "DSK-010", "orderedQty": 8,   "unitPrice": 299.99, "hsCode": "9403.10"},
]

PRODUCT_CATEGORIES = [
    {"prefix": "LAP", "hsCode": "8471.30", "price_range": (499.00, 2499.00)},
    {"prefix": "BAT", "hsCode": "8507.60", "price_range": (15.00, 150.00)},
    {"prefix": "MON", "hsCode": "8528.52", "price_range": (120.00, 899.00)},
    {"prefix": "CHR", "hsCode": "9401.30", "price_range": (89.00, 499.00)},
    {"prefix": "CAB", "hsCode": "8544.42", "price_range": (1.50, 45.00)},
    {"prefix": "SSD", "hsCode": "8471.70", "price_range": (35.00, 350.00)},
    {"prefix": "KBD", "hsCode": "8471.60", "price_range": (20.00, 180.00)},
    {"prefix": "MSE", "hsCode": "8471.60", "price_range": (10.00, 95.00)},
    {"prefix": "DSK", "hsCode": "9403.10", "price_range": (150.00, 750.00)},
    {"prefix": "SVR", "hsCode": "8471.50", "price_range": (1200.00, 8500.00)},
    {"prefix": "RTR", "hsCode": "8517.62", "price_range": (45.00, 650.00)},
    {"prefix": "RAM", "hsCode": "8473.30", "price_range": (25.00, 280.00)},
    {"prefix": "PRN", "hsCode": "8443.32", "price_range": (99.00, 1200.00)},
    {"prefix": "CAM", "hsCode": "8525.80", "price_range": (30.00, 350.00)},
    {"prefix": "DSP", "hsCode": "8528.59", "price_range": (200.00, 1500.00)},
]

# Generate realistic vendor names
VENDORS = [
    "Acme Corp",
    "Tech Supplies Ltd",
    "Global Parts Co",
    "Office Depot",
    "FastShip Logistics",
] + [fake.company() for _ in range(25)]


def generate_pos(total_count=500):
    pos = list(INITIAL_SEED_POS)
    existing_count = len(pos)

    for i in range(existing_count + 1, total_count + 1):
        category = random.choice(PRODUCT_CATEGORIES)
        sku_num = random.randint(100, 999)
        sku = f"{category['prefix']}-{sku_num}"
        
        qty = random.choice([5, 10, 12, 15, 20, 25, 30, 50, 75, 100, 150, 200, 250, 500])
        min_price, max_price = category["price_range"]
        price = round(random.uniform(min_price, max_price), 2)
        vendor = random.choice(VENDORS)
        
        pos.append({
            "poNumber": f"PO-{i:03d}",
            "vendor": vendor,
            "sku": sku,
            "orderedQty": qty,
            "unitPrice": price,
            "hsCode": category["hsCode"],
        })

    return pos


def main():
    print("🌱  Generating 500 Purchase Orders using Faker...")
    pos = generate_pos(500)

    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump({"purchaseOrders": pos}, f, indent=2)

    print(f"✅  Successfully generated {len(pos)} purchase order records in {DATA_FILE}")


if __name__ == "__main__":
    main()
