import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHistorySheets, numericValue } from "../../src/lib/history/parser.ts";
import { readHistoryBuffer } from "../../src/lib/history/reader.ts";
import { normalizeDate, normalizeMachineId, parseTimeLabel } from "../../src/lib/history/time.ts";
import { validateHistoryCommand } from "../../scripts/validate-history.ts";
import { fixtureSheets, fixtureZip, setCell, TEST_SOURCE } from "./fixtures.mjs";

const parse = sheets => parseHistorySheets(sheets, TEST_SOURCE);
const codes = result => result.issues.map(issue => issue.code);

test("直接讀取 x: 命名空間 XLSX、六張表、數字詞彙及空值，不變更輸入位元組", async () => {
  const sheets = fixtureSheets();
  setCell(sheets, "machine_3min", "品質備註", "  原始空白保留  ");
  const bytes = fixtureZip(sheets), before = bytes.slice();
  const read = await readHistoryBuffer(bytes, TEST_SOURCE.filename);
  assert.deepEqual(bytes, before);
  assert.equal(read.sheets.length, 6);
  const machine = read.sheets.find(sheet => sheet.name === "machine_3min");
  assert.deepEqual(machine.rows[0].cells[9], { kind: "number", lexeme: "180" });
  assert.equal(machine.rows[0].cells[20], "  原始空白保留  ");
  assert.equal(parseHistorySheets(read.sheets, read.source).machines[0].seconds.green, 180);
});

for (const sheet of ["machine_3min", "environment_3min", "alarm_events", "quality_issues", "data_dictionary", "README"]) {
  test("工作表缺失：" + sheet, async () => {
    const bytes = fixtureZip(fixtureSheets().filter(item => item.name !== sheet));
    const read = await readHistoryBuffer(bytes, TEST_SOURCE.filename);
    const result = parse(read.sheets);
    assert(codes(result).includes("missing_sheet"));
    assert.equal(result.contract, null);
    assert.equal(result.rawSheets.length, 5);
  });
}

test("必要欄位缺失，保留全部原始表且停止正規化", () => {
  const sheets = fixtureSheets();
  const sheet = sheets.find(item => item.name === "machine_3min");
  const index = sheet.headers.indexOf("Green秒");
  sheet.headers.splice(index, 1); sheet.rows.forEach(row => row.cells.splice(index, 1));
  const result = parse(sheets);
  assert(codes(result).includes("missing_column"));
  assert.equal(result.machines.length, 0);
  assert.equal(result.rawSheets, sheets);
});

test("欄位重排仍依名稱讀取，包含字典與 README", () => {
  const sheets = fixtureSheets();
  for (const sheet of sheets) { sheet.headers.reverse(); sheet.rows.forEach(row => row.cells.reverse()); }
  const result = parse(sheets);
  assert(result.contract);
  assert.equal(result.machines[0].seconds.green, 180);
  assert.equal(result.machines[0].machineId, "A1");
});

test("重複表頭、重複工作表與無欄名資料皆拒絕", () => {
  const duplicateColumn = fixtureSheets();
  duplicateColumn[0].headers.push("Green秒");
  assert(codes(parse(duplicateColumn)).includes("duplicate_column"));
  const duplicateSheet = fixtureSheets(); duplicateSheet.push(structuredClone(duplicateSheet[0]));
  assert(codes(parse(duplicateSheet)).includes("duplicate_sheet"));
  const unlabelled = fixtureSheets(); unlabelled[0].rows[0].cells.push("不准丟棄");
  assert(codes(parse(unlabelled)).includes("unlabelled_cells"));
});

test("字典規則或時區不同時不沿用已確認規則", () => {
  const sheets = fixtureSheets();
  const dictionary = sheets.find(sheet => sheet.name === "data_dictionary");
  dictionary.rows.find(row => row.cells[0] === "燈號時間單位").cells[1] = "小時";
  assert(codes(parse(sheets)).includes("unsupported_dictionary_rule"));
  assert.equal(parse(sheets).contract, null);
  const noZone = fixtureSheets(); noZone.find(sheet => sheet.name === "data_dictionary").rows.find(row => row.cells[0] === "區間開始／結束").cells[2] = "尚未確認";
  assert(codes(parse(noZone)).includes("unconfirmed_timezone"));
});

test("README 日期、粒度或機台數錯誤時停止正規化", () => {
  const sheets = fixtureSheets();
  sheets.find(sheet => sheet.name === "README").rows.find(row => row.cells[0] === "機台數").cells[1] = 9;
  assert(codes(parse(sheets)).includes("unsupported_readme_contract"));
  assert.equal(parse(sheets).contract, null);
});

