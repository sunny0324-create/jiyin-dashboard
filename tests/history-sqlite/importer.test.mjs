import assert from "node:assert/strict";
import { test } from "node:test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openHistoryDatabase } from "../../src/lib/history/sqlite/database.ts";
import { HistoryImportError, SqliteHistoryImporter, listImportBatches } from "../../src/lib/history/sqlite/importer.ts";
import { createDatabase } from "../../src/lib/history/sqlite/native.ts";
import { importHistoryCommand } from "../../scripts/import-history.ts";
import { setCell } from "../history/fixtures.mjs";
import { parsedFixture, shiftIntervals, tableCounts, testDirectory } from "./helpers.mjs";

function memory(t) { const db = openHistoryDatabase(":memory:"); t.after(() => db.close()); return db; }

test("首次匯入保留六張表、表頭、原始數字詞彙與來源列", async t => {
  const db = memory(t);
  const { batch } = await parsedFixture();
  const result = await new SqliteHistoryImporter(db).importBatch(batch);
  assert.equal(result.status, "imported");
  assert.equal(result.retainedRows, batch.rawSheets.reduce((sum, sheet) => sum + sheet.rows.length, 0));
  assert.equal(tableCounts(db).excel_sheets, 6);
  for (const sheet of batch.rawSheets) {
    assert.deepEqual(JSON.parse(db.prepare("SELECT headers_json FROM excel_sheets WHERE name=?").get(sheet.name).headers_json), sheet.headers);
    for (const row of sheet.rows) assert.deepEqual(JSON.parse(db.prepare("SELECT values_json FROM raw_excel_rows WHERE sheet_name=? AND row_number=?").get(sheet.name, row.row).values_json), row.cells);
  }
  assert.equal(tableCounts(db).machine_3min, 1);
  assert.equal(tableCounts(db).validation_issues, batch.issues.length);
  assert.equal(listImportBatches(db).length, 1);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(db.prepare("PRAGMA quick_check").get().quick_check, "ok");
});

test("同 SHA-256 重複匯入不增加任何表的紀錄", async t => {
  const db = memory(t), importer = new SqliteHistoryImporter(db);
  const { batch } = await parsedFixture();
  const first = await importer.importBatch(batch), before = tableCounts(db);
  const again = await importer.importBatch(batch);
  assert.equal(again.status, "already_imported"); assert.equal(again.batchId, first.batchId);
  assert.deepEqual(tableCounts(db), before);
});

test("跨檔相同區間整批拒絕並提供衝突摘要", async t => {
  const db = memory(t), importer = new SqliteHistoryImporter(db);
  await importer.importBatch((await parsedFixture()).batch);
  const before = tableCounts(db);
  const next = await parsedFixture(sheets => setCell(sheets, "machine_3min", "品質備註", "合成跨檔測試"));
  await assert.rejects(importer.importBatch(next.batch), error => {
    assert.equal(error.code, "overlap"); assert.equal(error.conflicts.count, 3);
    assert.deepEqual(new Set(error.conflicts.examples.map(row => row.table)), new Set(["machine_3min", "environment_3min", "alarm_events"]));
    return true;
  });
  assert.deepEqual(tableCounts(db), before); assert.equal(db.isTransaction, false);
});

test("區間部分重疊亦拒絕，不只比對時間標籤", async t => {
  const db = memory(t), importer = new SqliteHistoryImporter(db);
  await importer.importBatch((await parsedFixture()).batch);
  const next = await parsedFixture(sheets => shiftIntervals(sheets, "00:06", "2026-10-01 00:02:00", "2026-10-01 00:05:00"));
  await assert.rejects(importer.importBatch(next.batch), error => error.code === "overlap" && error.conflicts.examples.some(row => row.table === "machine_3min"));
});

test("相鄰區間與同時刻不同感測器事件可分別保存", async t => {
  const db = memory(t), importer = new SqliteHistoryImporter(db);
  await importer.importBatch((await parsedFixture()).batch);
  const next = await parsedFixture(sheets => {
    shiftIntervals(sheets); setCell(sheets, "alarm_events", "感測器ID", "synthetic-second-sensor");
  });
  assert.equal((await importer.importBatch(next.batch)).status, "imported");
  assert.equal(tableCounts(db).machine_3min, 2); assert.equal(tableCounts(db).alarm_events, 2);
});

