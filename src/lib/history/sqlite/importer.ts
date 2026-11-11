import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { readHistoryBuffer } from "../reader";
import { parseHistorySheets } from "../parser";
import type { AlarmRecord, HistoryImportPort, Interval, ParsedHistory, SourceRef } from "../types";
import type { HistoryDatabase, SqlValue } from "./native";

type ValidationStatus = "passed" | "warning" | "error";
export interface ImportCounts {
  rawRows: number; sheets: number; machines: number; environment: number;
  alarms: number; sourceQualityIssues: number; validationIssues: number;
}
export interface ImportQuality {
  machineAnalysisEligible: number;
  environmentAnalysisEligible: number;
  validationErrors: number;
  validationWarnings: number;
  coverage: ParsedHistory["coverage"];
}
export interface ImportResult {
  status: "imported" | "already_imported";
  batchId: string;
  retainedRows: number;
  counts: ImportCounts;
  quality: ImportQuality;
}
export interface ImportConflict {
  table: "machine_3min" | "environment_3min" | "alarm_events";
  incomingRow: number;
  existingBatchId: string;
  existingRecordId: number;
}
export class HistoryImportError extends Error {
  constructor(
    public readonly code: "invalid_workbook" | "overlap" | "transaction_active" | "write_failed",
    message: string,
    public readonly conflicts: { count: number; examples: ImportConflict[] } | null = null,
  ) { super(message); this.name = "HistoryImportError"; }
}

function json(value: unknown): string {
  const result = JSON.stringify(value, (_key, cell: unknown) => {
    if (typeof cell === "number" && !Number.isFinite(cell)) throw new Error("不可將非有限數字靜默轉換成 NULL。");
    return cell;
  });
  if (result === undefined) throw new Error("無法序列化資料。");
  return result;
}
function rawJson(value: unknown): string | null { return value === null ? null : json(value); }
function sourceKey(source: SourceRef): string { return `${source.sheet}:${source.row}`; }
function intervalValues(record: Interval): SqlValue[] {
  return [record.sourceDate, record.timeLabel, record.intervalStart, record.intervalEnd];
}
function alarmFingerprint(alarm: AlarmRecord): string {
  // 同時刻的不同感測器不是同一事件；所有原始事件欄位參與比對。
  const { source: _source, ...event } = alarm;
  void _source;
  return createHash("sha256").update(json(event)).digest("hex");
}
function batchSummary(batch: ParsedHistory): { counts: ImportCounts; quality: ImportQuality } {
  return {
    counts: {
      rawRows: batch.rawSheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
      sheets: batch.rawSheets.length, machines: batch.machines.length, environment: batch.environment.length,
      alarms: batch.alarms.length, sourceQualityIssues: batch.sourceQualityIssues.length, validationIssues: batch.issues.length,
    },
    quality: {
      machineAnalysisEligible: batch.machines.filter(row => row.quality.eligibleForAnalysis).length,
      environmentAnalysisEligible: batch.environment.filter(row => row.quality.eligibleForAnalysis).length,
      validationErrors: batch.issues.filter(issue => issue.severity === "error").length,
      validationWarnings: batch.issues.filter(issue => issue.severity === "warning").length,
      coverage: batch.coverage,
    },
  };
}

export function findImportedBatch(db: HistoryDatabase, sha256: string): ImportResult | null {
  const row = db.prepare("SELECT id,quality_summary_json FROM import_batches WHERE source_sha256=?").get(sha256);
  if (!row) return null;
  // 此欄只由本服務產生，且受 SQLite json_valid 約束；不使用企業 JSON 強制轉型。
  const summary = JSON.parse(String(row.quality_summary_json)) as ReturnType<typeof batchSummary>;
  return { status: "already_imported", batchId: String(row.id), retainedRows: summary.counts.rawRows, ...summary };
}

export function listImportBatches(db: HistoryDatabase) {
  return db.prepare(`SELECT id,source_filename,source_sha256,source_bytes,source_date,grain_seconds,
    parser_version,imported_at,system_validation_status,quality_summary_json FROM import_batches ORDER BY imported_at,id`).all();
}

