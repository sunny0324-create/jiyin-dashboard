import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseHistoryFile } from "../src/lib/history/parser";
import { HistoryReadError } from "../src/lib/history/reader";
import { summarizeHistory } from "../src/lib/history/summary";

export const DEFAULT_HISTORY_SAMPLE = "data/samples/極印_三分鐘標準化資料_2026-10-01.xlsx";

export async function validateHistoryCommand(args: string[]) {
  if (args.length && !(args.length === 2 && args[0] === "--file" && args[1])) {
    return { exitCode: 2, report: { status: "invalid_arguments", message: "用法：npm run validate:history -- --file 本機Excel路徑；省略參數時讀取指定樣本。" } };
  }
  try {
    const result = await parseHistoryFile(args[1] ?? DEFAULT_HISTORY_SAMPLE);
    return { exitCode: !result.contract ? 2 : result.issues.some((issue) => issue.severity === "error") ? 1 : 0,
      report: summarizeHistory(result) };
  } catch (error) {
    if (error instanceof HistoryReadError) return { exitCode: 2, report: { status: error.code, message: error.message, entry: error.entry, cell: error.cell } };
    return { exitCode: 2, report: { status: "file_read_error", message: "樣本缺少或無法讀取，請確認本機檔案；不建立替代企業資料。" } };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void validateHistoryCommand(process.argv.slice(2)).then(({ exitCode, report }) => {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = exitCode;
  }).catch(() => {
    console.error("歷史資料驗證工具無法啟動；未修改原檔或寫入資料庫。");
    process.exitCode = 2;
  });
}