test("空值與零值保持不同，不把空白字串或數字文字當作零", () => {
  const sheets = fixtureSheets();
  setCell(sheets, "machine_3min", "Red秒", null);
  setCell(sheets, "machine_3min", "品質狀態", "待核對");
  const result = parse(sheets);
  assert.equal(result.machines[0].seconds.red, null);
  assert.equal(result.machines[0].seconds.none, 0);
  assert.equal(result.machines[0].quality.eligibleForAnalysis, false);
  assert(codes(result).includes("missing_lamp_seconds"));
  for (const value of ["", "0", { kind: "number", lexeme: "" }, { kind: "number", lexeme: "NaN" }, { kind: "number", lexeme: "1e999" }]) assert.equal(numericValue(value), null);
  assert.equal(numericValue({ kind: "number", lexeme: "0" }), 0);
});

test("24:00 正規化為次日00:00，來源日期與原始標籤不變", () => {
  const sheets = fixtureSheets();
  for (const [column, value] of [["時間", "24:00"], ["區間開始", "2026-10-01 23:57:00"], ["區間結束", "2026-10-02 00:00:00"]]) setCell(sheets, "machine_3min", column, value);
  const machine = parse(sheets).machines[0];
  assert.equal(machine.sourceDate, "2026-10-01");
  assert.equal(machine.timeLabel, "24:00");
  assert.equal(machine.intervalEnd, "2026-10-02T00:00:00+08:00");
  assert.equal(machine.intervalStart, "2026-10-01T23:57:00+08:00");
});

test("跨月、跨年及閏日檢查，不依賴程序本地時區", () => {
  assert.equal(normalizeDate("2028/02/29"), "2028-02-29");
  for (const value of ["2026-02-29", "2026-02-30", "2026-13-01", "10/01/2026", "not-a-date"]) assert.equal(normalizeDate(value), null);
  assert.equal(parseTimeLabel("24:00").seconds, 86400);
  for (const value of ["24:01", "25:00", "00:60", "9:00"]) assert.equal(parseTimeLabel(value), null);
  const sheets = fixtureSheets();
  const readme = sheets.find(sheet => sheet.name === "README");
  readme.rows.find(row => row.cells[0] === "資料日期").cells[1] = "2026-12-31";
  for (const [column, value] of [["日期", "2026-12-31"], ["時間", "24:00"], ["區間開始", "2026-12-31 23:57:00"], ["區間結束", "2027-01-01 00:00:00"]]) setCell(sheets, "machine_3min", column, value);
  assert.equal(parse(sheets).machines[0].intervalEnd, "2027-01-01T00:00:00+08:00");
});

for (const [column, value, code] of [["日期", "2026-02-30", "invalid_date"], ["時間", "24:01", "invalid_time_label"], ["時間", "00:00", "invalid_time_label"], ["區間結束", "2026-10-01 24:00:00", "invalid_timestamp"], ["區間結束", "2026-10-01 00:06:00", "invalid_interval_duration"], ["日期", "2026-10-02", "source_date_mismatch"]]) {
  test("日期／時間異常可追溯：" + column + " / " + code, () => {
    const sheets = fixtureSheets(); setCell(sheets, "machine_3min", column, value);
    const result = parse(sheets);
    const issue = result.issues.find(issue => issue.code === code && issue.sheet === "machine_3min");
    assert.equal(issue.row, 2);
    assert.equal(result.machines[0].quality.eligibleForAnalysis, false);
    assert.equal(sheets[0].rows[0].cells[sheets[0].headers.indexOf(column)], value);
  });
}

test("機台 ID 正規化只接受 A1～A4、B1～B4；區域不一致會標記", () => {
  assert.equal(normalizeMachineId(" a1 "), "A1");
  for (const value of ["A0", "A5", "B5", "C1", "A01", null]) assert.equal(normalizeMachineId(value), null);
  const sheets = fixtureSheets(); setCell(sheets, "machine_3min", "機台", "B4");
  assert(codes(parse(sheets)).includes("machine_area_mismatch"));
  setCell(sheets, "machine_3min", "機台", "C1");
  assert(codes(parse(sheets)).includes("invalid_machine_id"));
});

