import "server-only";

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import readExcelFile from "read-excel-file/node";
import type { RawCell, RawSheet, SourceFile } from "./types";

export class HistoryReadError extends Error {
  constructor(public readonly code: string, message: string, public readonly entry?: string, public readonly cell?: string) {
    super(message);
    this.name = "HistoryReadError";
  }
}

export function checkXlsxContainer(bytes: Uint8Array): void {
  if (bytes.byteLength > 20 * 1024 * 1024) throw new HistoryReadError("file_too_large", "超過本機解析檔案大小上限。");
  let total = 0;
  let entries: ReturnType<typeof unzipSync>;
  try {
    entries = unzipSync(bytes, { filter(entry) {
      total += entry.originalSize;
      if (total > 100 * 1024 * 1024) throw new HistoryReadError("expanded_file_too_large", "解壓內容超過本機解析上限。");
      return /^xl\/(?:worksheets\/[^/]+|workbook)\.xml$/.test(entry.name);
    } });
  } catch (error) {
    if (error instanceof HistoryReadError) throw error;
    throw new HistoryReadError("invalid_xlsx", "無法讀取 XLSX ZIP 容器。");
  }
  // 唯讀格式前檢：不讓公式快取或 Excel 錯誤被套件當成一般數字／空值。
  // 寧可保守拒絕未知格式；不執行公式、不改寫原始工作簿。
  for (const [entry, data] of Object.entries(entries)) {
    const xml = strFromU8(data);
    if (xml.includes("\0") || /encoding\s*=\s*["'](?!utf-8["'])/i.test(xml)) {
      throw new HistoryReadError("unsupported_xml_encoding", "此版本只接受已確認的 UTF-8 XML 內容。", entry);
    }
    const cellPattern = /<(?:[^\s<>/:]+:)?c\b([^>]*?)(?<!\/)>([\s\S]*?)<\/(?:[^\s<>/:]+:)?c\s*>/g;
    for (const match of xml.matchAll(cellPattern)) {
      const cell = /\br\s*=\s*["']([^"']+)["']/.exec(match[1])?.[1];
      if (/<(?:[^\s<>/:]+:)?f(?:\s|\/?>)/.test(match[2])) {
        throw new HistoryReadError("unsupported_formula", "此格式不接受公式儲存格；請先確認來源與公式結果，不得當作空值匯入。", entry, cell);
      }
      if (/\bt\s*=\s*["']e["']/.test(match[1])) {
        throw new HistoryReadError("excel_cell_error", "來源含 Excel 錯誤儲存格，不得靜默轉成空值。", entry, cell);
      }
    }
  }
}

export async function readHistoryBuffer(bytes: Uint8Array, filename: string): Promise<{ source: SourceFile; sheets: RawSheet[] }> {
  checkXlsxContainer(bytes);
  try {
    const sheets = await readExcelFile(Buffer.from(bytes), {
      trim: false,
      parseNumber: (lexeme) => ({ kind: "number" as const, lexeme }),
    });
    function snapshot(value: unknown): RawCell {
      if (value === undefined || value === null) return null;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
      if (value instanceof Date && Number.isFinite(value.getTime())) return { kind: "date", iso: value.toISOString() };
      if (typeof value === "object" && value && "kind" in value && value.kind === "number" &&
        "lexeme" in value && typeof value.lexeme === "string") return { kind: "number", lexeme: value.lexeme };
      throw new HistoryReadError("unsupported_cell", "遇到尚未確認的儲存格型別。");
    }
    return {
      source: { filename: basename(filename), bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") },
      sheets: sheets.map((sheet) => ({
        name: sheet.sheet,
        headers: Array.from(sheet.data[0] ?? [], snapshot),
        rows: sheet.data.slice(1).map((cells, index) => ({ row: index + 2, cells: Array.from(cells, snapshot) })),
      })),
    };
  } catch (error) {
    if (error instanceof HistoryReadError) throw error;
    throw new HistoryReadError("xlsx_parse_error", "XLSX 內容無法安全解析；原始檔未修改。");
  }
}

export async function readHistoryFile(filename: string) {
  return readHistoryBuffer(await readFile(filename), filename);
}
