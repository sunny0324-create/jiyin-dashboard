import "server-only";

import { HISTORY_COLUMNS, HISTORY_SHEETS, HISTORY_RULE_VERSION, MACHINE_IDS, SUPPORTED_DEFINITIONS } from "./schema";
import { intervalFromLabel, normalizeDate, normalizeMachineId, parseTimeLabel, parseTimestamp } from "./time";
import { readHistoryFile } from "./reader";
import type { HistorySheetName } from "./schema";
import type { AlarmRecord, EnvironmentRecord, Interval, MachineRecord, ParsedHistory, Quality, RawCell, RawRow, RawSheet, SourceFile, SourceRef, ValidationIssue, WorkbookContract } from "./types";

export function numericValue(value: RawCell | undefined): number | null {
  if (typeof value === "object" && value?.kind === "number" &&
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.lexeme)) return null;
  const number = typeof value === "number" ? value :
    typeof value === "object" && value?.kind === "number" ? Number(value.lexeme) : null;
  return number !== null && Number.isFinite(number) ? number : null;
}

function rawCell(sheet: RawSheet, row: RawRow, column: string): RawCell {
  const index = sheet.headers.findIndex((cell) => typeof cell === "string" && cell.trim() === column);
  return row.cells[index] ?? null;
}

class RowReader {
  readonly source: SourceRef;
  constructor(readonly sheet: RawSheet, readonly row: RawRow, readonly issues: ValidationIssue[]) {
    this.source = { sheet: sheet.name as HistorySheetName, row: row.row };
  }
  issue(code: string, message: string, column?: string, severity: "error" | "warning" = "error") {
    this.issues.push({ ...this.source, code, message, column, severity });
  }
  raw(column: string): RawCell {
    return rawCell(this.sheet, this.row, column);
  }
  text(column: string, required = false): string | null {
    const value = this.raw(column);
    if (value === null || (typeof value === "string" && !value.trim())) {
      if (required) this.issue("missing_value", "必要文字值缺漏。", column);
      return null;
    }
    if (typeof value === "string") return value;
    this.issue("invalid_text", "此格式要求文字欄位，不自動猜測其他儲存格型別。", column);
    return null;
  }
  number(column: string, nonnegative = false): number | null {
    const raw = this.raw(column);
    if (raw === null) return null;
    const value = numericValue(raw);
    if (value === null || (nonnegative && value < 0)) {
      this.issue("invalid_number", "數值無效或違反非負限制，保留原值，不補零。", column);
      return null;
    }
    return value;
  }
}

function area(reader: RowReader): "A" | "B" | null {
  const value = reader.text("區域", true)?.trim().toUpperCase();
  if (value === "A" || value === "B") return value;
  reader.issue("invalid_area", "區域僅接受 A 或 B。", "區域");
  return null;
}

function quality(reader: RowReader, statusColumn: string, notesColumn: string): Quality {
  const sourceStatus = reader.text(statusColumn, true);
  const sourceNotes = reader.text(notesColumn);
  if (sourceStatus?.trim() !== "通過") reader.issue("source_quality_not_passed", "來源品質未通過，不得納入正式分析。", statusColumn, "warning");
  return { sourceStatus, sourceNotes, eligibleForAnalysis: sourceStatus?.trim() === "通過" };
}

function interval(reader: RowReader, contract: WorkbookContract, includeBounds = true): Interval {
  const sourceDate = normalizeDate(reader.text("日期", true));
  if (!sourceDate) reader.issue("invalid_date", "日期無效，必須是合法的 YYYY-MM-DD 日期。", "日期");
  else if (sourceDate !== contract.sourceDate) reader.issue("source_date_mismatch", "資料日期與 README 來源日期不一致。", "日期");
  const time = parseTimeLabel(reader.text("時間", true));
  if (!time || time.seconds < 180 || time.seconds % 180 !== 0) reader.issue("invalid_time_label", "區間結束標籤必須為 00:03 至 24:00 的三分鐘格點。", "時間");
  const expected = sourceDate && time && time.seconds >= 180 && time.seconds % 180 === 0 ? intervalFromLabel(sourceDate, time.seconds) : null;
  if (!includeBounds) return { sourceDate, timeLabel: time?.label ?? null, intervalStart: expected?.intervalStart ?? null, intervalEnd: expected?.intervalEnd ?? null };
  const intervalStart = parseTimestamp(reader.text("區間開始", true));
  const intervalEnd = parseTimestamp(reader.text("區間結束", true));
  if (!intervalStart || !intervalEnd) reader.issue("invalid_timestamp", "區間時間戳記無效，不以推算結果覆寫來源。", "區間開始／結束");
  else if (Date.parse(intervalEnd) - Date.parse(intervalStart) !== contract.intervalSeconds * 1000) reader.issue("invalid_interval_duration", "區間長度必須為180秒。", "區間開始／結束");
  if (expected && (expected.intervalStart !== intervalStart || expected.intervalEnd !== intervalEnd)) {
    reader.issue("interval_label_mismatch", "來源起迄時間與結束標籤不一致，24:00 必須對應次日00:00。", "區間開始／結束");
  }
  return { sourceDate, timeLabel: time?.label ?? null, intervalStart, intervalEnd };
}

