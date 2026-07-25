import { Injectable, OnModuleInit } from '@nitrostack/core';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PurchaseOrder } from '../../shared/schemas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', '..', '..', 'data', 'master-data.json');

interface MasterDataStore {
  purchaseOrders: PurchaseOrder[];
}

/** Seed data — 5 POs, one intentional mismatch target (PO-004) */
const SEED: MasterDataStore = {
  purchaseOrders: [
    { poNumber: 'PO-001', vendor: 'Acme Corp',       sku: 'LAP-001', orderedQty: 10,  unitPrice: 999.00,  hsCode: '8471.30' },
    { poNumber: 'PO-002', vendor: 'Tech Supplies Ltd', sku: 'BAT-002', orderedQty: 50,  unitPrice: 49.99,   hsCode: '8507.60' },
    { poNumber: 'PO-003', vendor: 'Global Parts Co',  sku: 'MON-003', orderedQty: 5,   unitPrice: 450.00,  hsCode: '8528.52' },
    { poNumber: 'PO-004', vendor: 'Acme Corp',        sku: 'LAP-001', orderedQty: 10,  unitPrice: 10.00,   hsCode: '8471.30' }, // mismatch target
    { poNumber: 'PO-005', vendor: 'Office Depot',     sku: 'CHR-005', orderedQty: 20,  unitPrice: 199.99,  hsCode: '9401.30' },
  ],
};

@Injectable()
export class MasterDataService implements OnModuleInit {
  private store: MasterDataStore = { purchaseOrders: [] };

  onModuleInit() {
    const dir = dirname(DB_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    if (existsSync(DB_PATH)) {
      this.store = JSON.parse(readFileSync(DB_PATH, 'utf-8')) as MasterDataStore;
    } else {
      this.store = SEED;
      this.flush();
    }
  }

  private flush() {
    writeFileSync(DB_PATH, JSON.stringify(this.store, null, 2), 'utf-8');
  }

  findPO(poNumber: string): PurchaseOrder | null {
    return this.store.purchaseOrders.find((po) => po.poNumber === poNumber) ?? null;
  }

  findBySku(sku: string): PurchaseOrder | null {
    return this.store.purchaseOrders.find((po) => po.sku === sku) ?? null;
  }

  getAllPOs(): PurchaseOrder[] {
    return this.store.purchaseOrders;
  }
}
