/**
 * 财富计算器的纯计算逻辑：不接触 DOM、localStorage 与网络，可直接用 Node 测试。
 *
 * 约定：金额单位统一为「万元」，比率的单位是百分比数值（4.5 表示 4.5%）。
 *
 * 这里只准备「工资计算」要用的参数：育儿按 22 年摊、房子分首付与月供、健康留到最后预留。
 * 逐月推演在 simulate.js，页面拼装在 render.js。
 */

/** 身份：单人按 1 人计，夫妻按 2 人计。 */
export const IDENTITIES = [
  { id: "single", label: "单人", persons: 1 },
  { id: "couple", label: "夫妻", persons: 2 },
];

/**
 * 育儿 22 年按年龄分段摊开：婴幼儿期花得少，上学后逐段变重，大学最贵。
 * years 是这一段年数，weight 是这一段每年的相对花销；摊的时候归一化，总额仍是「每孩总成本」。
 */
export const CHILD_STAGES = [
  { years: 3, weight: 0.6 },
  { years: 3, weight: 1 },
  { years: 6, weight: 0.9 },
  { years: 3, weight: 1.1 },
  { years: 3, weight: 1.3 },
  { years: 4, weight: 1.6 },
];

/** 育儿一共摊 22 年：从出生算到大学毕业。 */
export const CHILD_YEARS = CHILD_STAGES.reduce((sum, item) => sum + item.years, 0);

/** 22 年的权重之和；摊每月时用它归一化，权重只决定比例，不放大总额。 */
export const CHILD_WEIGHT_TOTAL = CHILD_STAGES.reduce((sum, item) => sum + item.years * item.weight, 0);

export const DEFAULTS = {
  identity: "couple",
  // 人均月消费不含房贷与育儿，这两项单独填
  monthlyPerPerson: 0.5,
  rate: 4.5,
  inflation: 2,
  // 育儿：每个孩子的总成本按 22 年摊到每月，各自从自己的开始年份起算
  children: 1,
  childUnitCost: 100,
  childStartYears: [2],
  // 房子：首付一次付，之后按月供还 houseYears 年；全款时月供填 0（默认工作 8 年后买房，那时手上有 120 多万）
  houseDown: 90,
  houseDownYear: 8,
  houseMonthly: 1.1,
  houseMonthlyYear: 8,
  houseYears: 25,
  // 健康：工作结束时预留一笔，用于医疗等方面
  health: 150,
  // 专项支出里被移除的块（育儿 / 房子 / 健康），以及用户自己加的那些
  removed: [],
  custom: [],
  // 工资：按年填，增长分两段，两段年数相加就是工作时长
  initialAssets: 0,
  annualSalary: 24,
  salaryGrowthYears: 10,
  salaryGrowthEarly: 8,
  salaryGrowthLateYears: 20,
  salaryGrowthLate: 3,
};

/** 能移除也能加回来的三块；顺序就是「加回来」按钮的顺序。 */
export const FIXED_BLOCKS = [
  { id: "children", label: "育儿" },
  { id: "house", label: "房子" },
  { id: "health", label: "健康" },
];

/** 加回某一块时恢复成默认值，和首次打开页面时一样。 */
export const BLOCK_DEFAULTS = {
  children: {
    children: DEFAULTS.children,
    childUnitCost: DEFAULTS.childUnitCost,
    childStartYears: [...DEFAULTS.childStartYears],
  },
  house: {
    houseDown: DEFAULTS.houseDown,
    houseDownYear: DEFAULTS.houseDownYear,
    houseMonthly: DEFAULTS.houseMonthly,
    houseMonthlyYear: DEFAULTS.houseMonthlyYear,
    houseYears: DEFAULTS.houseYears,
  },
  health: { health: DEFAULTS.health },
};

/** 新加的专项支出：所有数字都从 0 起，等用户自己填。 */
export const DEFAULT_CUSTOM = {
  id: "",
  name: "",
  amount: 0,
  year: 0,
  monthly: 0,
  monthlyYear: 0,
  years: 0,
};