function hasRowError(reader: RowReader): boolean {
  return reader.issues.some((issue) => issue.sheet === reader.source.sheet && issue.row === reader.source.row && issue.severity === "error");
}

function parseMachine(reader: RowReader, contract: WorkbookContract): MachineRecord {
  const times = interval(reader, contract);
  const machineId = normalizeMachineId(reader.text("機台", true));
  if (!machineId) reader.issue("invalid_machine_id", "機台 ID 必須為 A1～A4 或 B1～B4。", "機台");
  const region = area(reader);
  if (machineId && region && machineId[0] !== region) reader.issue("machine_area_mismatch", "機台與區域不一致。", "區域");
  const seconds = {
    none: reader.number("None秒", true), red: reader.number("Red秒", true),
    yellow: reader.number("Yellow秒", true), green: reader.number("Green秒", true),
    blue: reader.number("Blue秒", true), white: reader.number("White秒", true),
  };
  const sourceFourStateSeconds = reader.number("四態合計秒", true);
  const sourceHours = {
    green: reader.number("加工小時", true), yellow: reader.number("待機小時", true),
    red: reader.number("異常小時", true), none: reader.number("未開機小時", true),
  };
  const sourceRatios = { interval: reader.number("區間加工比例", true), powered: reader.number("開機加工比例", true) };
  const state = quality(reader, "品質狀態", "品質備註");
  const four = [seconds.none, seconds.red, seconds.yellow, seconds.green];
  if (four.some((value) => value === null)) reader.issue("missing_lamp_seconds", "四個必要燈態存在缺值，不能補零或計算加工比例。", "None秒／Red秒／Yellow秒／Green秒");
  const six = Object.values(seconds);
  const complete = six.every((value): value is number => value !== null);
  if (!complete) reader.issue("unverifiable_six_state_total", "六態含缺值，無法驗證180秒±1秒，缺漏不視為零。", "Blue秒／White秒", "warning");
  else if (Math.abs(six.reduce((sum, value) => sum + value, 0) - 180) > contract.toleranceSeconds + 1e-8) {
    reader.issue("invalid_lamp_total", "六態合計不符合180秒±1秒暫定容差。", "六態合計");
  }
  if ((seconds.blue !== null && seconds.blue !== 0) || (seconds.white !== null && seconds.white !== 0)) {
    reader.issue("unexpected_lamp_color", "Blue／White 出現非零值，保留原值並排除正常分析。", "Blue秒／White秒");
  }
  if (four.every((value): value is number => value !== null) && sourceFourStateSeconds !== null &&
    Math.abs(four.reduce((sum, value) => sum + value, 0) - sourceFourStateSeconds) > 1e-6) {
    reader.issue("four_state_total_mismatch", "來源四態合計與來源秒數不符。", "四態合計秒");
  }
  if (four.every((value) => value !== null) && sourceFourStateSeconds === null) {
    reader.issue("missing_four_state_total", "必要四態皆有值，但來源合計缺漏，保留待核對。", "四態合計秒");
  }
  for (const color of ["green", "yellow", "red", "none"] as const) {
    if (seconds[color] !== null && sourceHours[color] !== null &&
      Math.abs(seconds[color] / 3600 - sourceHours[color]) > 1e-6) reader.issue("source_hours_mismatch", "來源小時欄不符合秒數除以3600。", color);
    if (seconds[color] === null && sourceHours[color] !== null) reader.issue("hours_without_seconds", "來源秒數缺漏，但小時欄存在數值。", color);
    if (seconds[color] !== null && sourceHours[color] === null) reader.issue("missing_source_hours", "來源秒數有值，但小時欄缺漏，不代填衍生值。", color);
  }
  state.eligibleForAnalysis = state.eligibleForAnalysis && complete && !hasRowError(reader);
  if (!state.eligibleForAnalysis && (sourceRatios.interval !== null || sourceRatios.powered !== null)) {
    reader.issue("ratio_on_unqualified_row", "品質未通過卻有來源比例，保留數值但禁止用於正式分析。", "區間加工比例／開機加工比例");
  }
  // 只驗證來源已提供的比例，不新增比例或把 null 變成0。
  if (state.eligibleForAnalysis && four.every((value): value is number => value !== null)) {
    const denominators = { interval: four.reduce((sum, value) => sum + value, 0), powered: seconds.red! + seconds.yellow! + seconds.green! };
    for (const name of ["interval", "powered"] as const) {
      const original = sourceRatios[name];
      if (original === null && denominators[name] > 0) reader.issue("missing_source_ratio", "字典要求的來源比例缺漏，不代填正式比例。", name);
      if (original !== null && (denominators[name] <= 0 || Math.abs(original - seconds.green! / denominators[name]) > 1e-6)) {
        reader.issue("source_ratio_mismatch", "來源比例與字典公式不符或分母為零。", name);
      }
    }
  }
  state.eligibleForAnalysis = state.eligibleForAnalysis && !hasRowError(reader);
  return { ...times, source: reader.source, machineId, area: region, seconds, sourceFourStateSeconds, sourceHours, sourceRatios, quality: state };
}

