import "server-only";
import { createRequire } from "node:module";

// 專案仍使用 @types/node 20；只宣告本服務使用的 Node.js 24 原生 API。
export type SqlValue = string | number | bigint | null | Uint8Array;
export type SqlRow = Record<string, string | number | bigint | null | Uint8Array>;
export interface Statement {
  run(...values: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...values: SqlValue[]): SqlRow | undefined;
  all(...values: SqlValue[]): SqlRow[];
}
export interface HistoryDatabase {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
  readonly isTransaction: boolean;
}
interface NativeSqlite {
  DatabaseSync: new (path: string, options: { timeout: number; enableForeignKeyConstraints: boolean }) => HistoryDatabase;
}

export function createDatabase(path: string): HistoryDatabase {
  const require = createRequire(import.meta.url);
  const sqlite = require("node:sqlite") as NativeSqlite;
  return new sqlite.DatabaseSync(path, { timeout: 5000, enableForeignKeyConstraints: true });
}
