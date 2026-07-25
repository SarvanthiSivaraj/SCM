import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { ClaudeClient } from '../src/shared/claude.client.js';
import { IngestionTools } from '../src/modules/ingestion/ingestion.tools.js';
import { ExecutionContext } from '@nitrostack/core';

// Load environment variables from .env
dotenv.config();

// Auto-detect if we should run in Mock LLM Mode
const apiKey = process.env.ANTHROPIC_API_KEY || '';
const isMockMode = !apiKey.startsWith('sk-ant-') || process.env.MOCK_LLM === 'true';

if (isMockMode) {
  console.log('⚠️  Valid Anthropic API Key not found. Running in MOCK LLM MODE to validate schemas, base64 decoding, and module logic.\n');

  // Mock ClaudeClient.prototype.complete
  ClaudeClient.prototype.complete = async function (
    systemPrompt: string,
    userPrompt: string,
    model?: string,
    temperature?: number
  ): Promise<string> {
    const promptText = userPrompt.toLowerCase();
    
    // Classify document mock response
    if (systemPrompt.includes('classification engine')) {
      let docType = 'unknown';
      if (promptText.includes('invoice') || promptText.includes('inv-')) {
        docType = 'invoice';
      } else if (promptText.includes('purchase order') || promptText.includes('po-')) {
        docType = 'po';
      } else if (promptText.includes('packing list')) {
        docType = 'packing_list';
      }
      return JSON.stringify({ docType, confidence: 0.99 });
    }

    throw new Error('Mock complete got unhandled prompt type');
  };

  // Mock ClaudeClient.prototype.completeAndParse
  ClaudeClient.prototype.completeAndParse = async function <T>(
    schema: any,
    systemPrompt: string,
    userPrompt: string
  ): Promise<T> {
    const promptText = userPrompt.toLowerCase();

    // Ingestion extract invoice data mock response
    if (systemPrompt.includes('structured-data extraction engine')) {
      if (promptText.includes('inv-2026-001') || promptText.includes('po-001')) {
        return {
          invoiceNumber: 'INV-2026-001',
          poNumber: 'PO-001',
          vendor: 'Acme Corp',
          invoiceDate: '2026-07-25',
          totalAmount: 9990.00,
          lineItems: [
            {
              sku: 'LAP-001',
              description: 'Premium Laptops',
              quantity: 10,
              unitPrice: 999.00,
              total: 9990.00
            }
          ]
        } as unknown as T;
      } else if (promptText.includes('inv-2026-002') || promptText.includes('po-002')) {
        return {
          invoiceNumber: 'INV-2026-002',
          poNumber: 'PO-002',
          vendor: 'Tech Supplies Ltd',
          invoiceDate: '2026-07-25',
          totalAmount: 2499.50,
          lineItems: [
            {
              sku: 'BAT-002',
              description: 'Lithium Batteries',
              quantity: 50,
              unitPrice: 49.99,
              total: 2499.50
            }
          ]
        } as unknown as T;
      }
    }

    throw new Error('Mock completeAndParse got unhandled prompt type');
  };
}

// Create standard mock ExecutionContext for the tools
const mockContext: ExecutionContext = {
  logger: {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
    warn: (msg: string) => console.warn(`[WARN] ${msg}`),
    debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
  },
} as unknown as ExecutionContext;

async function run() {
  console.log('=== Ingestion Module Validation Script ===\n');

  // Set ALE_API_KEY so guard is bypassed if it checks it (our mock context / script bypasses actual HTTP guards)
  process.env.ALE_API_KEY = process.env.ALE_API_KEY || 'test-key';

  const claude = new ClaudeClient();
  const tools = new IngestionTools(claude);

  const mockDir = path.join(process.cwd(), 'data', 'mock-documents');

  const files = [
    { name: 'invoice_001.txt', expected: 'invoice' },
    { name: 'invoice_002.txt', expected: 'invoice' },
    { name: 'po_001.txt', expected: 'po' },
    { name: 'packing_list_001.txt', expected: 'packing_list' },
    { name: 'unknown_001.txt', expected: 'unknown' },
  ];

  console.log('--- 1. Testing Document Classification ---');
  for (const file of files) {
    const filePath = path.join(mockDir, file.name);
    if (!fs.existsSync(filePath)) {
      console.error(`Missing file: ${filePath}`);
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    try {
      const result = await tools.classifyDocument({ filename: file.name, content }, mockContext);
      console.log(`File: ${file.name} | Expected: ${file.expected} | Result: ${result.docType} (confidence: ${result.confidence.toFixed(2)})`);
    } catch (err: any) {
      console.error(`Error classifying ${file.name}:`, err.message || err);
    }
  }
  console.log();

  console.log('--- 2. Testing Document Data Extraction ---');
  const extractionFiles = ['invoice_001.txt', 'invoice_002.txt'];
  for (const filename of extractionFiles) {
    const filePath = path.join(mockDir, filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    try {
      const result = await tools.extractDocumentData({ content, mimeType: 'text/plain' }, mockContext);
      console.log(`File: ${filename} Extracted Data Successfully:`);
      console.log(JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.error(`Error extracting data from ${filename}:`, err.message || err);
    }
  }
  console.log();

  console.log('--- 3. Testing Full Ingestion Pipeline (Base64/PDF) ---');
  const pdfName = 'invoice_001.pdf';
  const pdfPath = path.join(mockDir, pdfName);
  if (fs.existsSync(pdfPath)) {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const base64Content = pdfBuffer.toString('base64');
    try {
      const result = await tools.ingestDocument({
        file_name: pdfName,
        file_type: 'application/pdf',
        file_content: base64Content,
      }, mockContext);
      console.log(`PDF Ingestion Result:`);
      console.log(JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.error(`Error ingesting PDF:`, err.message || err);
    }
  } else {
    console.error(`PDF not found: ${pdfPath}`);
  }

  console.log('\n=== Ingestion Validation Completed ===');
}

run().catch((err) => {
  console.error('Fatal execution error:', err);
});