test("同區間不同設備及不同環境感測點不是重複", async t => {
  const db = memory(t), importer = new SqliteHistoryImporter(db);
  await importer.importBatch((await parsedFixture()).batch);
  const next = await parsedFixture(sheets => {
    setCell(sheets, "machine_3min", "機台", "A2"); setCell(sheets, "environment_3min", "感測器編號", 2);
    setCell(sheets, "alarm_events", "感測器ID", "synthetic-another-sensor");
  });
  assert.equal((await importer.importBatch(next.batch)).status, "imported");
  assert.equal(tableCounts(db).environment_3min, 2);
});

test("NULL 與零值分別保存，待核對不因匯入變合格", async t => {
  const db = memory(t);
  const { batch } = await parsedFixture(sheets => {
    setCell(sheets, "machine_3min", "Red秒", null);
    setCell(sheets, "machine_3min", "品質狀態", "待核對");
    setCell(sheets, "machine_3min", "品質備註", "合成缺值測試");
  });
  await new SqliteHistoryImporter(db).importBatch(batch);
  const row = db.prepare("SELECT * FROM machine_3min").get();
  assert.equal(row.red_seconds, null); assert.equal(row.none_seconds, 0); assert.equal(row.green_seconds, 180);
  assert.equal(row.source_quality_status, "待核對"); assert.equal(row.source_quality_notes, "合成缺值測試");
  assert.equal(row.system_validation_status, "error"); assert.equal(row.analysis_eligible, 0);
  assert.equal(row.source_green_hours, 0.05); // 原始衍生值亦保留，不重算覆寫。
});

test("24:00 保留來源日期並將區間結束保存為次日", async t => {
  const db = memory(t);
  const { batch } = await parsedFixture(sheets => shiftIntervals(sheets, "24:00", "2026-10-01 23:57:00", "2026-10-02 00:00:00"));
  await new SqliteHistoryImporter(db).importBatch(batch);
  for (const table of ["machine_3min", "environment_3min"]) {
    const row = db.prepare(`SELECT source_date,time_label,interval_end FROM ${table}`).get();
    assert.equal(row.source_date, "2026-10-01"); assert.equal(row.time_label, "24:00"); assert.equal(row.interval_end, "2026-10-02T00:00:00+08:00");
  }
});

test("寫入驗證問題時故障會 Rollback 所有本批次資料", async t => {
  const db = memory(t), importer = new SqliteHistoryImporter(db);
  await importer.importBatch((await parsedFixture()).batch);
  const before = tableCounts(db);
  db.exec("CREATE TEMP TRIGGER synthetic_failure BEFORE INSERT ON validation_issues BEGIN SELECT RAISE(ABORT,'synthetic-test-only'); END;");
  const next = await parsedFixture(sheets => {
    shiftIntervals(sheets); setCell(sheets, "alarm_events", "感測器ID", "synthetic-new-event");
  });
  await assert.rejects(importer.importBatch(next.batch), error => error instanceof HistoryImportError && error.code === "write_failed");
  assert.deepEqual(tableCounts(db), before); assert.equal(db.isTransaction, false);
});

test("拒絕加入外部交易，亦不回復呼叫者的交易", async t => {
  const db = memory(t); db.exec("BEGIN IMMEDIATE");
  await assert.rejects(new SqliteHistoryImporter(db).importBatch((await parsedFixture()).batch), error => error.code === "transaction_active");
  assert.equal(db.isTransaction, true); db.exec("ROLLBACK");
});

test("結構缺失不產生批次或半套資料", async t => {
  const db = memory(t);
  const { batch } = await parsedFixture(sheets => sheets.splice(sheets.findIndex(sheet => sheet.name === "README"), 1));
  await assert.rejects(new SqliteHistoryImporter(db).importBatch(batch), error => error.code === "invalid_workbook");
  assert.equal(tableCounts(db).import_batches, 0); assert.equal(tableCounts(db).raw_excel_rows, 0);
});

test("缺必要欄位不寫入資料庫", async t => {
  const db = memory(t);
  const { batch } = await parsedFixture(sheets => { sheets[0].headers.pop(); sheets[0].rows[0].cells.pop(); });
  await assert.rejects(new SqliteHistoryImporter(db).importBatch(batch), error => error.code === "invalid_workbook");
  assert.equal(tableCounts(db).import_batches, 0);
});

test("來源內重複列完整保留，但不納入正式分析", async t => {
  const db = memory(t);
  const { batch } = await parsedFixture(sheets => { sheets[0].rows.push({ row: 3, cells: [...sheets[0].rows[0].cells] }); });
  await new SqliteHistoryImporter(db).importBatch(batch);
  assert.equal(tableCounts(db).machine_3min, 2);
  assert.equal(db.prepare("SELECT sum(analysis_eligible) AS n FROM machine_3min").get().n, 0);
});

