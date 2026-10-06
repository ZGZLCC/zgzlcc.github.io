import type { WeekTotals, WeekView } from "./core/totals";
import type { SaveEntryInput, TimeEntry } from "./core/entries";
import { isVisible } from "./core/entries";
import { aggregateTotals } from "./core/totals";
import { assembleWeek, dayRange } from "./core/week";
import { repository } from "./storage";

export type { EntryState, SaveEntryInput, TimeEntry } from "./core/entries";
export type { WeekDay, WeekSegment, WeekTotals, WeekView } from "./core/totals";
export type { EntryTag } from "./tags";
export { sync, syncStateLabel } from "./storage";
export type { SyncSettings, SyncState } from "./storage";

export const PNG_MIME = "image/png";
export const JSON_MIME = "application/json";
export const BACKUP_EXTENSION = ".json";

/** 界面只处理未删除的记录；删除墓碑仍保留在存储中供同步使用。 */
export async function listEntries(): Promise<TimeEntry[]> {
  return (await repository.listEntries()).filter(isVisible);
}

export const saveEntry = (input: SaveEntryInput): Promise<TimeEntry> => repository.saveEntry(input);
export const deleteEntry = (id: string): Promise<void> => repository.deleteEntry(id);
export const startPunch = (): Promise<TimeEntry> => repository.startPunch();
export const listPending = async (): Promise<TimeEntry[]> =>
  (await listEntries()).filter((entry) => entry.state !== "completed");

/** 周视图只纳入已完成记录，页面在此基础上按日筛选历史与详情。 */
export async function getWeek(date: string): Promise<WeekView> {
  return assembleWeek(date, await listEntries());
}

/** 选中日期 `[00:00, 24:00)` 的四类时长，与周统计共用同一套裁剪规则。 */
export async function getDayTotals(date: string): Promise<WeekTotals> {
  return aggregateTotals(await listEntries(), dayRange(date));
}

export async function getAllTotals(): Promise<WeekTotals> {
  return aggregateTotals(await listEntries(), allRange());
}

function allRange(): { startMs: number; endMs: number } {
  return { startMs: Number.NEGATIVE_INFINITY, endMs: Number.POSITIVE_INFINITY };
}

/** 触发浏览器下载；浏览器不支持时回退到打开新窗口，由用户自行保存。 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function readTextFile(file: File): Promise<string> {
  return file.text();
}