test("重複機台紀錄全部保留、全部排除分析並關聯來源列", () => {
  const sheets = fixtureSheets(); sheets[0].rows.push({ row: 3, cells: [...sheets[0].rows[0].cells] });
  const result = parse(sheets);
  assert.equal(result.machines.length, 2);
  assert(result.machines.every(row => !row.quality.eligibleForAnalysis));
  const duplicates = result.issues.filter(issue => issue.code === "duplicate_record" && issue.sheet === "machine_3min");
  assert.equal(duplicates.length, 2);
  assert.deepEqual(duplicates[0].relatedRows, [2, 3]);
});

test("缺少七台資料時標記完整性，不補造機台或區間", () => {
  const result = parse(fixtureSheets());
  assert.equal(result.machines.length, 1);
  assert.equal(result.coverage.machinesComplete, false);
  assert(codes(result).includes("incomplete_interval_coverage"));
});

test("來源品質、備註與原始值精確保留，不修改傳入資料", () => {
  const sheets = fixtureSheets();
  setCell(sheets, "machine_3min", "品質狀態", "待核對");
  setCell(sheets, "machine_3min", "品質備註", "  原始原因保留  ");
  const before = structuredClone(sheets), result = parse(sheets);
  assert.deepEqual(sheets, before);
  assert.equal(result.machines[0].quality.sourceStatus, "待核對");
  assert.equal(result.machines[0].quality.sourceNotes, "  原始原因保留  ");
  assert.equal(result.machines[0].sourceRatios.interval, 1);
  assert.equal(result.machines[0].quality.eligibleForAnalysis, false);
  assert(codes(result).includes("ratio_on_unqualified_row"));
});

test("來源品質問題可以關聯機台；不能因標示通過而忽略問題表", () => {
  const sheets = fixtureSheets();
  sheets.find(sheet => sheet.name === "quality_issues").rows.push({ row: 2, cells: ["2026-10-01", "00:03", "A1", "合成待核對原因", null] });
  const result = parse(sheets);
  assert.deepEqual(result.sourceQualityIssues[0].matchedMachineRows, [2]);
  assert.equal(result.sourceQualityIssues[0].totalSeconds, null);
  assert.equal(result.machines[0].quality.eligibleForAnalysis, false);
  assert(codes(result).includes("source_quality_conflict"));
});

test("非零 Blue／White 與負秒數會標記，原始數值不刪除", () => {
  for (const column of ["Blue秒", "White秒"]) {
    const sheets = fixtureSheets(); setCell(sheets, "machine_3min", column, 1);
    assert(codes(parse(sheets)).includes("unexpected_lamp_color"));
    assert.equal(parse(sheets).machines[0].quality.eligibleForAnalysis, false);
  }
  const sheets = fixtureSheets(); setCell(sheets, "machine_3min", "Green秒", -1);
  assert(codes(parse(sheets)).includes("invalid_number"));
  assert.equal(sheets[0].rows[0].cells[9], -1);
});

test("六態總和180±1秒容差，不變更各態秒數", () => {
  const sheets = fixtureSheets(); setCell(sheets, "machine_3min", "Green秒", 180.5);
  const result = parse(sheets);
  assert.equal(result.machines[0].seconds.green, 180.5);
  assert(!codes(result).includes("invalid_lamp_total"));
  setCell(sheets, "machine_3min", "Green秒", 182);
  assert(codes(parse(sheets)).includes("invalid_lamp_total"));
});

test("來源小時或比例不符公式時標記；開機分母為零不能以0比例替代", () => {
  const sheets = fixtureSheets(); setCell(sheets, "machine_3min", "加工小時", 1);
  assert(codes(parse(sheets)).includes("source_hours_mismatch"));
  const zero = fixtureSheets();
  for (const [column, value] of [["Green秒", 0], ["None秒", 180], ["加工小時", 0], ["未開機小時", 0.05], ["區間加工比例", 0], ["開機加工比例", 0]]) setCell(zero, "machine_3min", column, value);
  assert(codes(parse(zero)).includes("source_ratio_mismatch"));
  setCell(zero, "machine_3min", "開機加工比例", null);
  assert.equal(parse(zero).machines[0].quality.eligibleForAnalysis, true);
});

test("來源已知秒數的合計、小時及有效分母比例若缺漏，只標記、不代填", () => {
  for (const [column, code] of [["四態合計秒", "missing_four_state_total"], ["加工小時", "missing_source_hours"], ["區間加工比例", "missing_source_ratio"]]) {
    const sheets = fixtureSheets(); setCell(sheets, "machine_3min", column, null);
    const result = parse(sheets);
    assert(codes(result).includes(code));
    assert.equal(result.machines[0].quality.eligibleForAnalysis, false);
    assert.equal(sheets[0].rows[0].cells[sheets[0].headers.indexOf(column)], null);
  }
});