function parseEnvironment(reader: RowReader, contract: WorkbookContract): EnvironmentRecord {
  const times = interval(reader, contract);
  const region = area(reader);
  const sensor = reader.number("感測器編號", true);
  if (sensor === null || !Number.isInteger(sensor) || sensor < 1) reader.issue("invalid_environment_sensor", "感測器編號必須為正整數。", "感測器編號");
  const categoryText = reader.text("類別", true)?.trim();
  const category = categoryText === "溫度" || categoryText === "濕度" ? categoryText : null;
  if (!category) reader.issue("unknown_environment_category", "類別尚未由字典確認，不能假設單位。", "類別");
  const values = { average: reader.number("平均"), maximum: reader.number("最大"), median: reader.number("中位數"), minimum: reader.number("最小") };
  if (Object.values(values).some((value) => value === null)) reader.issue("missing_environment_value", "環境統計存在缺值，不補造感測器數值。", "平均／最大／中位數／最小");
  if (values.minimum !== null && values.maximum !== null) {
    if (values.minimum > values.maximum || [values.average, values.median].some((value) => value !== null &&
      (value < values.minimum! - 1e-8 || value > values.maximum! + 1e-8))) reader.issue("environment_stat_order", "最小、平均、中位數、最大值的相對順序不一致。", "平均／最大／中位數／最小");
  }
  const referenceThreshold = reader.number("參考門檻");
  const sourceJudgment = reader.text("最大值判斷");
  const state = quality(reader, "品質狀態", "備註");
  const dictionaryThreshold = category === "溫度" ? 26 : category === "濕度" ? 40 : null;
  if (dictionaryThreshold !== null && referenceThreshold !== dictionaryThreshold) reader.issue("reference_threshold_mismatch", "來源參考門檻與字典暫定設定不同，須核對，不當作正式品質規格。", "參考門檻", "warning");
  if (values.maximum !== null && referenceThreshold !== null) {
    const expected = values.maximum > referenceThreshold ? "超過參考值" : "未超過參考值";
    if (sourceJudgment?.trim() !== expected) reader.issue("threshold_judgment_mismatch", "來源判斷與最大值／參考門檻不一致。", "最大值判斷", "warning");
  }
  state.eligibleForAnalysis = state.eligibleForAnalysis && !hasRowError(reader);
  return { ...times, source: reader.source, area: region, sensorNumber: sensor === null ? null : String(sensor), category,
    unit: category === "溫度" ? "°C" : category === "濕度" ? "%RH" : null, values, referenceThreshold,
    thresholdProvisional: true, sourceJudgment, quality: state };
}

