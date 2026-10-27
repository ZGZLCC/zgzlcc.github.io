/**
 * 参数只保存在当前浏览器的 localStorage；读写失败（无痕模式、禁用存储）时静默降级，
 * 页面照常计算，只是不记忆上次填的数字。
 */
const KEY = "wealth-calc-v1";

/** 读出上次保存的参数；没有、损坏或类型不对都当作空对象，由调用方回落到默认值。 */
export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** 写入参数；NaN 会变成 null，重新载入时按「没填」处理。 */
export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state, (_key, value) => (
      typeof value === "number" && !Number.isFinite(value) ? null : value
    )));
  } catch {
    // 存不了就不用存，计算结果不依赖它
  }
}
