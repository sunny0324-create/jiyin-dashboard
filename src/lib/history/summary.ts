import type { ParsedHistory, RawCell } from "./types";
import { numericValue } from "./parser";

function frequency(values: (string | null)[]): Record<string, number> {
  const result: Record<string, number> = Object.create(null);
  for (const value of values) { const key = value ?? "（空值）"; result[key] = (result[key] ?? 0) + 1; }
  return result;
}

function cellType(value: RawCell): string {
  if (value === null) return "null";
  if (typeof value === "object") return value.kind;
  return typeof value;
}

export function summarizeHistory(result: ParsedHistory) {
  const severities = frequency(result.issues.map((issue) => issue.severity));
  return {
    parseStatus: result.contract ? "parsed" : "schema_blocked",
    dataQualityStatus: result.issues.some((issue) => issue.severity === "error") ? "requires_review" : "passed_local_checks",
    source: result.source,
    ruleVersion: result.ruleVersion,
    contract: result.contract,
    sheets: result.rawSheets.map((sheet) => ({
      name: sheet.name, rows: sheet.rows.length,
      columns: sheet.headers.map((header, index) => ({
        name: typeof header === "string" ? header : null,
        types: frequency(sheet.rows.map((row) => cellType(row.cells[index] ?? null))),
        nulls: sheet.rows.filter((row) => (row.cells[index] ?? null) === null).length,
        zeros: sheet.rows.filter((row) => numericValue(row.cells[index]) === 0).length,
      })),
    })),
    machines: {
      rows: result.machines.length, perMachine: frequency(result.machines.map((row) => row.machineId)),
      sourceQuality: frequency(result.machines.map((row) => row.quality.sourceStatus)),
      sourceQualityReasons: frequency(result.machines.map((row) => row.quality.sourceNotes)),
      eligibleRows: result.machines.filter((row) => row.quality.eligibleForAnalysis).length,
      boundary24Rows: result.machines.filter((row) => row.timeLabel === "24:00").length,
      blueNonzero: result.machines.filter((row) => row.seconds.blue !== null && row.seconds.blue !== 0).length,
      whiteNonzero: result.machines.filter((row) => row.seconds.white !== null && row.seconds.white !== 0).length,
    },
    environment: {
      rows: result.environment.length,
      points: frequency(result.environment.map((row) => [row.area, row.sensorNumber, row.category].join("/"))),
      sourceQuality: frequency(result.environment.map((row) => row.quality.sourceStatus)),
      units: frequency(result.environment.map((row) => row.unit)),
      sourceJudgments: frequency(result.environment.map((row) => row.sourceJudgment)),
      eligibleRows: result.environment.filter((row) => row.quality.eligibleForAnalysis).length,
      thresholdsProvisional: true,
    },
    alarms: {
      rows: result.alarms.length, categories: frequency(result.alarms.map((row) => row.category)),
      sourceClassificationStatus: frequency(result.alarms.map((row) => row.classificationStatus)),
      missingDuration: result.alarms.filter((row) => row.durationText === null).length,
      missingRuleName: result.alarms.filter((row) => row.ruleName === null).length,
    },
    sourceQualityIssues: {
      rows: result.sourceQualityIssues.length,
      reasons: frequency(result.sourceQualityIssues.map((row) => row.reason)),
      unmatched: result.sourceQualityIssues.filter((row) => !row.matchedMachineRows.length).length,
    },
    coverage: result.coverage,
    validation: {
      count: result.issues.length, severities, codes: frequency(result.issues.map((issue) => issue.code)),
      duplicateRows: result.issues.filter((issue) => issue.code === "duplicate_record").length,
      // 完整錯誤及原始列保留在記憶體結果中，CLI 只抽樣，不產生企業資料檔。
      examples: result.issues.slice(0, 12),
    },
    policy: "未計算正式加工比例；來源日期、24:00、缺值、來源品質及原始欄位均保留。",
  };
}
