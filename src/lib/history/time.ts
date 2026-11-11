import { MACHINE_IDS } from "./schema";
import type { MachineId } from "./schema";

export function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const result = y + "-" + m + "-" + d;
  const instant = new Date(result + "T00:00:00Z");
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === result ? result : null;
}

export function normalizeMachineId(value: unknown): MachineId | null {
  const id = typeof value === "string" ? value.trim().toUpperCase() : "";
  return MACHINE_IDS.find((item) => item === id) ?? null;
}

export function parseTimeLabel(value: unknown): { label: string; seconds: number } | null {
  if (typeof value !== "string") return null;
  const label = value.trim();
  if (label === "24:00") return { label, seconds: 86400 };
  const match = /^(\d{2}):(\d{2})$/.exec(label);
  if (!match) return null;
  const hours = Number(match[1]), minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { label, seconds: hours * 3600 + minutes * 60 };
}

export function taipeiTimestamp(epochMs: number): string {
  return new Date(epochMs + 8 * 3600_000).toISOString().slice(0, 19) + "+08:00";
}

export function parseTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}[-/]\d{2}[-/]\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = normalizeDate(match[1]);
  const [, , h, m, s] = match;
  if (!date || Number(h) > 23 || Number(m) > 59 || Number(s) > 59) return null;
  return date + "T" + h + ":" + m + ":" + s + "+08:00";
}

export function intervalFromLabel(date: string, seconds: number) {
  const midnight = Date.parse(date + "T00:00:00+08:00");
  return {
    intervalStart: taipeiTimestamp(midnight + (seconds - 180) * 1000),
    intervalEnd: taipeiTimestamp(midnight + seconds * 1000),
  };
}
