import { Injectable } from '@nitrostack/core';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXCEPTIONS_PATH = join(__dirname, '..', '..', '..', 'data', 'exceptions.json');

interface ExceptionRecord {
  exceptionId: string;
  workflowId: string;
  reason: string;
  data: unknown;
  createdAt: string;
  status: 'flagged';
}

@Injectable()
export class ExceptionService {
  private load(): ExceptionRecord[] {
    const dir = dirname(EXCEPTIONS_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(EXCEPTIONS_PATH)) return [];
    return JSON.parse(readFileSync(EXCEPTIONS_PATH, 'utf-8')) as ExceptionRecord[];
  }

  private save(records: ExceptionRecord[]) {
    writeFileSync(EXCEPTIONS_PATH, JSON.stringify(records, null, 2), 'utf-8');
  }

  flag(workflowId: string, reason: string, data: unknown): ExceptionRecord {
    const record: ExceptionRecord = {
      exceptionId: randomUUID(),
      workflowId,
      reason,
      data,
      createdAt: new Date().toISOString(),
      status: 'flagged',
    };
    const all = this.load();
    all.push(record);
    this.save(all);
    return record;
  }
}
