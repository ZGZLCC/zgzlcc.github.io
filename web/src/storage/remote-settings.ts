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
  /** Worker 地址；构建时注入默认值，通常不需要用户填写。 */
  endpoint: string;
  /** 同步码：由管理员创建，一个码对应一份独立数据。 */
  code: string;
}

const SETTINGS_KEY = "timeweb-sync";
const LAST_SYNCED_KEY = "timeweb-synced-at";

/** 构建时注入的同步服务地址；没有配置时用户需要自己填写。 */
const BUILT_IN_ENDPOINT = (import.meta.env?.VITE_TIME_SYNC_ENDPOINT ?? "").trim();

export function defaultEndpoint(): string {
  return BUILT_IN_ENDPOINT;
}

export function hasBuiltInEndpoint(): boolean {
  return BUILT_IN_ENDPOINT !== "";
}

/**
 * 同步配置只保存在本机，不进入备份文件。
 * 同步码是数据分区标识而非密钥，泄露只影响这一份数据，可用管理接口吊销。
 */
export function loadSyncSettings(): SyncSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { endpoint: BUILT_IN_ENDPOINT, code: "" };
    const value = JSON.parse(raw) as { endpoint?: unknown; code?: unknown };
    return {
      endpoint: String(value.endpoint ?? "").trim() || BUILT_IN_ENDPOINT,
      code: String(value.code ?? "").trim(),
    };
  } catch {
    return { endpoint: BUILT_IN_ENDPOINT, code: "" };
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
  return settings.endpoint.trim() !== "" && settings.code.trim() !== "";
}
