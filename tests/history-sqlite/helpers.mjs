import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { parseHistorySheets } from "../../src/lib/history/parser.ts";
import { readHistoryBuffer } from "../../src/lib/history/reader.ts";
import { fixtureSheets, fixtureZip } from "../history/fixtures.mjs";

export async function parsedFixture(edit = () => {}) {
  const sheets = fixtureSheets();
  edit(sheets);
  const bytes = fixtureZip(sheets);
  const source = await readHistoryBuffer(bytes, "synthetic-sqlite-test-only.xlsx");
  return { batch: parseHistorySheets(source.sheets, source.source), bytes };
}

export async function testDirectory(t) {
  const root = resolve("data/local");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(resolve(root, "sqlite-test-"));
  t.after(async () => {
    const within = relative(root, resolve(directory));
    if (!within.startsWith("sqlite-test-") || within.includes(sep) || isAbsolute(within)) throw new Error("拒絕清理非測試目錄。");
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

export function shiftIntervals(sheets, label = "00:06", start = "2026-10-01 00:03:00", end = "2026-10-01 00:06:00") {
  for (const name of ["machine_3min", "environment_3min"]) {
    const row = sheets.find(sheet => sheet.name === name).rows[0].cells;
    row[1] = label; row[2] = start; row[3] = end;
  }
}

export function tableCounts(db) {
  const tables = ["import_batches", "excel_sheets", "raw_excel_rows", "machine_3min", "environment_3min", "alarm_events", "quality_issues", "quality_issue_machine_links", "validation_issues"];
  return Object.fromEntries(tables.map(table => [table, Number(db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count)]));
}
