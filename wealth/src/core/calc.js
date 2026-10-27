/**
 * 财富自由计算器的纯计算逻辑：不接触 DOM、localStorage 与网络，可直接用 Node 测试。
 *
 * 约定：金额单位统一为「万元」，比率的单位是百分比数值（4.5 表示 4.5%）。
 *
 * 正推：家庭月消费 × 12 ÷（年收益率 − 通货膨胀率）得到覆盖日常生活的本金，
 *       再加上育儿、健康与重大投入，就是需要的资产总额。
 * 反推：给定总资产，把没被勾选的项按当前参数固定下来，
 *       剩下的部分就是被勾选那几项可以自由分配的合计。
 */

/** 身份：单人按 1 人计，夫妻按 2 人计。 */
export const IDENTITIES = [
  { id: "single", label: "单人", persons: 1 },
  { id: "couple", label: "夫妻", persons: 2 },
];

/** 四项支出的固定顺序，正推与反推共用。 */
export const ITEMS = [
  { id: "living", label: "日常生活" },
  { id: "children", label: "育儿" },
  { id: "health", label: "健康" },
  { id: "major", label: "重大投入" },
];

/** 反推里可以逐项求解的对象：四项支出，加上收入侧的两项。 */
export const SOLVABLES = [
  ...ITEMS,
  { id: "salary", label: "月均工资" },
  { id: "workYears", label: "工作时长" },
];

export const DEFAULTS = {
  mode: "need",
  identity: "couple",
  monthlyPerPerson: 0.5,
  rate: 4.5,
  inflation: 2,
  children: 1,
  childUnitCost: 100,
  health: 150,
  major: 300,
  initialAssets: 0,
  salary: 1.2,
  salaryGrowth: 5,
  workYears: 30,
  targetYears: 40,
  targets: ["major"],
};

/** 身份对应的人数；未知身份按单人处理。 */
export function personsOf(identity) {
  return IDENTITIES.find((item) => item.id === identity)?.persons ?? 1;
}

/** 把金额或数量归一：非有限数、负数都按 0 处理。 */
function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * 正推：按当前参数算出四项金额与总额。
 * 收益率不高于通胀率时，生活本金没有任何有限解，此时 living 为 Infinity，由 validate 拦住。
 */
export function computeNeed(input) {
  const persons = personsOf(input.identity);
  const monthly = amount(input.monthlyPerPerson) * persons;
  const spread = (Number(input.rate) - Number(input.inflation)) / 100;
  const living = spread > 0 ? (monthly * 12) / spread : Infinity;
  const parts = {
    living,
    children: Math.round(amount(input.children)) * amount(input.childUnitCost),
    health: amount(input.health),
    major: amount(input.major),
  };
  const total = parts.living + parts.children + parts.health + parts.major;
  return { persons, monthly, spread, parts, total };
}

/**
 * 反推：pool 是手上能用的钱（由初始资产与工资推演得出），
 * 把不在 targets 里的支出固定下来，剩下多少给 targets。
 * targets 为空表示没有可分配的部分，由 validate 拦住。
 */
export function computeAllocation(input, targets, pool) {
  const solving = new Set(Array.isArray(targets) ? targets : []);
  const need = computeNeed(input);
  const fixed = [];
  let fixedTotal = 0;
  for (const item of ITEMS) {
    if (solving.has(item.id)) continue;
    const value = need.parts[item.id];
    if (!Number.isFinite(value)) continue;
    fixed.push({ id: item.id, label: item.label, amount: value });
    fixedTotal += value;
  }
  const total = amount(pool);
  return { total, fixedTotal, fixed, free: total - fixedTotal, solving: [...solving] };
}

/**
 * 校验参数，返回可以直接展示给用户的中文提示；空数组表示可以计算。
 * 传了 targets 就走反推口径：被反推的项不参与计算，因此不再要求它有有效参数。
 */
export function validate(input, targets = null) {
  const errors = [];
  const reverse = Array.isArray(targets);
  const solvingLiving = reverse && targets.includes("living");
  const rate = Number(input.rate);
  const inflation = Number(input.inflation);

  // 反推模式下被解的那一项目前没有值，不再要求它已经填好
  const solvingSalary = reverse && targets.includes("salary");
  const solvingYears = reverse && targets.includes("workYears");

  if (reverse) {
    if (targets.length === 0) errors.push("至少勾选一项要反推的内容。");
    const want = Number(input.targetYears);
    if (!Number.isFinite(want) || want < 1 || want > 100) {
      errors.push("希望花完的年份要填 1 到 100 之间的数字。");
    }
  }

  if (!solvingLiving) {
    if (!Number.isFinite(rate) || !Number.isFinite(inflation)) {
      errors.push("年收益率与通货膨胀率都要填数字。");
    } else if (rate <= inflation) {
      errors.push("年收益率需要高于通货膨胀率，否则本金涨不过物价。");
    }
  }

  for (const [key, label] of [
    ["monthlyPerPerson", "人均月消费"],
    ["childUnitCost", "育儿总成本"],
    ["health", "健康开销"],
    ["major", "重大投入"],
  ]) {
    const value = Number(input[key]);
    if (Number.isFinite(value) && value < 0) errors.push(`${label}不能是负数。`);
  }
  if (Number.isFinite(Number(input.children)) && Number(input.children) < 0) {
    errors.push("孩子数量不能是负数。");
  }

  // 收入推演要用到这两项，反推它们的时候才不要求填好
  for (const [key, label] of [
    ["salary", "月均工资"],
    ["workYears", "工作时长"],
  ]) {
    if ((key === "salary" && solvingSalary) || (key === "workYears" && solvingYears)) continue;
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < 0) errors.push(`${label}要填一个不小于 0 的数字。`);
  }
  if (Number.isFinite(Number(input.initialAssets)) && Number(input.initialAssets) < 0) {
    errors.push("初始资产不能是负数。");
  }
  if (Number.isFinite(Number(input.salaryGrowth)) && Number(input.salaryGrowth) < 0) {
    errors.push("工资年增长率不能是负数。");
  }

  return errors;
}
