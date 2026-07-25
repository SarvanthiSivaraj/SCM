import { Injectable, OnModuleInit, OnModuleDestroy } from '@nitrostack/core';
import { Database } from '@sqlitecloud/drivers';

/**
 * DatabaseService — singleton SQLite Cloud connection shared by all modules.
 *
 * Every other service that needs SQLite should inject DatabaseService instead
 * of creating its own `new Database(url)`. This ensures:
 *  - A single connection (SQLite Cloud handles the pool internally)
 *  - One place to enable WAL mode and other pragmas
 *  - Clean shutdown on module destroy
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private _db!: Database;

  async onModuleInit(): Promise<void> {
    const url = process.env['SQLITECLOUD_URL'];
    if (!url) {
      throw new Error(
        '[DatabaseService] SQLITECLOUD_URL is not set. ' +
        'Add it to your .env file. ' +
        'Format: sqlitecloud://<host>.sqlite.cloud:8860/<db>.sqlite?apikey=<key>',
      );
    }

    this._db = new Database(url);

    // Production SQLite pragmas — must run before any other queries
    await this._db.sql('PRAGMA journal_mode = WAL');
    await this._db.sql('PRAGMA foreign_keys = ON');
    await this._db.sql('PRAGMA busy_timeout = 5000');

    console.error('[DatabaseService] Connected to SQLite Cloud (WAL mode) ✓');
  }

  async onModuleDestroy(): Promise<void> {
    await this._db?.close();
    console.error('[DatabaseService] Connection closed');
  }

  /**
   * Expose the raw connection for services that need direct sql() access.
   * Throws if called before onModuleInit completes.
   */
  get db(): Database {
    if (!this._db) throw new Error('[DatabaseService] DB not initialized yet');
    return this._db;
  }

  /** Convenience pass-through — keeps callers readable. */
  async sql(query: string, ...params: unknown[]): Promise<unknown[]> {
    return (await this._db.sql(query, ...params)) as unknown[];
  }
}