function parseAlarm(reader: RowReader, contract: WorkbookContract): AlarmRecord {
  const occurredAt = parseTimestamp(reader.text("事件時間", true));
  if (!occurredAt) reader.issue("invalid_alarm_timestamp", "事件時間無效，不對齊或四捨五入成三分鐘。", "事件時間");
  else if (occurredAt.slice(0, 10) !== contract.sourceDate) reader.issue("alarm_date_mismatch", "事件時間不在來源日期內。", "事件時間");
  const sourceCategory = reader.text("初步事件分類", true);
  const category = sourceCategory?.trim() === "加工完成通知" ? "completion_notice" :
    sourceCategory?.trim() === "環境/類比感測器警示" ? "environment_alert" : "unclassified";
  if (category === "unclassified") reader.issue("unclassified_alarm", "保留原始分類；無法確認事件意義，不解讀為故障。", "初步事件分類", "warning");
  const durationText = reader.text("持續時間原文");
  if (durationText === null) reader.issue("missing_alarm_duration", "事件持續時間缺漏，保留 null，不補零或自行推算。", "持續時間原文", "warning");
  return { source: reader.source, occurredAt, sensor: reader.text("感測器", true), sensorId: reader.text("感測器ID", true),
    sensorType: reader.text("類型", true), group: reader.text("群組"), ruleName: reader.text("規則名稱"),
    ruleCondition: reader.raw("規則條件"), currentValue: reader.raw("當前值"), durationText,
    sourceCategory, classificationStatus: reader.text("分類狀態", true), category };
}

function validateSchema(sheets: RawSheet[], issues: ValidationIssue[]): boolean {
  let valid = true;
  for (const name of HISTORY_SHEETS) {
    const matches = sheets.filter((sheet) => sheet.name === name);
    if (matches.length !== 1) {
      issues.push({ sheet: name, row: 1, code: matches.length ? "duplicate_sheet" : "missing_sheet", severity: "error", message: "必要工作表必須存在且唯一。" });
      valid = false; continue;
    }
    const headers = matches[0].headers.map((header) => typeof header === "string" ? header.trim() : null);
    for (const column of HISTORY_COLUMNS[name]) {
      if (headers.filter((header) => header === column).length !== 1) {
        issues.push({ sheet: name, row: 1, column, code: headers.includes(column) ? "duplicate_column" : "missing_column", severity: "error", message: "必要欄位必須存在且唯一。" });
        valid = false;
      }
    }
    if (headers.some((header) => header === null || header === "")) {
      issues.push({ sheet: name, row: 1, code: "invalid_header", severity: "error", message: "欄位名稱不可缺漏或為非文字。" }); valid = false;
    }
    if (matches[0].rows.some((row) => row.cells.length > headers.length)) {
      issues.push({ sheet: name, row: 1, code: "unlabelled_cells", severity: "error", message: "存在沒有對應欄名的資料，不可丟棄。" }); valid = false;
    }
  }
  return valid;
}

function metadataMap(sheet: RawSheet, issues: ValidationIssue[]) {
  const values = new Map<string, RawCell>();
  for (const row of sheet.rows) {
    const rawKey = rawCell(sheet, row, sheet.name === "README" ? "統計項目" : "項目");
    const key = typeof rawKey === "string" ? rawKey.trim() : null;
    if (!key || values.has(key)) issues.push({ sheet: sheet.name as HistorySheetName, row: row.row, code: "invalid_metadata_key", severity: "error", message: "規格項目缺漏或重複。" });
    else values.set(key, rawCell(sheet, row, sheet.name === "README" ? "數量" : "定義/規則"));
  }
  return values;
}

function buildContract(sheets: RawSheet[], issues: ValidationIssue[]): WorkbookContract | null {
  const dictionarySheet = sheets.find((sheet) => sheet.name === "data_dictionary")!;
  const readmeSheet = sheets.find((sheet) => sheet.name === "README")!;
  const before = issues.filter((issue) => issue.severity === "error").length;
  const dictionary = metadataMap(dictionarySheet, issues);
  const readme = metadataMap(readmeSheet, issues);
  for (const [key, definition] of Object.entries(SUPPORTED_DEFINITIONS)) {
    if (dictionary.get(key) !== definition) issues.push({ sheet: "data_dictionary", row: dictionarySheet.rows.find((row) => rawCell(dictionarySheet, row, "項目") === key)?.row ?? 1,
      column: "定義/規則", code: "unsupported_dictionary_rule", severity: "error", message: "字典規則缺漏或與已審閱格式不同，停止正規化，保留原始表。" });
  }
  const intervalRule = dictionarySheet.rows.find((row) => rawCell(dictionarySheet, row, "項目") === "區間開始／結束");
  const timeZoneNote = intervalRule ? rawCell(dictionarySheet, intervalRule, "說明") : null;
  if (typeof timeZoneNote !== "string" || !timeZoneNote.includes("Asia/Taipei（+08:00）")) issues.push({ sheet: "data_dictionary", row: intervalRule?.row ?? 1,
    code: "unconfirmed_timezone", severity: "error", message: "字典未明確提供已審閱的時區慣例。" });
  const sourceDate = normalizeDate(readme.get("資料日期"));
  if (!sourceDate || readme.get("時間粒度") !== "3分鐘（180秒）" || numericValue(readme.get("每台機台區間筆數")) !== 480 ||
    numericValue(readme.get("機台數")) !== 8 || numericValue(readme.get("環境感測點數")) !== 8) {
    issues.push({ sheet: "README", row: 1, code: "unsupported_readme_contract", severity: "error", message: "README 日期、粒度或預期完整性設定不符已確認格式。" });
  }
  if (!sourceDate || issues.filter((issue) => issue.severity === "error").length > before) return null;
  return { sourceDate, intervalSeconds: 180, intervalsPerDay: 480, machineCount: 8, environmentPointCount: 8,
    timeZone: "Asia/Taipei", timeZoneBasis: "source_dictionary_convention_not_vendor_confirmed", toleranceSeconds: 1,
    sourceFilename: typeof readme.get("來源檔案") === "string" ? String(readme.get("來源檔案")) : null,
    sourceSha256Claim: typeof readme.get("來源SHA-256") === "string" ? String(readme.get("來源SHA-256")) : null };
}

