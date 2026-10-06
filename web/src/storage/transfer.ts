import { AppError } from "../core/errors";
import type { TimeEntry } from "../core/entries";
import { parseEntries } from "../core/entry-validation";
import { pruneTombstones } from "../core/sync";
import { toBeijingInput } from "../time";

export const BACKUP_FORMAT = "time-web-backup";
export const BACKUP_VERSION = 2;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  entryCount: number;
  createdAt: number | null;
  entries: TimeEntry[];
}

/**
 * 组装备份内容；时间字段保持 UTC 毫秒，原样可再导入。
 * 过期的删除墓碑不写入备份，它们对恢复已经没有意义。
 */
export function buildBackup(entries: TimeEntry[], createdAt: number | null): BackupFile {
  const visible = pruneTombstones(entries, Date.now()).filter((entry) => entry.deletedAt === null);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entryCount: visible.length,
    createdAt,
    entries: visible,
  };
}

export function backupFileName(now: number): string {
  return `TimeBackup_${toBeijingInput(now).replace(/[-:]/g, "").replace("T", "_")}.json`;
}

/**
 * 解析备份文件。字段缺失或不合法时给出可操作的中文提示，
 * 不做部分导入，避免出现半份数据。
 */
export function parseBackup(text: string): TimeEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AppError("validation", "备份文件不是有效的 JSON，请确认选择的是本应用导出的文件");
  }
  if (typeof raw !== "object" || raw === null) {
    throw new AppError("validation", "备份文件内容无效");
  }
  const value = raw as Record<string, unknown>;
  if (value.format !== BACKUP_FORMAT) {
    throw new AppError("validation", "备份文件格式不匹配，请选择本应用导出的文件");
  }
  if (typeof value.version !== "number" || value.version > BACKUP_VERSION) {
    throw new AppError("validation", "备份文件版本高于当前应用，请更新后再恢复");
  }
  const entries = parseEntries(value.entries);
  // 旧备份没有同步字段：按顺序分配递增的修改时间，导入后即可正常参与同步比较。
  const base = Date.now();
  return entries.map((entry, index) => ({
    ...entry,
    updatedAt: entry.updatedAt > 0 ? entry.updatedAt : base + index,
    deletedAt: null,
  }));
}
