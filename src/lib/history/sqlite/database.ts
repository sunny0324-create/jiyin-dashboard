import "server-only";
import { lstatSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { createDatabase, type HistoryDatabase } from "./native";
import { APPLICATION_ID, SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

export const DEFAULT_HISTORY_DATABASE = "data/local/jiyin-history.sqlite";

// 不接受 public、工作區外或符號連結／junction 指向的資料庫路徑。
function localDatabasePath(filename: string): string {
  const root = resolve("data/local");
  const path = resolve(filename);
  const within = relative(root, path);
  if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within) || !path.endsWith(".sqlite")) {
    throw new Error("資料庫必須位於 data/local/ 內，且使用 .sqlite 副檔名。");
  }
  let current = path;
  while (true) {
    if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error("資料庫路徑不可包含符號連結或 junction。");
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

export function openHistoryDatabase(filename = DEFAULT_HISTORY_DATABASE): HistoryDatabase {
  const db = createDatabase(filename === ":memory:" ? filename : localDatabasePath(filename));
  try {
    const application = Number(db.prepare("PRAGMA application_id").get()?.application_id);
    const version = Number(db.prepare("PRAGMA user_version").get()?.user_version);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    if (application !== APPLICATION_ID && (application !== 0 || tables.length !== 0 || version !== 0)) {
      throw new Error("拒絕開啟非本專案歷史資料庫。");
    }
    if (version > SCHEMA_VERSION || (application === APPLICATION_ID && version !== SCHEMA_VERSION)) {
      throw new Error("資料庫版本不相容；請先使用相容程式或規劃遷移。");
    }
    db.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL;");
    if (application === 0) {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec(SCHEMA_SQL);
        db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${SCHEMA_VERSION}; COMMIT;`);
      } catch (error) {
        if (db.isTransaction) db.exec("ROLLBACK");
        throw error;
      }
    }
    db.exec("PRAGMA journal_mode=WAL");
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
