import { ref } from "vue";

const LAST_EXPORT_KEY = "timeweb-last-export";
/** 超过这个天数没有同步、也没有本地备份就提醒一次。 */
const REMIND_AFTER_DAYS = 7;
const DAY_MS = 86_400_000;

export function loadLastExportedAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_EXPORT_KEY);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveLastExportedAt(timestampMs: number): void {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, String(timestampMs));
  } catch {
    // 本地存储不可用时只是无法记录导出时间，不影响导出本身。
  }
}

/** 单项是否已过期：从未发生过，或距上次超过阈值。 */
export function isStale(lastAt: number | null, now: number): boolean {
  if (lastAt === null) return true;
  return now - lastAt > REMIND_AFTER_DAYS * DAY_MS;
}

/**
 * 是否该提醒：距上次同步或上次导出超过 7 天。
 * 未配置云端同步时同步时间恒为 null，此时只看导出时间，免得每次打开都弹。
 */
export function shouldRemind(now: number, lastSyncedAt: number | null, lastExportedAt: number | null): boolean {
  const syncStale = lastSyncedAt === null ? false : isStale(lastSyncedAt, now);
  return syncStale || isStale(lastExportedAt, now);
}

/** 全应用共享的导出时间，导出后立即更新，提醒随之消失。 */
export const lastExportedAt = ref<number | null>(loadLastExportedAt());

export function markExported(now: number): void {
  lastExportedAt.value = now;
  saveLastExportedAt(now);
}

export const BACKUP_REMIND_DAYS = REMIND_AFTER_DAYS;
