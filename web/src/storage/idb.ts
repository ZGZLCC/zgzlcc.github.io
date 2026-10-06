import { AppError } from "../core/errors";
import type { TimeEntry } from "../core/entries";

export const DB_NAME = "time-web";
export const DB_VERSION = 2;
export const ENTRY_STORE = "entries";
export const META_STORE = "meta";
export const CREATED_KEY = "createdAt";

export function storageError(message: string, cause?: unknown): AppError {
  const detail = cause instanceof Error && cause.message ? `：${cause.message}` : "";
  return new AppError("storage", `${message}${detail}`);
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("数据库请求失败"));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("数据库事务失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("数据库事务被中止"));
  });
}

/** 按开始时间倒序排列；缺开始时间时退回结束时间，再退回编号。 */
export function sortEntries(entries: TimeEntry[]): TimeEntry[] {
  return [...entries].sort((left, right) => {
    const leftKey = left.startMs ?? left.endMs ?? Number.NEGATIVE_INFINITY;
    const rightKey = right.startMs ?? right.endMs ?? Number.NEGATIVE_INFINITY;
    return rightKey - leftKey || left.id.localeCompare(right.id);
  });
}

/** 打开数据库；版本升级时按 UUID 主键重建记录表，旧编号数据不再兼容。 */
export async function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    throw new AppError("storage", "当前环境不支持 IndexedDB，请改用较新的 Chrome、Edge 或 Safari 打开");
  }
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (db.objectStoreNames.contains(ENTRY_STORE)) {
      db.deleteObjectStore(ENTRY_STORE);
    }
    db.createObjectStore(ENTRY_STORE, { keyPath: "id" });
    if (!db.objectStoreNames.contains(META_STORE)) {
      db.createObjectStore(META_STORE);
    }
  };
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageError("无法打开本地存储", request.error));
  });
  if ((await readMetaValue(db, CREATED_KEY)) === undefined) {
    const transaction = db.transaction(META_STORE, "readwrite");
    transaction.objectStore(META_STORE).put(Date.now(), CREATED_KEY);
    await transactionDone(transaction);
  }
  return db;
}

export async function readMetaValue(db: IDBDatabase, key: string): Promise<unknown> {
  const transaction = db.transaction(META_STORE, "readonly");
  return requestResult(transaction.objectStore(META_STORE).get(key));
}

export async function readAllEntries(db: IDBDatabase): Promise<TimeEntry[]> {
  const transaction = db.transaction(ENTRY_STORE, "readonly");
  const records = (await requestResult(transaction.objectStore(ENTRY_STORE).getAll())) as TimeEntry[];
  await transactionDone(transaction);
  return records;
}
