import { AppError } from "../core/errors";
import { findOverlap } from "../core/overlap";
import { validateEntry } from "../core/entry-validation";
import type { SaveEntryInput, TimeEntry } from "../core/entries";
import { TOMBSTONE_TTL_MS } from "../core/sync";
import { isNewer, newEntryId, nowMs } from "../core/timestamp";
import { withWriteLock } from "./mutex";
import type { TimeRepository } from "./repository";
import {
  CREATED_KEY,
  ENTRY_STORE,
  openDatabase,
  readAllEntries,
  readMetaValue,
  requestResult,
  sortEntries,
  storageError,
  transactionDone,
} from "./idb";

/** 基于 IndexedDB 的本地仓储：数据只保存在当前浏览器，云端同步是可选的第二份副本。 */
export class IndexedDbRepository implements TimeRepository {
  private db: IDBDatabase | null = null;

  private async open(): Promise<IDBDatabase> {
    if (!this.db) {
      const db = await openDatabase();
      db.onversionchange = () => {
        db.close();
        this.db = null;
      };
      this.db = db;
    }
    return this.db;
  }

  async listEntries(): Promise<TimeEntry[]> {
    try {
      return sortEntries(await readAllEntries(await this.open()));
    } catch (error) {
      throw storageError("读取记录失败", error);
    }
  }

  async saveEntry(input: SaveEntryInput): Promise<TimeEntry> {
    const validated = validateEntry(input);
    return withWriteLock(async () => {
      try {
        const db = await this.open();
        const existing = await readAllEntries(db);
        if (validated.state === "completed") {
          const conflict = findOverlap(
            existing,
            { startMs: validated.startMs!, endMs: validated.endMs! },
            validated.id,
          );
          if (conflict) {
            throw new AppError(
              "overlap",
              "这段时间与已有记录重叠，请调整起止时间或先编辑原记录",
              conflict.id,
            );
          }
        }
        const saved: TimeEntry = {
          id: validated.id ?? newEntryId(),
          startMs: validated.startMs,
          endMs: validated.endMs,
          startDate: validated.startDate,
          endDate: validated.endDate,
          content: validated.content,
          tag: validated.tag,
          state: validated.state,
          updatedAt: nowMs(),
          deletedAt: null,
        };
        const transaction = db.transaction(ENTRY_STORE, "readwrite");
        transaction.objectStore(ENTRY_STORE).put(saved);
        await transactionDone(transaction);
        return saved;
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw storageError("保存记录失败", error);
      }
    });
  }

  /** 删除保留墓碑，保证其他设备同步后不会把这条记录重新带回来。 */
  async deleteEntry(id: string): Promise<void> {
    if (typeof id !== "string" || id.trim() === "") {
      throw new AppError("validation", "记录编号无效");
    }
    return withWriteLock(async () => {
      try {
        const db = await this.open();
        const transaction = db.transaction(ENTRY_STORE, "readwrite");
        const store = transaction.objectStore(ENTRY_STORE);
        const existing = (await requestResult(store.get(id))) as TimeEntry | undefined;
        if (existing === undefined) throw new AppError("not_found", "记录不存在或已被删除");
        store.put({ ...existing, deletedAt: nowMs(), updatedAt: nowMs() });
        await transactionDone(transaction);
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw storageError("删除记录失败", error);
      }
    });
  }

  async startPunch(): Promise<TimeEntry> {
    return withWriteLock(async () => {
      try {
        const db = await this.open();
        const entry: TimeEntry = {
          id: newEntryId(),
          startMs: nowMs(),
          endMs: null,
          startDate: null,
          endDate: null,
          content: "",
          tag: null,
          state: "draft",
          updatedAt: nowMs(),
          deletedAt: null,
        };
        const transaction = db.transaction(ENTRY_STORE, "readwrite");
        transaction.objectStore(ENTRY_STORE).put(entry);
        await transactionDone(transaction);
        return entry;
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw storageError("打卡失败", error);
      }
    });
  }

  async createdAt(): Promise<number | null> {
    const value = await readMetaValue(await this.open(), CREATED_KEY);
    return typeof value === "number" ? value : null;
  }

