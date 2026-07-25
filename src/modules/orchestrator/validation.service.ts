import { Injectable } from '@nitrostack/core';
import type {
  ExtractedInvoice,
  PurchaseOrder,
  ValidationResult,
} from '../../shared/schemas.js';

const PRICE_TOLERANCE = 0.01; // 1%

@Injectable()
export class ValidationService {
  matchInvoiceToPO(
    invoice: ExtractedInvoice,
    po: PurchaseOrder,
  ): ValidationResult {
    const discrepancies: string[] = [];

    // Match each invoice line item against the PO
    for (const item of invoice.lineItems) {
      if (item.sku !== po.sku) continue; // different product, skip

      const priceDiff = Math.abs(item.unitPrice - po.unitPrice) / po.unitPrice;
      if (priceDiff > PRICE_TOLERANCE) {
        discrepancies.push(
          `Unit price for SKU ${item.sku}: expected $${po.unitPrice.toFixed(2)}, got $${item.unitPrice.toFixed(2)}`,
        );
      }

      const qtyDiff = Math.abs(item.quantity - po.orderedQty) / po.orderedQty;
      if (qtyDiff > PRICE_TOLERANCE) {
        discrepancies.push(
          `Quantity for SKU ${item.sku}: expected ${po.orderedQty}, got ${item.quantity}`,
        );
      }
    }

    const status: ValidationResult['status'] =
      discrepancies.length === 0 ? 'match' : 'mismatch';

    return { status, discrepancies };
  }
}
