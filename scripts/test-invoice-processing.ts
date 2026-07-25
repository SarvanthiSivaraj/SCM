import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { ClaudeClient } from '../src/shared/claude.client.js';
import { IngestionTools } from '../src/modules/ingestion/ingestion.tools.js';
import { MasterDataService } from '../src/modules/master-data/master-data.service.js';
import { OrchestratorTools } from '../src/modules/orchestrator/orchestrator.tools.js';
import { ValidationService } from '../src/modules/orchestrator/validation.service.js';
import { ExceptionService } from '../src/modules/orchestrator/exception.service.js';
import { ExecutionContext } from '@nitrostack/core';

// Load environment variables
dotenv.config();

// Force offline/mock mode for services
MasterDataService.prototype.onModuleInit = async function () {
  console.log('[MOCK] MasterDataService initialized in offline mode.');
};
MasterDataService.prototype.onModuleDestroy = async function () {};

// Mock MasterDataService.prototype.findPO to load from data/master-data.json
MasterDataService.prototype.findPO = async function (poNumber: string) {
  console.log(`[MOCK] Searching master data for: ${poNumber}`);
  const rawPath = path.join(process.cwd(), 'data', 'master-data.json');
  if (fs.existsSync(rawPath)) {
    const data = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));
    if (data.poNumber === poNumber) {
      // Map to PurchaseOrder Zod Schema format:
      // poNumber, vendor, sku, orderedQty, unitPrice, hsCode
      const item = data.lineItems[0];
      return {
        poNumber: data.poNumber,
        vendor: data.vendor,
        sku: item.sku,
        orderedQty: item.quantity,
        unitPrice: item.unitPrice,
        hsCode: '8471.30',
      };
    }
  }
  return null;
};

// Mock ClaudeClient responses for classification and extraction
ClaudeClient.prototype.complete = async function (
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const promptText = userPrompt.toLowerCase();
  if (systemPrompt.includes('classification engine')) {
    if (promptText.includes('invoice') || promptText.includes('inv-')) {
      return JSON.stringify({ docType: 'invoice', confidence: 0.99 });
    }
  }
  throw new Error('Mock complete got unhandled prompt type');
};

ClaudeClient.prototype.completeAndParse = async function <T>(
  schema: any,
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  const promptText = userPrompt.toLowerCase();
  if (systemPrompt.includes('structured-data extraction engine')) {
    if (promptText.includes('inv-2026-004') || promptText.includes('po-004')) {
      return {
        invoiceNumber: 'INV-2026-004',
        poNumber: 'PO-004',
        vendor: 'ACME Electronics',
        invoiceDate: '2026-07-25',
        totalAmount: 12000.00,
        lineItems: [
          {
            sku: 'LAPTOP-PRO-15',
            description: 'Premium Laptops Pro 15',
            quantity: 10,
            unitPrice: 1200.00,
            total: 12000.00,
          },
        ],
      } as unknown as T;
    }
  }
  throw new Error('Mock completeAndParse got unhandled prompt type');
};

const mockContext = {
  logger: {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
    warn: (msg: string) => console.warn(`[WARN] ${msg}`),
    debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
  },
} as unknown as ExecutionContext;

async function run() {
  console.log('=== QA E2E Orchestration Validation (3-Way Matching Exception) ===\n');

  const claude = new ClaudeClient();
  const ingestion = new IngestionTools(claude);
  const masterData = new MasterDataService();
  const validation = new ValidationService();
  const exceptions = new ExceptionService();
  const orchestrator = new OrchestratorTools(validation, exceptions, masterData, ingestion);

  // Initialize service
  await masterData.onModuleInit();

  const mockDir = path.join(process.cwd(), 'data', 'mock-documents');
  const filename = 'invoice_004.txt';
  const filePath = path.join(mockDir, filename);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Mock document file not found at: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  console.log(`Ingesting and executing workflow for file: ${filename}...`);
  try {
    const result = await orchestrator.executeWorkflow({
      workflowId: 'invoice_processing',
      input: {
        file_name: filename,
        file_content: content,
        file_type: 'text/plain',
      },
    }, mockContext);

    console.log('\nWorkflow Execution Completed.');
    console.log('Result Status:', result.status);
    console.log('Summary:', result.summary);
    console.log('Output Details:', JSON.stringify(result.output, null, 2));

    // Verify exception store has logged the exception
    console.log('\nChecking persisted exceptions...');
    const exceptionsPath = path.join(process.cwd(), 'data', 'exceptions.json');
    if (fs.existsSync(exceptionsPath)) {
      const loggedExceptions = JSON.parse(fs.readFileSync(exceptionsPath, 'utf-8'));
      console.log(`Total exceptions logged: ${loggedExceptions.length}`);
      console.log('Latest exception logged:', JSON.stringify(loggedExceptions[loggedExceptions.length - 1], null, 2));
    } else {
      console.log('❌ No exceptions.json file found.');
    }

  } catch (err: any) {
    console.error('Workflow execution failed with error:', err);
  }
}

run().catch((err) => {
  console.error('Fatal test execution error:', err);
});
