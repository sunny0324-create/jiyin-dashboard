import type { HistorySheetName, MachineId } from "./schema";

export type RawCell = null | string | number | boolean |
  { kind: "number"; lexeme: string } | { kind: "date"; iso: string };
export interface RawRow { row: number; cells: RawCell[] }
export interface RawSheet { name: string; headers: RawCell[]; rows: RawRow[] }
export interface SourceFile { filename: string; sha256: string; bytes: number }
export interface SourceRef { sheet: HistorySheetName; row: number }
export interface ValidationIssue extends SourceRef {
  code: string;
  severity: "error" | "warning";
  column?: string;
  message: string;
  relatedRows?: number[];
}
export interface Interval {
  sourceDate: string | null;
  timeLabel: string | null;
  intervalStart: string | null;
  intervalEnd: string | null;
}
export interface Quality {
  sourceStatus: string | null;
  sourceNotes: string | null;
  eligibleForAnalysis: boolean;
}
export interface MachineRecord extends Interval {
  source: SourceRef;
  machineId: MachineId | null;
  area: "A" | "B" | null;
  seconds: Record<"none" | "red" | "yellow" | "green" | "blue" | "white", number | null>;
  sourceFourStateSeconds: number | null;
  sourceHours: Record<"green" | "yellow" | "red" | "none", number | null>;
  sourceRatios: { interval: number | null; powered: number | null };
  quality: Quality;
}
export interface EnvironmentRecord extends Interval {
  source: SourceRef;
  area: "A" | "B" | null;
  sensorNumber: string | null;
  category: "溫度" | "濕度" | null;
  unit: "°C" | "%RH" | null;
  values: { average: number | null; maximum: number | null; median: number | null; minimum: number | null };
  referenceThreshold: number | null;
  thresholdProvisional: true;
  sourceJudgment: string | null;
  quality: Quality;
}
export interface AlarmRecord {
  source: SourceRef;
  occurredAt: string | null;
  sensor: string | null;
  sensorId: string | null;
  sensorType: string | null;
  group: string | null;
  ruleName: string | null;
  ruleCondition: RawCell;
  currentValue: RawCell;
  durationText: string | null;
  sourceCategory: string | null;
  classificationStatus: string | null;
  category: "completion_notice" | "environment_alert" | "unclassified";
}
export interface SourceQualityRecord extends Interval {
  source: SourceRef;
  target: string | null;
  reason: string | null;
  totalSeconds: number | null;
  matchedMachineRows: number[];
}
export interface WorkbookContract {
  sourceDate: string;
  intervalSeconds: 180;
  intervalsPerDay: 480;
  machineCount: 8;
  environmentPointCount: 8;
  timeZone: "Asia/Taipei";
  timeZoneBasis: "source_dictionary_convention_not_vendor_confirmed";
  toleranceSeconds: 1;
  sourceFilename: string | null;
  sourceSha256Claim: string | null;
}
export interface ParsedHistory {
  ruleVersion: string;
  source: SourceFile;
  contract: WorkbookContract | null;
  rawSheets: RawSheet[];
  machines: MachineRecord[];
  environment: EnvironmentRecord[];
  alarms: AlarmRecord[];
  sourceQualityIssues: SourceQualityRecord[];
  issues: ValidationIssue[];
  coverage: { machinesComplete: boolean; environmentComplete: boolean };
}

// 僅定義未來資料庫匯入邊界，不建立 SQLite 連線、表格或寫入流程。
export interface HistoryImportPort {
  importBatch(batch: ParsedHistory): Promise<{ batchId: string; retainedRows: number }>;
}
