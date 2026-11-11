import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseHistoryFile } from "../../src/lib/history/parser.ts";
import { summarizeHistory } from "../../src/lib/history/summary.ts";
import { DEFAULT_HISTORY_SAMPLE } from "../../scripts/validate-history.ts";

test("本機真實企業樣本：六張表、完整性、空值、跨日、品質與事件分類，原檔不變", async () => {
  // 明確讀取使用者樣本；缺檔即失敗，不使用合成資料冒充或自動跳過。
  const before = await readFile(DEFAULT_HISTORY_SAMPLE);
  const hash = createHash("sha256").update(before).digest("hex");
  const result = await parseHistoryFile(DEFAULT_HISTORY_SAMPLE);
  const summary = summarizeHistory(result);
  assert.equal(result.source.sha256, hash);
  assert.equal(result.rawSheets.length, 6);
  assert.deepEqual(Object.fromEntries(result.rawSheets.map(sheet => [sheet.name, sheet.rows.length])), {
    machine_3min: 3840, alarm_events: 33, environment_3min: 3840, quality_issues: 3840, data_dictionary: 19, README: 20,
  });
  assert(result.contract);
  assert.equal(result.contract.timeZoneBasis, "source_dictionary_convention_not_vendor_confirmed");
  assert.deepEqual(result.coverage, { machinesComplete: true, environmentComplete: true });
  for (const id of ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"]) assert.equal(result.machines.filter(row => row.machineId === id).length, 480);
  assert(result.machines.every(row => row.quality.sourceStatus === "待核對" && !row.quality.eligibleForAnalysis));
  assert(result.machines.every(row => row.seconds.red === null && row.seconds.blue === null && row.seconds.white === null));
  assert(result.machines.every(row => row.sourceRatios.interval === null && row.sourceRatios.powered === null));
  assert(result.machines.filter(row => row.timeLabel === "24:00").every(row => row.sourceDate === "2026-10-01" && row.intervalEnd === "2026-10-02T00:00:00+08:00"));
  assert.equal(summary.machines.boundary24Rows, 8);
  assert.equal(summary.environment.eligibleRows, 3840);
  assert(result.environment.every(row => row.thresholdProvisional && ["°C", "%RH"].includes(row.unit)));
  assert.deepEqual({ ...summary.alarms.categories }, { completion_notice: 13, environment_alert: 20 });
  assert.equal(summary.alarms.missingDuration, 4);
  assert.equal(summary.alarms.missingRuleName, 6);
  assert.equal(summary.sourceQualityIssues.unmatched, 0);
  assert.equal(summary.validation.duplicateRows, 0);
  assert(!result.issues.some(issue => ["unsupported_dictionary_rule", "readme_count_mismatch", "invalid_timestamp", "interval_label_mismatch"].includes(issue.code)));
  assert.deepEqual(await readFile(DEFAULT_HISTORY_SAMPLE), before);
  console.log(JSON.stringify({ genuineSample: true, sheetRows: summary.sheets.map(({name,rows})=>({name,rows})), machines:summary.machines.perMachine,
    eligibleMachineRows:summary.machines.eligibleRows, eligibleEnvironmentRows:summary.environment.eligibleRows, coverage:summary.coverage,
    validationCodes:summary.validation.codes, alarmCategories:summary.alarms.categories, originalHashUnchanged:true }));
});
