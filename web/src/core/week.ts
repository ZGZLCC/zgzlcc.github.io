import { isCompleted, type TimeEntry } from "./entries";
import { dateFromDayNumber, dayNumber, parseBeijingDate } from "./date";
import { addDuration, BEIJING_OFFSET_MS, DAY_MS, emptyTotals, type WeekDay, type WeekView } from "./totals";

/**
 * 计算北京时间周一 00:00 起的七天区间 `[start, end)`。
 * 周期口径固定为周一至下周一，跨月与跨年不受影响。
 */
export function weekRange(date: string): { startMs: number; endMs: number; days: WeekDay[] } {
  const selected = dayNumber(date);
  const monday = selected - ((selected + 3) % 7 + 7) % 7;
  const startMs = monday * DAY_MS - BEIJING_OFFSET_MS;
  const days = Array.from({ length: 7 }, (_, offset) => ({
    date: dateFromDayNumber(monday + offset),
    startMs: startMs + offset * DAY_MS,
    segments: [],
  }));
  return { startMs, endMs: startMs + 7 * DAY_MS, days };
}

/** 北京时间某一天的左闭右开区间 `[00:00, 24:00)`。 */
export function dayRange(date: string): { startMs: number; endMs: number } {
  const startMs = parseBeijingDate(date);
  return { startMs, endMs: startMs + DAY_MS };
}

/**
 * 组装周视图：按周区间裁剪片段、跨午夜拆成逐日片段，并汇总本周四类时长。
 * 只纳入已完成记录，草稿既不显示也不计入统计。
 */
export function assembleWeek(selectedDate: string, entries: TimeEntry[]): WeekView {
  const range = weekRange(selectedDate);
  const days = range.days;
  const totals = emptyTotals();
  const included: TimeEntry[] = [];

  for (const entry of entries) {
    if (!isCompleted(entry)) continue;
    const clippedStart = Math.max(entry.startMs!, range.startMs);
    const clippedEnd = Math.min(entry.endMs!, range.endMs);
    if (clippedEnd <= clippedStart) continue;
    included.push(entry);
    addDuration(totals, entry.tag!, clippedEnd - clippedStart);

    for (const day of days) {
      const segmentStart = Math.max(clippedStart, day.startMs);
      const segmentEnd = Math.min(clippedEnd, day.startMs + DAY_MS);
      if (segmentStart < segmentEnd) {
        day.segments.push({ entryId: entry.id, startMs: segmentStart, endMs: segmentEnd });
      }
    }
  }

  return {
    selectedDate,
    weekStartMs: range.startMs,
    weekEndMs: range.endMs,
    entries: included,
    days,
    totals,
  };
}