  /** 整体替换：用于从备份文件恢复。 */
  async replaceAll(entries: TimeEntry[]): Promise<void> {
    return this.replaceStores(entries, "恢复备份失败");
  }

  /**
   * 写入同步结果：只覆盖云端版本更新的记录，本地较新的改动不动，
   * 避免刚输入的内容被一次拉取覆盖掉。
   */
  async applyRemote(entries: TimeEntry[]): Promise<void> {
    return withWriteLock(async () => {
      try {
        const db = await this.open();
        const existing = await readAllEntries(db);
        const byId = new Map(existing.map((entry) => [entry.id, entry]));
        const incoming = entries.filter((entry) => {
          const current = byId.get(entry.id);
          return current === undefined || isNewer(entry, current);
        });
        if (incoming.length === 0) return;
        const transaction = db.transaction(ENTRY_STORE, "readwrite");
        const store = transaction.objectStore(ENTRY_STORE);
        for (const entry of incoming) store.put(entry);
        await transactionDone(transaction);
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw storageError("写入云端记录失败", error);
      }
    });
  }

  /**
   * 用快照整体覆盖本地，返回写入条数。快照里没有的记录会被打上删除标记。
   *
   * 与 applyRemote 的区别：那个逐条比较、只写更新的，本地多出来的不动；
   * 这个让本地变成快照的镜像。墓碑会被推回云端，删除才会传到其他设备。
   */
  async mirrorRemote(entries: TimeEntry[]): Promise<number> {
    return withWriteLock(async () => {
      try {
        const db = await this.open();
        const existing = await readAllEntries(db);
        const incoming = new Map(entries.map((entry) => [entry.id, entry]));
        const now = nowMs();
        const transaction = db.transaction(ENTRY_STORE, "readwrite");
        const store = transaction.objectStore(ENTRY_STORE);
        let written = 0;

        for (const entry of entries) {
          store.put(entry);
          written += 1;
        }
        // 快照里没有的，或本地已有墓碑的，都打上删除标记
        for (const entry of existing) {
          if (incoming.has(entry.id)) continue;
          if (entry.deletedAt !== null) continue;
          store.put({ ...entry, deletedAt: now, updatedAt: now });
        }

        await transactionDone(transaction);
        return written;
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw storageError("覆盖本地数据失败", error);
      }
    });
  }

  /**
   * 真正删掉过期的删除墓碑。
   *
   * 以前只做了「过滤返回值」，数据库里的墓碑一条都没删，于是本地和云端都无限累积。
   * 保留期内的墓碑必须留着：离线很久的设备要靠它知道自己删过什么，否则会被自己
   * 的旧副本推回来。超过保留期才算安全。
   */
  async purgeTombstones(now: number): Promise<number> {
    return withWriteLock(async () => {
      try {
        const db = await this.open();
        const entries = await readAllEntries(db);
        const expired = entries.filter(
          (entry) => entry.deletedAt !== null && now - entry.deletedAt >= TOMBSTONE_TTL_MS,
        );
        if (expired.length === 0) return 0;
        const transaction = db.transaction(ENTRY_STORE, "readwrite");
        const store = transaction.objectStore(ENTRY_STORE);
        for (const entry of expired) store.delete(entry.id);
        await transactionDone(transaction);
        return expired.length;
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw storageError("清理删除标记失败", error);
      }
    });
  }

  async wipe(): Promise<void> {
    return withWriteLock(async () => {
      try {
        const db = await this.open();
        const transaction = db.transaction(ENTRY_STORE, "readwrite");
        transaction.objectStore(ENTRY_STORE).clear();
        await transactionDone(transaction);
      } catch (error) {
        throw storageError("清空记录失败", error);
      }
    });
  }

  private async replaceStores(entries: TimeEntry[], failureMessage: string): Promise<void> {
    return withWriteLock(async () => {
      try {
        const db = await this.open();
        const ordered = sortEntries(entries);
        const transaction = db.transaction(ENTRY_STORE, "readwrite");
        const store = transaction.objectStore(ENTRY_STORE);
        store.clear();
        for (const entry of ordered) store.put(entry);
        await transactionDone(transaction);
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw storageError(failureMessage, error);
      }
    });
  }
}