function findDuplicates<T extends { source: SourceRef }>(rows: T[], key: (row: T) => string | null, issues: ValidationIssue[], exclude?: (row: T) => void) {
  const groups = new Map<string, T[]>();
  for (const row of rows) { const id = key(row); if (id !== null) groups.set(id, [...(groups.get(id) ?? []), row]); }
  for (const group of groups.values()) if (group.length > 1) for (const row of group) {
    exclude?.(row);
    issues.push({ ...row.source, code: "duplicate_record", severity: "error", message: "同一資料鍵重複，所有原始列保留，不自動合併或加總。", relatedRows: group.map((item) => item.source.row) });
  }
}

function checkCoverage(result: ParsedHistory, contract: WorkbookContract): void {
  let machinesComplete = true, environmentComplete = true;
  function check(rows: Interval[], sheet: HistorySheetName, label: string): boolean {
    const validTimes = new Set(rows.filter((row) => row.sourceDate === contract.sourceDate).map((row) => parseTimeLabel(row.timeLabel)?.seconds)
      .filter((value): value is number => value !== undefined && value >= 180 && value <= 86400 && value % 180 === 0));
    const complete = rows.length === 480 && validTimes.size === 480;
    if (!complete) result.issues.push({ sheet, row: 1, code: "incomplete_interval_coverage", severity: "error", message: label + " 的來源日應有480個唯一三分鐘區間；不補造缺漏紀錄。" });
    return complete;
  }
  for (const id of MACHINE_IDS) if (!check(result.machines.filter((row) => row.machineId === id), "machine_3min", id)) machinesComplete = false;
  if (result.machines.some((row) => row.machineId === null || row.sourceDate !== contract.sourceDate)) machinesComplete = false;
  const points = new Map<string, EnvironmentRecord[]>();
  for (const row of result.environment) {
    if (!row.area || !row.sensorNumber || !row.category) { environmentComplete = false; continue; }
    const key = [row.area, row.sensorNumber, row.category].join("/");
    const group = points.get(key) ?? []; group.push(row); points.set(key, group);
  }
  if (points.size !== contract.environmentPointCount) {
    environmentComplete = false;
    result.issues.push({ sheet: "environment_3min", row: 1, code: "environment_point_count_mismatch", severity: "error", message: "環境感測點數與 README 不符，不推定不存在的感測點。" });
  }
  for (const [key, rows] of points) if (!check(rows, "environment_3min", key)) environmentComplete = false;
  for (const region of ["A", "B"]) {
    const regionTimes = new Set(result.environment.filter((row) => row.area === region && row.sourceDate === contract.sourceDate).map((row) => row.timeLabel));
    if (regionTimes.size !== 480) environmentComplete = false;
  }
  result.coverage = { machinesComplete, environmentComplete };
}

