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

/** 数据库行转回记录；字段缺失或非法时返回 null，由调用方过滤。 */
export function rowToEntry(row: Record<string, unknown>): TimeEntry | null {
  if (typeof row.id !== "string" || row.id === "") return null;
  if (row.state !== "completed" && row.state !== "draft") return null;
  if (!isNumber(row.start_ms) && row.start_ms !== null) return null;
  return {
    id: row.id,
    startMs: row.start_ms === null ? null : (row.start_ms as number),
    endMs: row.end_ms === null ? null : (row.end_ms as number),
    startDate: typeof row.start_date === "string" ? row.start_date : null,
    endDate: typeof row.end_date === "string" ? row.end_date : null,
    content: typeof row.content === "string" ? row.content : "",
    tag: readTag(row.tag),
    state: row.state,
    updatedAt: isNumber(row.updated_at) ? row.updated_at : 0,
    deletedAt: row.deleted_at === null ? null : isNumber(row.deleted_at) ? row.deleted_at : null,
  };
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

function readTag(value: unknown): TimeEntry["tag"] {
  return value === "work" || value === "leisure" || value === "sleep" || value === "other" ? value : null;
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