test("Alarm 精確保留秒級時間與持續時間，不把未知或紅燈事件視為故障", () => {
  const sheets = fixtureSheets();
  setCell(sheets, "alarm_events", "初步事件分類", "待分類");
  setCell(sheets, "alarm_events", "當前值", "red");
  setCell(sheets, "alarm_events", "持續時間原文", null);
  const alarm = parse(sheets).alarms[0];
  assert.equal(alarm.occurredAt, "2026-10-01T09:01:12+08:00");
  assert.equal(alarm.durationText, null);
  assert.equal(alarm.category, "unclassified");
  assert.equal(alarm.currentValue, "red");
  assert(codes(parse(sheets)).includes("missing_alarm_duration"));
});

test("Alarm 相同事件標記重複、同時間不同感測器仍保留為不同事件", () => {
  const sheets = fixtureSheets(); const events = sheets.find(sheet => sheet.name === "alarm_events");
  events.rows.push({ row: 3, cells: [...events.rows[0].cells] });
  assert.equal(parse(sheets).issues.filter(issue => issue.code === "duplicate_record" && issue.sheet === "alarm_events").length, 2);
  setCell(sheets, "alarm_events", "感測器ID", "other-synthetic-sensor", 1);
  assert.equal(parse(sheets).issues.filter(issue => issue.code === "duplicate_record" && issue.sheet === "alarm_events").length, 0);
});

test("環境單位來自已確認字典；超過參考門檻不等於品質不合格", () => {
  const sheets = fixtureSheets();
  for (const [column, value] of [["平均", 27], ["最大", 27.2], ["中位數", 27], ["最小", 26.8], ["最大值判斷", "超過參考值"]]) setCell(sheets, "environment_3min", column, value);
  const env = parse(sheets).environment[0];
  assert.equal(env.unit, "°C");
  assert.equal(env.thresholdProvisional, true);
  assert.equal(env.quality.eligibleForAnalysis, true);
  setCell(sheets, "environment_3min", "類別", "未知感測器");
  assert.equal(parse(sheets).environment[0].unit, null);
});

test("環境缺值、錯誤統計與重複資料均有紀錄，不補造讀值", () => {
  const sheets = fixtureSheets(); setCell(sheets, "environment_3min", "平均", null);
  assert.equal(parse(sheets).environment[0].values.average, null);
  assert(codes(parse(sheets)).includes("missing_environment_value"));
  setCell(sheets, "environment_3min", "平均", 999);
  assert(codes(parse(sheets)).includes("environment_stat_order"));
  const env = sheets.find(sheet => sheet.name === "environment_3min"); env.rows.push({ row: 3, cells: [...env.rows[0].cells] });
  assert(parse(sheets).issues.some(issue => issue.code === "duplicate_record" && issue.sheet === "environment_3min"));
});

test("拒絕損壞 ZIP，不產生替代資料", async () => {
  await assert.rejects(readHistoryBuffer(new Uint8Array([1, 2, 3]), "synthetic-invalid.xlsx"), { code: "invalid_xlsx" });
});

test("CLI 缺少檔案或參數不正確時明確失敗，不建立替代樣本", async () => {
  const missing = await validateHistoryCommand(["--file", "data/samples/__synthetic_missing_file_never_created__.xlsx"]);
  assert.equal(missing.exitCode, 2);
  assert.equal(missing.report.status, "file_read_error");
  assert.equal((await validateHistoryCommand(["--unknown"])).report.status, "invalid_arguments");
});

for (const [name, xml, code] of [
  ["公式", '<x:c r="T99"><x:f>1+1</x:f><x:v>2</x:v></x:c>', "unsupported_formula"],
  ["錯誤", '<x:c r="T99" t="e"><x:v>#DIV/0!</x:v></x:c>', "excel_cell_error"],
]) {
  test("不能讓" + name + "被當作普通數值或空白；錯誤包含 ZIP 項目及儲存格", async () => {
    const bytes = fixtureZip(fixtureSheets(), (entry, source) => entry.endsWith("sheet1.xml") ? source.replace("</x:sheetData>", '<x:row r="99"><x:c r="A99"/>' + xml + '</x:row></x:sheetData>') : source);
    await assert.rejects(readHistoryBuffer(bytes, TEST_SOURCE.filename), { code, entry: "xl/worksheets/sheet1.xml", cell: "T99" });
  });
}
