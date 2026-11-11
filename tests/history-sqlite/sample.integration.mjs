import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { openHistoryDatabase } from "../../src/lib/history/sqlite/database.ts";
import { SqliteHistoryImporter } from "../../src/lib/history/sqlite/importer.ts";
import { DEFAULT_HISTORY_SAMPLE } from "../../scripts/validate-history.ts";
import { testDirectory, tableCounts } from "./helpers.mjs";

test("真實 Excel：獨立 SQLite 完整匯入、原值／品質／跨日／事件、重複、重疊及持久保存", async t => {
  const directory = await testDirectory(t), path = resolve(directory, "genuine-sample.sqlite");
  const bytes = await readFile(DEFAULT_HISTORY_SAMPLE);
  const hash = createHash("sha256").update(bytes).digest("hex");
  let db = openHistoryDatabase(path), first;
  try {
    const importer = new SqliteHistoryImporter(db);
    first = await importer.importFile(DEFAULT_HISTORY_SAMPLE);
    assert.equal(first.status, "imported");
    assert.deepEqual(first.counts, { rawRows: 11592, sheets: 6, machines: 3840, environment: 3840,
      alarms: 33, sourceQualityIssues: 3840, validationIssues: 11524 });
    assert.deepEqual(first.quality, { machineAnalysisEligible: 0, environmentAnalysisEligible: 3840,
      validationErrors: 3840, validationWarnings: 7684, coverage: { machinesComplete: true, environmentComplete: true } });
    assert.deepEqual(Object.fromEntries(db.prepare("SELECT sheet_name,count(*) AS n FROM raw_excel_rows GROUP BY sheet_name").all().map(row => [row.sheet_name, row.n])), {
      README: 20, alarm_events: 33, data_dictionary: 19, environment_3min: 3840, machine_3min: 3840, quality_issues: 3840,
    });
    assert.equal(db.prepare("SELECT source_sha256 FROM import_batches").get().source_sha256, hash);
    assert.equal(db.prepare("SELECT count(*) AS n FROM machine_3min WHERE source_quality_status='待核對' AND analysis_eligible=0").get().n, 3840);
    assert.equal(db.prepare("SELECT count(*) AS n FROM machine_3min WHERE red_seconds IS NULL AND blue_seconds IS NULL AND white_seconds IS NULL").get().n, 3840);
    assert.equal(db.prepare("SELECT count(*) AS n FROM machine_3min WHERE source_interval_ratio IS NULL AND source_powered_ratio IS NULL").get().n, 3840);
    assert.equal(db.prepare("SELECT count(*) AS n FROM machine_3min WHERE none_seconds IS NULL").get().n, 3337);
    assert.equal(db.prepare("SELECT count(*) AS n FROM machine_3min WHERE yellow_seconds IS NULL").get().n, 2976);
    assert.equal(db.prepare("SELECT count(*) AS n FROM machine_3min WHERE green_seconds IS NULL").get().n, 849);
    for (const table of ["machine_3min", "environment_3min"]) {
      assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE time_label='24:00' AND source_date='2026-10-01' AND interval_end='2026-10-02T00:00:00+08:00'`).get().n, 8);
    }
    const originalFirst = db.prepare("SELECT green_seconds,source_green_hours FROM machine_3min WHERE machine_id='A1' ORDER BY interval_start LIMIT 1").get();
    assert.equal(originalFirst.green_seconds, 179.97); assert.equal(originalFirst.source_green_hours, 0.04999166666666666);
    assert.deepEqual(Object.fromEntries(db.prepare("SELECT category,count(*) AS n FROM alarm_events GROUP BY category").all().map(row => [row.category, row.n])), { completion_notice: 13, environment_alert: 20 });
    assert.deepEqual(Object.fromEntries(db.prepare("SELECT unit,count(*) AS n FROM environment_3min GROUP BY unit").all().map(row => [row.unit, row.n])), { "%RH": 1920, "°C": 1920 });
    assert.equal(db.prepare("SELECT count(*) AS n FROM environment_3min WHERE source_quality_status='通過' AND threshold_provisional=1 AND analysis_eligible=1").get().n, 3840);
    assert.equal(tableCounts(db).quality_issue_machine_links, 3840);
    const before = tableCounts(db);
    const again = await importer.importFile(DEFAULT_HISTORY_SAMPLE);
    assert.equal(again.status, "already_imported"); assert.equal(again.batchId, first.batchId);
    assert.deepEqual(tableCounts(db), before);
    // 只重壓縮獨立測試副本，內部 Excel 項目不變，原始企業檔案不寫入。
    const conflicting = resolve(directory, "test-repacked-copy.xlsx");
    const repacked = zipSync(unzipSync(bytes), { level: 1, mtime: new Date(2026, 0, 1) });
    assert.notEqual(createHash("sha256").update(repacked).digest("hex"), hash);
    await writeFile(conflicting, repacked);
    await assert.rejects(importer.importFile(conflicting), error => error.code === "overlap" && error.conflicts.count === 7713 && error.conflicts.examples.length === 10);
    assert.deepEqual(tableCounts(db), before);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  } finally { db.close(); }
  db = openHistoryDatabase(path);
  try { assert.equal(tableCounts(db).machine_3min, 3840); assert.equal(tableCounts(db).import_batches, 1); } finally { db.close(); }
  assert.deepEqual(await readFile(DEFAULT_HISTORY_SAMPLE), bytes);
  console.log(JSON.stringify({ genuineSample: true, independentTestDatabase: true, counts: first.counts,
    quality: first.quality, duplicateBlocked: true, overlappingFileRejected: true, persistenceVerified: true, originalUnchanged: true }));
});
