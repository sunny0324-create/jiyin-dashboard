import { GulinError } from "./errors";
import type { GulinRawDocument, JsonValue } from "./types";

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 64) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.values(value).every((item) => isJsonValue(item, depth + 1));
  }
  return false;
}

export function parseGulinDocument(text: string): GulinRawDocument {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new GulinError("invalid_json");
  }
  if (value === null || typeof value !== "object" || !isJsonValue(value)) {
    throw new GulinError("invalid_payload");
  }
  return value;
}

// 後續先增加各資源的 schema 驗證，再建立設備／燈態 DTO 轉換。
// 此階段不推定 status 代碼、燈號數值意義或資料新鮮度。