/** 新加一个孩子时默认从工作第 2 年开始。 */
export const DEFAULT_CHILD_YEAR = DEFAULTS.childStartYears[0];

/** 身份对应的人数；未知身份按单人处理。 */
export function personsOf(identity) {
  return IDENTITIES.find((item) => item.id === identity)?.persons ?? 1;
}

/** 某一块专项支出还在不在（被移除的块不参与计算）。 */
export function isEnabled(input, id) {
  const removed = Array.isArray(input.removed) ? input.removed : [];
  return !removed.includes(id);
}

/** 把金额或数量归一：非有限数、负数都按 0 处理。 */
function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/** 育儿第 year 年（0 基）的相对权重；超出 22 年按 0 计。 */
function childYearWeight(year) {
  let left = year;
  for (const item of CHILD_STAGES) {
    if (left < item.years) return item.weight;
    left -= item.years;
  }
  return 0;
}

/**
 * 一个孩子第 month 个月（0 基，共 22 × 12 个月）该摊多少万；超出 22 年返回 0。
 * 一年 = 每孩总成本 × 当年权重 ÷ 权重之和，再除以 12 落到每月。
 */
export function childMonthShare(unitCost, month) {
  if (!(month >= 0 && month < CHILD_YEARS * 12)) return 0;
  return (amount(unitCost) * childYearWeight(Math.floor(month / 12))) / (CHILD_WEIGHT_TOTAL * 12);
}

/**
 * 每个孩子各自的开始年份（工作第几年，从 1 数起）：按孩子数量截断或补齐，
 * 没填、填 0 的都按默认的第 2 年算；育儿整块被移除时没有孩子。
 */
export function childStartYears(input) {
  if (!isEnabled(input, "children")) return [];
  const count = Math.round(amount(input.children));
  const saved = Array.isArray(input.childStartYears) ? input.childStartYears : [];
  const years = [];
  for (let index = 0; index < count; index += 1) {
    const year = Math.round(amount(saved[index]));
    years.push(year > 0 ? year : DEFAULT_CHILD_YEAR);
  }
  return years;
}

/** 房子一共要花多少：首付 + 月供 × 12 × 年数；全款时月供为 0，就只剩首付。整块移除时为 0。 */
export function houseTotal(input) {
  if (!isEnabled(input, "house")) return 0;
  return amount(input.houseDown) + amount(input.houseMonthly) * 12 * Math.round(amount(input.houseYears));
}

/** 工作结束时预留多少医疗；健康整块被移除时为 0。 */
export function healthTotal(input) {
  return isEnabled(input, "health") ? amount(input.health) : 0;
}

/**
 * 用户自己加的专项支出，全部归一成数字：一次性金额在 year 那一年付，
 * 之后每月 monthly 万付 years 年（从 monthlyYear 那年开始）。年份都从 1 数起。
 */
export function customItems(input) {
  const list = Array.isArray(input.custom) ? input.custom : [];
  return list.map((item, index) => ({
    id: typeof item?.id === "string" && item.id ? item.id : `custom-${index}`,
    name: typeof item?.name === "string" ? item.name.trim() : "",
    amount: amount(item?.amount),
    year: Math.max(1, Math.round(amount(item?.year) || 1)),
    monthly: amount(item?.monthly),
    monthlyYear: Math.max(1, Math.round(amount(item?.monthlyYear) || 1)),
    years: Math.round(amount(item?.years)),
  }));
}

/** 某一项自定义专项一共要花多少：一次性 + 月付 × 12 × 年数。 */
export function customTotal(item) {
  return amount(item.amount) + amount(item.monthly) * 12 * Math.round(amount(item.years));
}

/** 自定义专项的名称，没填就叫「自定义专项」。 */
export function customName(item) {
  return (item?.name || "").trim() || "自定义专项";
}
