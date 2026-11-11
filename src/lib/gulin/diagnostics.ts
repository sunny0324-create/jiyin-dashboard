import "server-only";

import type { GulinRawDocument, GulinResource, JsonValue } from "./types";

// 僅公開固定欄位名稱；未知名稱可能本身就是識別碼、網址或秘密，全部使用替代標籤。
const SAFE_FIELDS = new Set([
  "apiType", "apiVersion", "data", "localTime", "responseCode", "responseMsg",
  "responseTime", "thingAlias", "thingName", "updateTime", "id", "status",
  "values", "value", "groupAlias", "groupId", "sensors", "config",
  "displayname", "type", "unit", "green", "yellow", "red", "blue", "white",
]);
const SENSITIVE_FIELDS = /token|secret|password|authorization|cookie|api.?key|private.?key|credential|url|uri|endpoint|host|address|email/i;

type JsonKind = "object" | "array" | "string" | "number" | "boolean" | "null";
interface StructureSummary {
  type: JsonKind;
  redacted?: true;
  fieldCount?: number;
  itemCount?: number;
  fields?: { name: string; structure: StructureSummary }[];
  sample?: StructureSummary;
  omittedFields?: number;
  truncated?: true;
}

function kind(value: JsonValue): JsonKind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  return "boolean";
}

function record(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldName(key: string, index: number): string {
  return SAFE_FIELDS.has(key) ? key : "[已遮蔽欄位" + (index + 1) + "]";
}

function summarize(value: JsonValue, depth: number, budget: { remaining: number }): StructureSummary {
  const summary: StructureSummary = { type: kind(value) };
  budget.remaining--;
  if (Array.isArray(value)) summary.itemCount = value.length;
  else if (record(value)) summary.fieldCount = Object.keys(value).length;
  else return { ...summary, redacted: true };

  if (depth >= 4 || budget.remaining <= 0) return { ...summary, truncated: true };
  if (Array.isArray(value)) {
    if (value.length) summary.sample = summarize(value[0], depth + 1, budget);
    return summary;
  }
  const entries = Object.entries(value);
  // 動態 ID 對照表只抽樣兩筆；一般欄位最多十六個，且整份摘要有節點上限。
  const limit = entries.every(([key]) => !SAFE_FIELDS.has(key)) ? 2 : 16;
  summary.fields = [];
  for (const [index, [key, item]] of entries.slice(0, limit).entries()) {
    if (budget.remaining <= 0) break;
    const sensitive = SENSITIVE_FIELDS.test(key);
    if (sensitive) budget.remaining--;
    summary.fields.push({
      name: fieldName(key, index),
      structure: sensitive ? { type: kind(item), redacted: true } : summarize(item, depth + 1, budget),
    });
  }
  summary.omittedFields = entries.length - summary.fields.length;
  return summary;
}

function confirmedCounts(raw: GulinRawDocument, resource: GulinResource) {
  if (!record(raw)) return null;
  const data = raw.data;
  if (resource === "groups" && Array.isArray(data) && data.length > 0 && data.every((item) =>
    record(item) && typeof item.groupId === "string" && item.groupId.trim().length > 0 &&
    typeof item.groupAlias === "string" && record(item.sensors),
  )) {
    return {
      groupRecordCount: data.length,
      uniqueGroupCount: new Set(data.map((item) => record(item) ? item.groupId : null)).size,
    };
  }
  if ((resource === "values" || resource === "configs") && record(data)) {
    const entries = Object.entries(data);
    if (!entries.length) return null;
    const valid = entries.every(([id, item]) => {
      if (!id.trim() || !record(item)) return false;
      if (resource === "values") return item.id === id && record(item.values);
      return record(item.config) && item.config.id === id &&
        typeof item.config.displayname === "string" && typeof item.config.type === "string" &&
        typeof item.config.unit === "string";
    });
    if (valid) return { sensorCount: entries.length };
  }
  return null;
}

export function summarizeGulinDocument(raw: GulinRawDocument, resource: GulinResource) {
  const counts = confirmedCounts(raw, resource);
  return {
    rootType: Array.isArray(raw) ? "array" : "object",
    topLevelFields: Array.isArray(raw) ? [] : Object.keys(raw).slice(0, 32).map(fieldName),
    structure: summarize(raw, 0, { remaining: 80 }),
    confirmedCounts: counts,
    countNote: counts ? "依本次資料結構確認的紀錄數，不代表在線設備數或八台機台對應。" :
      "結構尚不足以確認感測器或群組數量；僅顯示一般欄位／項目數，不推定實體數量。",
    privacy: "所有原始值已省略，未知欄位名稱與動態識別碼已遮蔽；結構僅作有限抽樣。",
  };
}
