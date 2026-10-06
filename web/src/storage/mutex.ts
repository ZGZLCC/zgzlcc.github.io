let chain: Promise<unknown> = Promise.resolve();

/**
 * 串行化写操作，避免同一标签页内的读—判—写互相穿插。
 * 跨标签页的并发由 IndexedDB 事务的可串行化保证兜底。
 */
export function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const next = chain.then(task, task);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
