import type { TimeEntry } from "../core/entries";

/** 云端交互接口；真实实现走 HTTP，测试用内存实现。 */
export interface RemoteClient {
  /** 读取云端记录的当前修订号，用于判断是否需要真正传输。 */
  revision(): Promise<number>;
  pull(): Promise<TimeEntry[]>;
  push(entries: TimeEntry[]): Promise<TimeEntry[]>;
}

/** 同步状态，供设置页展示。 */
export type SyncState = "idle" | "syncing" | "synced" | "offline" | "error";

export interface SyncSettings {
  /** Worker 地址，例如 https://time-sync.xxx.workers.dev */
  endpoint: string;
  /** 与 Worker 上的 SYNC_TOKEN 对应的访问口令。 */
  token: string;
}

const SETTINGS_KEY = "timeweb-sync";
const LAST_SYNCED_KEY = "timeweb-synced-at";

/** 同步配置只保存在本机，不进入备份文件，也不会随导出泄露口令。 */
export function loadSyncSettings(): SyncSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { endpoint: "", token: "" };
    const value = JSON.parse(raw) as Partial<SyncSettings>;
    return { endpoint: String(value.endpoint ?? ""), token: String(value.token ?? "") };
  } catch {
    return { endpoint: "", token: "" };
  }
}

export function saveSyncSettings(settings: SyncSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadLastSyncedAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_SYNCED_KEY);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveLastSyncedAt(timestampMs: number): void {
  try {
    localStorage.setItem(LAST_SYNCED_KEY, String(timestampMs));
  } catch {
    // 本地存储不可用时不影响同步本身，只是设置页无法显示上次同步时间。
  }
}

export function isConfigured(settings: SyncSettings): boolean {
  return settings.endpoint.trim() !== "" && settings.token.trim() !== "";
}
