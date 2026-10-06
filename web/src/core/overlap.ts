import { isCompleted, type TimeEntry } from "./entries";

/** 两条区间是否相交；首尾相接不算重叠。 */
export function rangesOverlap(
  left: { startMs: number; endMs: number },
  right: { startMs: number; endMs: number },
): boolean {
  return left.startMs < right.endMs && left.endMs > right.startMs;
}

/**
 * 找出与给定区间重叠的第一条已完成记录，编辑时排除自身。
 * 草稿与已删除记录都不参与判定；排序口径为开始时间最早者优先。
 */
export function findOverlap(
  entries: TimeEntry[],
  range: { startMs: number; endMs: number },
  excludeId?: string,
): TimeEntry | null {
  const conflicts = entries
    .filter(isCompleted)
    .filter((entry) => entry.id !== excludeId)
    .filter((entry) => rangesOverlap(range, { startMs: entry.startMs!, endMs: entry.endMs! }))
    .sort((left, right) => left.startMs! - right.startMs!);
  return conflicts[0] ?? null;
}