function detectConflicts(db: HistoryDatabase, batch: ParsedHistory) {
  const examples: ImportConflict[] = [];
  let count = 0;
  function retain(table: ImportConflict["table"], row: number, matches: ReturnType<ReturnType<HistoryDatabase["prepare"]>["all"]>) {
    count += matches.length;
    for (const match of matches) {
      if (examples.length < 10) examples.push({ table, incomingRow: row, existingBatchId: String(match.batch_id), existingRecordId: Number(match.id) });
    }
  }
  const overlap = `((source_date=? AND time_label=?) OR (interval_start < ? AND interval_end > ?))`;
  const machines = db.prepare(`SELECT id,batch_id FROM machine_3min WHERE machine_id=? AND ${overlap}`);
  for (const row of batch.machines) {
    if (row.machineId !== null) retain("machine_3min", row.source.row,
      machines.all(row.machineId, row.sourceDate, row.timeLabel, row.intervalEnd, row.intervalStart));
  }
  const environment = db.prepare(`SELECT id,batch_id FROM environment_3min WHERE area=? AND sensor_number=? AND category=? AND ${overlap}`);
  for (const row of batch.environment) {
    if (row.area !== null && row.sensorNumber !== null && row.category !== null) retain("environment_3min", row.source.row,
      environment.all(row.area, row.sensorNumber, row.category, row.sourceDate, row.timeLabel, row.intervalEnd, row.intervalStart));
  }
  const alarms = db.prepare("SELECT id,batch_id FROM alarm_events WHERE event_fingerprint=?");
  for (const row of batch.alarms) {
    if (row.occurredAt !== null && (row.sensorId !== null || row.sensor !== null)) {
      retain("alarm_events", row.source.row, alarms.all(alarmFingerprint(row)));
    }
  }
  return { count, examples };
}

export class SqliteHistoryImporter implements HistoryImportPort {
  constructor(private readonly db: HistoryDatabase) {}

  async importFile(filename: string): Promise<ImportResult> {
    // 同一份 bytes 計算雜湊並解析，避免讀取兩次時檔案被替換。
    const bytes = await readFile(filename);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const existing = findImportedBatch(this.db, sha256);
    if (existing) return existing;
    const workbook = await readHistoryBuffer(bytes, basename(filename));
    return this.importBatch(parseHistorySheets(workbook.sheets, workbook.source));
  }

