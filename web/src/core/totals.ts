import type { EntryTag } from "../tags";
import { isCompleted, type TimeEntry } from "./entries";

export const DAY_MS = 86_400_000;
export const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface WeekTotals {
  workMs: number;
  leisureMs: number;
  sleepMs: number;
  otherMs: number;
  totalMs: number;
}

export interface WeekSegment {
  entryId: string;
  startMs: number;
  endMs: number;
}

export interface WeekDay {
  date: string;
  startMs: number;
  segments: WeekSegment[];
}

export interface WeekView {
  selectedDate: string;
  weekStartMs: number;
  weekEndMs: number;
  entries: TimeEntry[];
  days: WeekDay[];
  totals: WeekTotals;
}

/** 统计范围：全部已完成记录，或任意左闭右开毫秒区间。 */
export type TotalRange =
  | { kind: "all" }
  | { kind: "absolute"; startMs: number; endMs: number };

export function emptyTotals(): WeekTotals {
  return { workMs: 0, leisureMs: 0, sleepMs: 0, otherMs: 0, totalMs: 0 };
}

export function addDuration(totals: WeekTotals, tag: EntryTag, durationMs: number): void {
  if (durationMs <= 0) return;
  if (tag === "work") totals.workMs += durationMs;
  else if (tag === "leisure") totals.leisureMs += durationMs;
  else if (tag === "sleep") totals.sleepMs += durationMs;
  else totals.otherMs += durationMs;
  totals.totalMs += durationMs;
}

/**
 * 按 `[startMs, endMs)` 裁剪每条已完成记录后累加四类时长。
 * 周统计、单日统计与累计统计共用这一套裁剪规则。
 */
export function aggregateTotals(
  entries: TimeEntry[],
  range: { startMs: number; endMs: number },
): WeekTotals {
  const totals = emptyTotals();
  for (const entry of entries) {
    if (!isCompleted(entry)) continue;
    const clippedStart = Math.max(entry.startMs!, range.startMs);
    const clippedEnd = Math.min(entry.endMs!, range.endMs);
    addDuration(totals, entry.tag!, clippedEnd - clippedStart);
  }
  return totals;
}