test("Alarm 原文與分類、環境數值／單位／暫定門檻保留", async t => {
  const db = memory(t);
  const { batch } = await parsedFixture(); await new SqliteHistoryImporter(db).importBatch(batch);
  const alarm = db.prepare("SELECT * FROM alarm_events").get();
  assert.equal(alarm.category, "completion_notice"); assert.equal(alarm.source_category, batch.alarms[0].sourceCategory);
  assert.equal(alarm.duration_text, "1 minute"); assert.equal(JSON.parse(alarm.rule_condition_json), "yellow");
  const environment = db.prepare("SELECT * FROM environment_3min").get();
  assert.equal(environment.unit, "°C"); assert.equal(environment.average, 25); assert.equal(environment.maximum, 25.2);
  assert.equal(environment.reference_threshold, 26); assert.equal(environment.threshold_provisional, 1);
  assert.equal(environment.source_quality_status, "通過");
});

test("外鍵禁止正規化列指向錯誤工作表", async t => {
  const db = memory(t);
  const result = await new SqliteHistoryImporter(db).importBatch((await parsedFixture()).batch);
  const raw = db.prepare("SELECT id FROM raw_excel_rows WHERE sheet_name='README' LIMIT 1").get();
  assert.throws(() => db.prepare("UPDATE machine_3min SET raw_row_id=? WHERE batch_id=?").run(raw.id, result.batchId), /FOREIGN KEY/);
});

test("拒絕 data/local 外的資料庫位置", () => {
  assert.throws(() => openHistoryDatabase("public/leaked.sqlite"), /data\/local/);
  assert.throws(() => openHistoryDatabase("data/local/../outside.sqlite"), /data\/local/);
});

test("關閉並重開仍保留資料；不同檔名相同 bytes 只匯入一次", async t => {
  const directory = await testDirectory(t), path = resolve(directory, "persistent.sqlite");
  const { bytes } = await parsedFixture();
  const firstFile = resolve(directory, "synthetic-first.xlsx"), copyFile = resolve(directory, "synthetic-copy.xlsx");
  await writeFile(firstFile, bytes); await writeFile(copyFile, bytes);
  let db = openHistoryDatabase(path);
  let first;
  try { first = await new SqliteHistoryImporter(db).importFile(firstFile); } finally { db.close(); }
  db = openHistoryDatabase(path);
  try {
    const again = await new SqliteHistoryImporter(db).importFile(copyFile);
    assert.equal(again.status, "already_imported"); assert.equal(again.batchId, first.batchId);
    assert.equal(tableCounts(db).import_batches, 1); assert.equal(tableCounts(db).machine_3min, 1);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});

test("拒絕不屬於本專案的既有 SQLite 與未來版本", async t => {
  const directory = await testDirectory(t), path = resolve(directory, "unknown.sqlite");
  let db = createDatabase(path); db.exec("CREATE TABLE external_data (id INTEGER)"); db.close();
  assert.throws(() => openHistoryDatabase(path), /非本專案/);
  const futurePath = resolve(directory, "future.sqlite");
  db = openHistoryDatabase(futurePath); db.exec("PRAGMA user_version=999"); db.close();
  assert.throws(() => openHistoryDatabase(futurePath), /版本不相容/);
});

test("CLI 匯入、批次查詢及非法參數均不需要網路", async t => {
  const directory = await testDirectory(t), database = resolve(directory, "cli.sqlite"), filename = resolve(directory, "synthetic-cli.xlsx");
  await writeFile(filename, (await parsedFixture()).bytes);
  const first = await importHistoryCommand(["--database", database, "--file", filename]);
  assert.equal(first.exitCode, 0); assert.equal(first.report.status, "imported");
  const list = await importHistoryCommand(["--database", database, "--list"]);
  assert.equal(list.exitCode, 0); assert.equal(list.report.batches.length, 1);
  assert.equal((await importHistoryCommand(["--file"])).exitCode, 2);
  assert.equal((await importHistoryCommand(["--list", "--file", filename])).exitCode, 2);
});

test("缺少本機 Excel 時明確失敗，不建立企業替代資料", async t => {
  const directory = await testDirectory(t), database = resolve(directory, "missing.sqlite");
  const result = await importHistoryCommand(["--database", database, "--file", resolve(directory, "missing.xlsx")]);
  assert.equal(result.exitCode, 2); assert.equal(result.report.status, "file_read_error");
  const db = openHistoryDatabase(database);
  try { assert.equal(tableCounts(db).import_batches, 0); } finally { db.close(); }
});