  async importBatch(batch: ParsedHistory): Promise<ImportResult> {
    if (!batch.contract || batch.contract.intervalSeconds !== 180 || !/^[a-f0-9]{64}$/i.test(batch.source.sha256)) {
      throw new HistoryImportError("invalid_workbook", "工作表、欄位或資料字典驗證未通過，不建立匯入批次。");
    }
    if (this.db.isTransaction) throw new HistoryImportError("transaction_active", "匯入服務需要獨立交易，不能加入既有交易。");
    const summary = batchSummary(batch);
    const batchId = randomUUID();
    const statuses = new Map<string, ValidationStatus>();
    for (const issue of batch.issues) {
      const key = sourceKey(issue);
      if (issue.severity === "error" || !statuses.has(key)) statuses.set(key, issue.severity);
    }
    const status = (source: SourceRef) => statuses.get(sourceKey(source)) ?? "passed";
    const globalStatus = summary.quality.validationErrors ? "error" : summary.quality.validationWarnings ? "warning" : "passed";
    let ownsTransaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      ownsTransaction = true;
      // 在寫入鎖內再次檢查，避免兩個本機程序同時匯入。
      const existing = findImportedBatch(this.db, batch.source.sha256);
      if (existing) { this.db.exec("ROLLBACK"); ownsTransaction = false; return existing; }
      const conflicts = detectConflicts(this.db, batch);
      if (conflicts.count) throw new HistoryImportError("overlap", "跨檔資料區間或事件重疊，整批拒絕；既有資料維持不變。", conflicts);
      this.db.prepare(`INSERT INTO import_batches (id,source_sha256,source_filename,source_bytes,source_date,
        grain_seconds,parser_version,imported_at,system_validation_status,contract_json,quality_summary_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(batchId, batch.source.sha256, batch.source.filename, batch.source.bytes,
        batch.contract.sourceDate, 180, batch.ruleVersion, new Date().toISOString(), globalStatus, json(batch.contract), json(summary));
      const sheetInsert = this.db.prepare("INSERT INTO excel_sheets (batch_id,name,headers_json) VALUES (?,?,?)");
      const rawInsert = this.db.prepare("INSERT INTO raw_excel_rows (batch_id,sheet_name,row_number,values_json) VALUES (?,?,?,?)");
      const rawIds = new Map<string, number>();
      for (const sheet of batch.rawSheets) {
        sheetInsert.run(batchId, sheet.name, json(sheet.headers));
        for (const row of sheet.rows) {
          const id = rawInsert.run(batchId, sheet.name, row.row, json(row.cells)).lastInsertRowid;
          rawIds.set(`${sheet.name}:${row.row}`, Number(id));
        }
      }
      const rawId = (source: SourceRef) => {
        const id = rawIds.get(sourceKey(source));
        if (id === undefined) throw new Error("正規化紀錄缺少原始列。");
        return id;
      };
      const machine = this.db.prepare(`INSERT INTO machine_3min (batch_id,raw_row_id,source_date,time_label,interval_start,interval_end,
        machine_id,area,none_seconds,red_seconds,yellow_seconds,green_seconds,blue_seconds,white_seconds,source_four_state_seconds,
        source_green_hours,source_yellow_hours,source_red_hours,source_none_hours,source_interval_ratio,source_powered_ratio,
        source_quality_status,source_quality_notes,system_validation_status,analysis_eligible) VALUES (${Array(25).fill("?").join(",")})`);
      const machineIds = new Map<number, number>();
      for (const row of batch.machines) {
        const id = machine.run(batchId, rawId(row.source), ...intervalValues(row), row.machineId, row.area,
          row.seconds.none, row.seconds.red, row.seconds.yellow, row.seconds.green, row.seconds.blue, row.seconds.white,
          row.sourceFourStateSeconds, row.sourceHours.green, row.sourceHours.yellow, row.sourceHours.red, row.sourceHours.none,
          row.sourceRatios.interval, row.sourceRatios.powered, row.quality.sourceStatus, row.quality.sourceNotes,
          status(row.source), Number(row.quality.eligibleForAnalysis)).lastInsertRowid;
        machineIds.set(row.source.row, Number(id));
      }
      const environment = this.db.prepare(`INSERT INTO environment_3min (batch_id,raw_row_id,source_date,time_label,interval_start,interval_end,
        area,sensor_number,category,unit,average,maximum,median,minimum,reference_threshold,threshold_provisional,source_judgment,
        source_quality_status,source_quality_notes,system_validation_status,analysis_eligible) VALUES (${Array(21).fill("?").join(",")})`);
      for (const row of batch.environment) environment.run(batchId, rawId(row.source), ...intervalValues(row), row.area, row.sensorNumber,
        row.category, row.unit, row.values.average, row.values.maximum, row.values.median, row.values.minimum, row.referenceThreshold,
        1, row.sourceJudgment, row.quality.sourceStatus, row.quality.sourceNotes, status(row.source), Number(row.quality.eligibleForAnalysis));
      const alarm = this.db.prepare(`INSERT INTO alarm_events (batch_id,raw_row_id,occurred_at,sensor,sensor_id,sensor_type,source_group,
        rule_name,rule_condition_json,current_value_json,duration_text,source_category,classification_status,category,event_fingerprint,
        system_validation_status) VALUES (${Array(16).fill("?").join(",")})`);
      for (const row of batch.alarms) alarm.run(batchId, rawId(row.source), row.occurredAt, row.sensor, row.sensorId, row.sensorType, row.group,
        row.ruleName, rawJson(row.ruleCondition), rawJson(row.currentValue), row.durationText, row.sourceCategory, row.classificationStatus,
        row.category, alarmFingerprint(row), status(row.source));
      const quality = this.db.prepare(`INSERT INTO quality_issues (batch_id,raw_row_id,source_date,time_label,interval_start,interval_end,
        target,reason,total_seconds) VALUES (?,?,?,?,?,?,?,?,?)`);
      const link = this.db.prepare("INSERT INTO quality_issue_machine_links (batch_id,quality_issue_id,machine_record_id) VALUES (?,?,?)");
      for (const row of batch.sourceQualityIssues) {
        const id = quality.run(batchId, rawId(row.source), ...intervalValues(row), row.target, row.reason, row.totalSeconds).lastInsertRowid;
        for (const matchedRow of row.matchedMachineRows) {
          const machineId = machineIds.get(matchedRow);
          if (machineId === undefined) throw new Error("來源品質問題指向不存在的機台列。");
          link.run(batchId, id, machineId);
        }
      }
      const validation = this.db.prepare(`INSERT INTO validation_issues (batch_id,sheet_name,source_row,raw_row_id,code,severity,
        column_name,message,related_rows_json) VALUES (?,?,?,?,?,?,?,?,?)`);
      for (const issue of batch.issues) validation.run(batchId, issue.sheet, issue.row, rawIds.get(sourceKey(issue)) ?? null,
        issue.code, issue.severity, issue.column ?? null, issue.message, json(issue.relatedRows ?? []));
      this.db.exec("COMMIT");
      ownsTransaction = false;
      return { status: "imported", batchId, retainedRows: summary.counts.rawRows, ...summary };
    } catch (error) {
      if (ownsTransaction && this.db.isTransaction) this.db.exec("ROLLBACK");
      if (error instanceof HistoryImportError) throw error;
      throw new HistoryImportError("write_failed", "SQLite 匯入失敗，交易已回復；請檢查資料庫與來源結構。");
    }
  }
}
