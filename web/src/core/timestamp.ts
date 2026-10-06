/** 记录编号：优先用加密级随机 UUID，旧环境退回时间戳加随机串。 */
export function newEntryId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `e${Date.now().toString(36)}-${random}`;
}

/** 统一的"最后修改时间"来源，同步冲突比较与存储写入都取自这里。 */
export function nowMs(): number {
  return Date.now();
}

/** 记录是否可以在同步时覆盖另一份副本：修改时间更晚者胜出，相同则保留原有副本。 */
export function isNewer(incoming: { updatedAt: number }, existing: { updatedAt: number }): boolean {
  return incoming.updatedAt > existing.updatedAt;
}
