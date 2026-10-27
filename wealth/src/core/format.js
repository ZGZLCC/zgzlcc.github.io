/**
 * 结果展示用的格式化：金额单位是万元，比率是百分比数值。
 * 只做展示，不做四舍五入后的再计算。
 */

/** 万元金额：最多一位小数、带千分位，非有限数显示占位符。 */
export function formatWan(value) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
}

/** 百分比：最多一位小数，去掉无意义的 .0。 */
export function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 1, minimumFractionDigits: 0 })}%`;
}
