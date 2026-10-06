type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * 当前这次变化是否来自云端写入。
 * 同步引擎写入前会置为 true，避免"云端写回本地"又被当成一次本地改动推回云端。
 */
export let isRemoteApply = false;

/** 订阅本地数据变化（新增、导入、清空、云端写入），返回取消订阅的函数。 */
export function onLocalDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 广播本地数据已变化。
 * 用事件而不是单个回调：设置页与记录页可能同时在监听，回调会互相覆盖。
 */
export function emitLocalDataChanged(fromRemote = false): void {
  isRemoteApply = fromRemote;
  try {
    for (const listener of [...listeners]) listener();
  } finally {
    isRemoteApply = false;
  }
}
