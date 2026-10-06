import type { EntryTag } from "../tags";

export type EntryState = "draft" | "completed";

/**
 * 一条时间记录。时间一律为 UTC Unix 毫秒，展示按北京时间换算。
 * `id` 由客户端生成的 UUID，多设备离线各写各的也不会撞号；
 * `updatedAt` 用于同步时按记录取较新版本，`deletedAt` 是删除墓碑。
 */
export interface TimeEntry {
  id: string;
  startMs: number | null;
  endMs: number | null;
  startDate: string | null;
  endDate: string | null;
  content: string;
  tag: EntryTag | null;
  state: EntryState;
  updatedAt: number;
  deletedAt: number | null;
}

/** 保存请求；`id` 为空表示新建，`updatedAt` 由存储层在写入时赋值。 */
export interface SaveEntryInput {
  id?: string;
  startMs: number | null;
  endMs: number | null;
  startDate: string | null;
  endDate: string | null;
  content: string;
  tag: EntryTag | null;
}

/** 只有起止时间都完整且内容、标签齐全的记录才计入统计与周视图。 */
export function isCompleted(entry: TimeEntry): boolean {
  return (
    entry.state === "completed" &&
    entry.deletedAt === null &&
    entry.startMs !== null &&
    entry.endMs !== null &&
    entry.tag !== null
  );
}

/** 待补全记录包含草稿与旧版本的进行中状态，已删除的不再显示。 */
export function isPending(entry: TimeEntry): boolean {
  return entry.state !== "completed" && entry.deletedAt === null;
}

/** 已删除的记录以墓碑形式保留，用于让其他设备同步到这次删除。 */
export function isDeleted(entry: TimeEntry): boolean {
  return entry.deletedAt !== null;
}

/** 界面上需要展示的记录：既未删除也不是待补全的已完成记录。 */
export function isVisible(entry: TimeEntry): boolean {
  return entry.deletedAt === null;
}

export const TAG_VALUES: readonly EntryTag[] = ["work", "leisure", "sleep", "other"];

export function isEntryTag(value: unknown): value is EntryTag {
  return typeof value === "string" && (TAG_VALUES as readonly string[]).includes(value);
}

/** 读取备份或存储中的状态值，未知值按草稿处理，避免脏数据进入内存。 */
export function parseEntryState(value: unknown): EntryState {
  return value === "completed" ? "completed" : "draft";
}
