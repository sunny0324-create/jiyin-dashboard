import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openHistoryDatabase, DEFAULT_HISTORY_DATABASE } from "../src/lib/history/sqlite/database";
import { HistoryImportError, listImportBatches, SqliteHistoryImporter } from "../src/lib/history/sqlite/importer";
import { HistoryReadError } from "../src/lib/history/reader";
import { DEFAULT_HISTORY_SAMPLE } from "./validate-history";

export async function importHistoryCommand(args: string[]) {
  let filename = DEFAULT_HISTORY_SAMPLE;
  let database = DEFAULT_HISTORY_DATABASE;
  let list = false;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) return { exitCode: 2, report: { status: "invalid_arguments" } };
    seen.add(flag);
    if (flag === "--list") { list = true; continue; }
    if (!["--file", "--database"].includes(flag) || !args[index + 1] || args[index + 1].startsWith("--")) {
      return { exitCode: 2, report: { status: "invalid_arguments", message: "用法：npm run import:history -- [--file 本機Excel路徑] [--database data/local/名稱.sqlite] [--list]" } };
    }
    if (flag === "--file") filename = args[++index];
    else database = args[++index];
  }
  if (list && seen.has("--file")) return { exitCode: 2, report: { status: "invalid_arguments", message: "--list 不可同時匯入檔案。" } };
  const db = openHistoryDatabase(database);
  try {
    if (list) return { exitCode: 0, report: { status: "batches", database, batches: listImportBatches(db) } };
    const result = await new SqliteHistoryImporter(db).importFile(filename);
    return { exitCode: 0, report: { ...result, database, message: "匯入成功不代表品質通過；正式分析仍須檢查 analysis_eligible 與期間完整性。" } };
  } catch (error) {
    if (error instanceof HistoryImportError) return { exitCode: 1, report: { status: error.code, message: error.message, conflicts: error.conflicts } };
    if (error instanceof HistoryReadError) return { exitCode: 2, report: { status: error.code, message: error.message } };
    return { exitCode: 2, report: { status: "file_read_error", message: "來源檔案無法讀取；未建立替代企業資料。" } };
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void importHistoryCommand(process.argv.slice(2)).then(({ exitCode, report }) => {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = exitCode;
  }).catch(() => {
    console.error("歷史資料匯入工具無法開啟資料庫，請確認 Node.js 24、檔案路徑、版本與存取權限。");
    process.exitCode = 2;
  });
}
