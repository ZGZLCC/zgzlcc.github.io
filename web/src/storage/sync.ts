import { ref } from "vue";
import { messageOf } from "../core/errors";
import { mergeSnapshot, pruneTombstones } from "../core/sync";
import { emitLocalDataChanged } from "./events";
import type { TimeRepository } from "./repository";
import { HttpRemoteClient } from "./remote";
import {
  isConfigured,
  loadLastSyncedAt,
  loadSyncSettings,
  saveLastSyncedAt,
  saveSyncSettings,
  type RemoteClient,
  type SyncSettings,
  type SyncState,
} from "./remote-settings";

const PUSH_DEBOUNCE_MS = 2000;

/**
 * 本地优先的双向同步：IndexedDB 是唯一写入目标，云端是持久副本。
 * 断网、未配置或 Worker 不可用时，记录功能完全不受影响。
 */
export class SyncEngine {
  readonly state = ref<SyncState>("idle");
  readonly lastSyncedAt = ref<number | null>(loadLastSyncedAt());
  readonly message = ref("");
  readonly settings = ref<SyncSettings>(loadSyncSettings());

  private client: RemoteClient | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private rerun = false;

  constructor(
    private readonly repository: TimeRepository,
    private readonly createClient: (settings: SyncSettings) => RemoteClient = (settings) =>
      new HttpRemoteClient(settings.endpoint, settings.code),
  ) {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => void this.sync());
    }
  }

  get configured(): boolean {
    return isConfigured(this.settings.value);
  }

  updateSettings(settings: SyncSettings): void {
    this.settings.value = settings;
    saveSyncSettings(settings);
    this.client = null;
    this.message.value = "";
  }

  /** 写入成功后调用：合并成一次推送，避免每次输入都发请求。 */
  requestPush(): void {
    if (!this.configured) return;
    if (this.pushTimer !== null) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.push();
    }, PUSH_DEBOUNCE_MS);
  }

  /**
   * 完整同步：先拉取并按记录合并两端，再在本地存在更新时推送。
   * 推送接口返回合并后的全量结果，因此推送与拉取不会产生分叉。
   */
  async sync(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    this.state.value = "syncing";
    this.message.value = "";
    try {
      const client = this.remote();
      const local = pruneTombstones(await this.repository.listEntries(), Date.now());
      const remote = await client.pull();
      const merged = mergeSnapshot(local, remote);
      if (merged.toPull.length > 0) {
        await this.repository.applyRemote(merged.toPull);
        emitLocalDataChanged(true);
      }
      if (merged.toPush.length > 0 || remote.length === 0) {
        const finalEntries = await client.push(merged.entries);
        await this.repository.applyRemote(finalEntries);
        emitLocalDataChanged(true);
      }
      this.markSynced();
      await this.purgeExpiredTombstones();
    } catch (error) {
      this.state.value = typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "error";
      this.message.value = messageOf(error, "同步失败");
    } finally {
      this.running = false;
      if (this.rerun) {
        this.rerun = false;
        void this.sync();
      }
    }
  }

  /**
   * 同步成功后顺手清掉过期墓碑。
   *
   * 必须在同步之后做：先清会导致「本地没有墓碑可推」，
   * 而云端若也已清，别的设备的旧副本就能把记录推回来。
   * 清理失败不影响同步结果，所以只吞掉错误。
   */
  private async purgeExpiredTombstones(): Promise<void> {
    try {
      await this.repository.purgeTombstones(Date.now());
    } catch {
      // 清不掉只是占一点空间，下次同步再试
    }
  }
  /** 只推送本地内容：用于首次把已有记录上传到云端。 */
  async push(): Promise<void> {
    if (!this.requireConfigured()) return;
    this.state.value = "syncing";
    this.message.value = "";
    try {
      const local = pruneTombstones(await this.repository.listEntries(), Date.now());
      const merged = await this.remote().push(local);
      await this.repository.applyRemote(merged);
      emitLocalDataChanged(true);
      this.markSynced();
      await this.purgeExpiredTombstones();
    } catch (error) {
      this.state.value = "error";
      this.message.value = messageOf(error, "上传失败");
    }
  }

  /** 只从云端恢复：本地较新的改动仍会保留。 */
  async pull(): Promise<void> {
    if (!this.requireConfigured()) return;
    this.state.value = "syncing";
    this.message.value = "";
    try {
      const remoteEntries = await this.remote().pull();
      await this.repository.applyRemote(remoteEntries);
      emitLocalDataChanged(true);
      this.markSynced();
      await this.purgeExpiredTombstones();
    } catch (error) {
      this.state.value = "error";
      this.message.value = messageOf(error, "恢复失败");
    }
  }

  /** 启动时调用：已配置就静默同步一次，未配置不做任何请求。 */
  start(): void {
    if (this.configured) void this.sync();
  }

  private requireConfigured(): boolean {
    if (this.configured) return true;
    this.state.value = "error";
    this.message.value = "请先填写 Worker 地址与访问口令";
    return false;
  }

  private remote(): RemoteClient {
    if (!this.client) this.client = this.createClient(this.settings.value);
    return this.client;
  }

  private markSynced(): void {
    const at = Date.now();
    this.state.value = "synced";
    this.message.value = "";
    this.lastSyncedAt.value = at;
    saveLastSyncedAt(at);
  }
}

/** 供界面展示的同步状态文案。 */
export function syncStateLabel(state: SyncState, lastSyncedAt: number | null): string {
  if (state === "syncing") return "正在同步…";
  if (state === "offline") return "当前离线，恢复网络后会自动重试";
  if (state === "error") return "同步失败";
  if (state === "synced") return "已同步";
  return lastSyncedAt === null ? "尚未同步" : "已就绪";
}
