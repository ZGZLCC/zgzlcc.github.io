import type { TimeEntry } from "../../src/core/entries";

/** 只接受结构完整的记录；业务规则由前端 core 负责，这里守住存储边界。 */
export function normalizeEntry(raw: unknown): TimeEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || value.id === "" || value.id.length > 64) return null;
  if (value.state !== "completed" && value.state !== "draft") return null;
  const startMs = optionalNumber(value.startMs);
  const endMs = optionalNumber(value.endMs);
  const deletedAt = optionalNumber(value.deletedAt);
  const updatedAt = optionalNumber(value.updatedAt);
  if (startMs === undefined || endMs === undefined || deletedAt === undefined) return null;
  if (typeof value.content !== "string" || value.content.length > 1000) return null;
  const tag = value.tag;
  if (!(tag === null || tag === "work" || tag === "leisure" || tag === "sleep" || tag === "other")) return null;
  return {
    id: value.id,
    startMs,
    endMs,
    startDate: optionalText(value.startDate) ?? null,
    endDate: optionalText(value.endDate) ?? null,
    content: value.content,
    tag: tag as TimeEntry["tag"],
    state: value.state,
    updatedAt: updatedAt ?? 0,
    deletedAt,
  };
}

/**
 * 删除墓碑的保留期，必须与网页端 `src/core/sync.ts` 的 TOMBSTONE_TTL_MS 一致。
 *
 * 墓碑在保留期内必须留着：离线很久的设备重新联网时，要靠它知道自己删过什么，
 * 否则那台设备的旧副本会把已删记录推回来。超过保留期才算安全。
 */
export const TOMBSTONE_TTL_MS = 180 * 86_400_000;

/**
 * 丢掉超过保留期的删除墓碑，避免云端无限累积。
 *
 * 只在写入时清理；GET 返回完整快照，让任何设备都能拿到自己需要的墓碑。
 * 以前两端都没有真正删除墓碑（只过滤返回值），墓碑会一直堆在 KV 里。
 */
export function pruneTombstones(entries: TimeEntry[], now: number): TimeEntry[] {
  return entries.filter((entry) => entry.deletedAt === null || now - entry.deletedAt < TOMBSTONE_TTL_MS);
}

/**
 * 按记录合并两份快照：`updatedAt` 更晚者胜出，相同则保留云端已有副本。
 * 删除墓碑参与同一比较，因此不会被旧数据复活。
 */
export function mergeEntries(incoming: TimeEntry[], existing: TimeEntry[]): TimeEntry[] {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    const current = byId.get(entry.id);
    if (current === undefined || entry.updatedAt > current.updatedAt) byId.set(entry.id, entry);
  }
  return [...byId.values()].sort(
    (left, right) =>
      (right.startMs ?? right.endMs ?? Number.NEGATIVE_INFINITY) -
        (left.startMs ?? left.endMs ?? Number.NEGATIVE_INFINITY) || left.id.localeCompare(right.id),
  );
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return isNumber(value) ? value : undefined;
}

function optionalText(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : undefined;
}
