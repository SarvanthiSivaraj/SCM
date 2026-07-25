'use client';

import React from 'react';
import { useWidgetSDK } from '@nitrostack/widgets';

interface ValidationResult {
  status: 'match' | 'mismatch' | 'exception';
  discrepancies: string[];
  suggestedHsCode?: string;
}

interface InvoiceLineItem {
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface ExtractedInvoice {
  invoiceNumber: string;
  poNumber: string;
  vendor: string;
  invoiceDate: string;
  totalAmount: number;
  lineItems: InvoiceLineItem[];
}

interface WorkflowOutput {
  status: string;
  summary: string;
  output: {
    invoice?: ExtractedInvoice;
    validationResult?: ValidationResult;
  };
}

const STATUS_COLOR: Record<string, string> = {
  'Auto-approved': '#22c55e',
  Flagged:         '#ef4444',
  exception:       '#f97316',
  aborted:         '#6b7280',
};

export default function InvoiceResultWidget() {
  const { isReady, getToolOutput, theme } = useWidgetSDK();
  const data = getToolOutput<WorkflowOutput>();

  if (!isReady) return <div style={{ padding: 16 }}>Connecting…</div>;
  if (!data)    return <div style={{ padding: 16 }}>No invoice data yet.</div>;

  const isDark = theme === 'dark';
  const bg      = isDark ? '#1e1e2e' : '#f8fafc';
  const card    = isDark ? '#2a2a3e' : '#ffffff';
  const text    = isDark ? '#e2e8f0' : '#1e293b';
  const sub     = isDark ? '#94a3b8' : '#64748b';
  const border  = isDark ? '#3f3f5e' : '#e2e8f0';
  const color   = STATUS_COLOR[data.status] ?? '#6b7280';

  const invoice = data.output?.invoice;
  const result  = data.output?.validationResult;

  return (
    <div style={{ background: bg, color: text, fontFamily: 'Inter, sans-serif', padding: 20, borderRadius: 12, minWidth: 360 }}>
      {/* Status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, display: 'inline-block' }} />
        <span style={{ fontWeight: 700, fontSize: 18 }}>{data.status}</span>
      </div>

      {/* Summary */}
      <p style={{ color: sub, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{data.summary}</p>

      {/* Invoice details */}
      {invoice && (
        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: sub, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Invoice</div>
          <Row label="Invoice #" value={invoice.invoiceNumber} sub={sub} />
          <Row label="PO #"      value={invoice.poNumber}      sub={sub} />
          <Row label="Vendor"    value={invoice.vendor}        sub={sub} />
          <Row label="Date"      value={invoice.invoiceDate}   sub={sub} />
          <Row label="Total"     value={`$${invoice.totalAmount.toFixed(2)}`} sub={sub} />

          {/* Line items table */}
          {invoice.lineItems.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 12 }}>
              <thead>
                <tr style={{ color: sub }}>
                  {['SKU', 'Desc', 'Qty', 'Unit $', 'Total'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', paddingBottom: 4, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((li, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${border}` }}>
                    <td style={{ padding: '4px 0' }}>{li.sku}</td>
                    <td>{li.description}</td>
                    <td>{li.quantity}</td>
                    <td>${li.unitPrice.toFixed(2)}</td>
                    <td>${li.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Discrepancies */}
      {result && result.discrepancies.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, color: '#dc2626', marginBottom: 6, fontSize: 13 }}>⚠ Discrepancies</div>
          {result.discrepancies.map((d, i) => (
            <div key={i} style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 2 }}>• {d}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
      <span style={{ color: sub }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}