function crossCheck(result: ParsedHistory, contract: WorkbookContract) {
  const machineKey = (row: Interval & { machineId: string | null }) => row.sourceDate && row.timeLabel && row.machineId ? [row.sourceDate, row.timeLabel, row.machineId].join("|") : null;
  findDuplicates(result.machines, machineKey, result.issues, (row) => { row.quality.eligibleForAnalysis = false; });
  findDuplicates(result.environment, (row) => row.sourceDate && row.timeLabel && row.area && row.sensorNumber && row.category ? [row.sourceDate, row.timeLabel, row.area, row.sensorNumber, row.category].join("|") : null,
    result.issues, (row) => { row.quality.eligibleForAnalysis = false; });
  findDuplicates(result.alarms, (row) => row.occurredAt && row.sensorId ? JSON.stringify([row.occurredAt, row.sensorId, row.sensorType, row.ruleName, row.ruleCondition, row.currentValue, row.durationText]) : null, result.issues);
  findDuplicates(result.sourceQualityIssues, (row) => row.sourceDate && row.timeLabel && row.target ? JSON.stringify([row.sourceDate, row.timeLabel, row.target, row.reason]) : null, result.issues);
  const machineIndex = new Map<string, MachineRecord[]>();
  for (const row of result.machines) { const key = machineKey(row); if (key) { const group = machineIndex.get(key) ?? []; group.push(row); machineIndex.set(key, group); } }
  for (const issue of result.sourceQualityIssues) {
    const id = normalizeMachineId(issue.target);
    const key = machineKey({ ...issue, machineId: id });
    const matches = key ? machineIndex.get(key) ?? [] : [];
    issue.matchedMachineRows = matches.map((row) => row.source.row);
    if (!matches.length) result.issues.push({ ...issue.source, code: "unmatched_source_quality_issue", severity: "warning", message: "來源品質問題無法對應機台列，保留待核對，不推定目標。" });
    for (const machine of matches) {
      if (machine.quality.eligibleForAnalysis) result.issues.push({ ...machine.source, code: "source_quality_conflict", severity: "error", message: "來源品質問題表包含此紀錄，即使標示通過也先排除分析。", relatedRows: [issue.source.row] });
      machine.quality.eligibleForAnalysis = false;
    }
  }
  checkCoverage(result, contract);
  const readme = metadataMap(result.rawSheets.find((sheet) => sheet.name === "README")!, []);
  const expectations: Record<string, number> = {
    "機台三分鐘資料列數": result.machines.length, "環境三分鐘資料列數": result.environment.length,
    "Alarm事件列數": result.alarms.length, "品質問題紀錄數": result.sourceQualityIssues.length,
    "加工完成通知": result.alarms.filter((row) => row.category === "completion_notice").length,
    "環境/類比感測器警示": result.alarms.filter((row) => row.category === "environment_alert").length,
    "缺少持續時間的警報數": result.alarms.filter((row) => row.durationText === null).length,
    "警報時間不在來源日期筆數": result.alarms.filter((row) => row.occurredAt && row.occurredAt.slice(0, 10) !== contract.sourceDate).length,
  };
  for (const [key, actual] of Object.entries(expectations)) if (numericValue(readme.get(key)) !== actual) result.issues.push({ sheet: "README", row: 1, column: key,
    code: "readme_count_mismatch", severity: "error", message: "README 宣告筆數與實際解析結果不一致。" });
}

export function parseHistorySheets(rawSheets: RawSheet[], source: SourceFile): ParsedHistory {
  const result: ParsedHistory = { ruleVersion: HISTORY_RULE_VERSION, source, contract: null, rawSheets, machines: [], environment: [], alarms: [], sourceQualityIssues: [], issues: [],
    coverage: { machinesComplete: false, environmentComplete: false } };
  if (!validateSchema(rawSheets, result.issues)) return result;
  const contract = buildContract(rawSheets, result.issues);
  if (!contract) return result;
  result.contract = contract;
  for (const sheet of rawSheets) for (const row of sheet.rows) {
    const reader = new RowReader(sheet, row, result.issues);
    if (sheet.name === "machine_3min") result.machines.push(parseMachine(reader, contract));
    else if (sheet.name === "environment_3min") result.environment.push(parseEnvironment(reader, contract));
    else if (sheet.name === "alarm_events") result.alarms.push(parseAlarm(reader, contract));
    else if (sheet.name === "quality_issues") {
      result.sourceQualityIssues.push({ ...interval(reader, contract, false), source: reader.source,
        target: reader.text("對象", true), reason: reader.text("問題", true), totalSeconds: reader.number("區間合計秒", true), matchedMachineRows: [] });
    }
  }
  crossCheck(result, contract);
  return result;
}

export async function parseHistoryFile(filename: string): Promise<ParsedHistory> {
  const { source, sheets } = await readHistoryFile(filename);
  return parseHistorySheets(sheets, source);
}
