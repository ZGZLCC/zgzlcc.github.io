import type { TimeEntry } from "./entries";

/** 合并结果：胜出的一方，以及两端各自被对方取代的记录。 */
export interface MergeResult {
  entries: TimeEntry[];
  /** 只存在于本地或因更新而替换了云端版本的记录，需要推送到云端。 */
  toPush: TimeEntry[];
  /** 云端版本更新、覆盖了本地副本的记录，需要写回本地存储。 */
  toPull: TimeEntry[];
  /** 两端不一致的记录数量，用于界面提示。 */
  conflicts: number;
}

function order(entries: TimeEntry[]): TimeEntry[] {
  return [...entries].sort((left, right) => {
    const leftKey = left.startMs ?? left.endMs ?? Number.NEGATIVE_INFINITY;
    const rightKey = right.startMs ?? right.endMs ?? Number.NEGATIVE_INFINITY;
    return rightKey - leftKey || left.id.localeCompare(right.id);
  });
}

/**
 * 按记录合并两份快照：同一条记录以 `updatedAt` 更晚者为准，相同则保留本地副本。
 * 删除以墓碑形式参与比较，因此"删除"同样能单向传播，不会被另一端的旧数据复活。
 */
export function mergeSnapshot(local: TimeEntry[], remote: TimeEntry[]): MergeResult {
  const localById = new Map(local.map((entry) => [entry.id, entry]));
  const remoteById = new Map(remote.map((entry) => [entry.id, entry]));
  const winners: TimeEntry[] = [];
  const toPush: TimeEntry[] = [];
  const toPull: TimeEntry[] = [];
  let conflicts = 0;

  for (const [id, localEntry] of localById) {
    const remoteEntry = remoteById.get(id);
    if (!remoteEntry) {
      winners.push(localEntry);
      toPush.push(localEntry);
      continue;
    }
    if (localEntry.updatedAt > remoteEntry.updatedAt) {
      winners.push(localEntry);
      toPush.push(localEntry);
      conflicts += 1;
    } else if (localEntry.updatedAt < remoteEntry.updatedAt) {
      winners.push(remoteEntry);
      toPull.push(remoteEntry);
      conflicts += 1;
    } else {
      winners.push(localEntry);
    }
  }

  for (const [id, remoteEntry] of remoteById) {
    if (localById.has(id)) continue;
    winners.push(remoteEntry);
    toPull.push(remoteEntry);
  }

  return { entries: order(winners), toPush, toPull, conflicts };
}

/** 本地是否已经与远端一致：两端记录逐条比较修改时间。 */
export function isInSync(local: TimeEntry[], remote: TimeEntry[]): boolean {
  if (local.length !== remote.length) return false;
  const remoteById = new Map(remote.map((entry) => [entry.id, entry]));
  return local.every((entry) => remoteById.get(entry.id)?.updatedAt === entry.updatedAt);
}

/**
 * 删除墓碑的保留期。
 *
 * 墓碑的用处是让离线很久的设备同步到「这条被删了」；超过这个窗口才算安全删除。
 * 两端的清理都必须用同一个值：网页端真正从 IndexedDB 删，Worker 端从云端快照里删。
 * 只在一端删而另一端留着，会出现「删掉的记录被另一端的旧副本推回来」。
 */
export const TOMBSTONE_TTL_MS = 180 * 86_400_000;

/**
 * 过滤掉超过保留期的墓碑，用于同步前的比较。
 * 注意这只是过滤返回值，真正删除记录请调用仓储的 purgeTombstones——
 * 以前只调用这个函数，导致墓碑在库里无限累积。
 */
export function pruneTombstones(entries: TimeEntry[], now: number): TimeEntry[] {
  return entries.filter((entry) => entry.deletedAt === null || now - entry.deletedAt < TOMBSTONE_TTL_MS);
}

/** 两条记录是否都已过期到可以删除。 */
export function isExpiredTombstone(entry: TimeEntry, now: number): boolean {
  return entry.deletedAt !== null && now - entry.deletedAt >= TOMBSTONE_TTL_MS;
}
