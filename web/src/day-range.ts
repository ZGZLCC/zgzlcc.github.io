const DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function beijingMidnightUtc(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("日期无效");
  const [year, month, day] = match.slice(1).map(Number);
  return Date.UTC(year, month - 1, day) - BEIJING_OFFSET_MS;
}

/** 北京时间某一天的起点，以 UTC 毫秒表示。 */
export function dayStartMs(date: string): number {
  return beijingMidnightUtc(date);
}

/** 北京时间某一天的左闭右开毫秒区间 `[start, end)`。 */
export function dayRange(date: string): { startMs: number; endMs: number } {
  const start = dayStartMs(date);
  return { startMs: start, endMs: start + DAY_MS };
}

/** 把 UTC 毫秒转换为对应的北京时间日期 `YYYY-MM-DD`。 */
export function beijingDateOf(timestampMs: number): string {
  return new Date(timestampMs + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

/** 判断一条记录是否在北京时间某一天内出现过，包含跨午夜记录。 */
export function entryIntersectsDay(
  entry: { startMs: number | null; endMs: number | null },
  startMs: number,
  endMs: number,
): boolean {
  if (entry.startMs == null || entry.endMs == null) return true;
  return entry.startMs < endMs && entry.endMs > startMs;
}

/** 选出北京时间某一天出现的记录，空日期表示不过滤。 */
export function recordsOnDay<T extends { startMs: number | null; endMs: number | null }>(
  entries: T[],
  date: string,
): T[] {
  if (!date) return entries;
  const { startMs, endMs } = dayRange(date);
  return entries.filter((entry) => entryIntersectsDay(entry, startMs, endMs));
}
