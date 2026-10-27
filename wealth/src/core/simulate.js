/**
 * 现金流模拟：从初始资产出发，逐月计入理财收益与工资、扣掉随通胀上涨的生活费，
 * 看这笔钱还能撑多少年；也能按「希望第几年花完」反推某一项参数。
 *
 * 约定与 calc.js 一致：金额单位万元，比率是百分比数值，年数按整年算。
 * 一次性大额（育儿、健康、重大投入）按当前口径扣在工作年限结束那个月。
 */
import { personsOf } from "./calc.js";

/** 最多看 100 年，超过就当作花不完。 */
export const MAX_YEARS = 100;

/** 反推时各参数允许的搜索上限，以及「越大撑得越久」的方向。 */
const SOLVERS = {
  living: { max: 100, up: false },
  children: { max: 1000, up: false },
  health: { max: 10000, up: false },
  major: { max: 10000, up: false },
  salary: { max: 100, up: true },
  workYears: { max: MAX_YEARS, up: true },
};

/** 反推项对应的输入字段：育儿解的是单个孩子的成本，生活解的是人均月消费。 */
const FIELDS = {
  living: "monthlyPerPerson",
  children: "childUnitCost",
  health: "health",
  major: "major",
  salary: "salary",
  workYears: "workYears",
};

/** 数值归一：非有限数与负数都按 0 处理。 */
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/** 一次性大额：育儿按孩子数计，加上健康与重大投入。 */
export function oneOffCost(input) {
  const children = Math.round(positive(input.children));
  return children * positive(input.childUnitCost) + positive(input.health) + positive(input.major);
}

/**
 * 按月推演：当月先算理财收益，再进工资（工作年限内，按年增长率涨），
 * 减掉生活费（按通胀涨），工作年限最后一个月再扣一次性大额。
 * 资产掉到 0 以下那个月就是花完的时点，按当月比例折算成年。
 * workEnd 是工作结束那个月扣掉大额之前手上有多少钱，用来判断够不够付专项支出。
 */
export function simulate(input) {
  const monthlySpend = positive(input.monthlyPerPerson) * personsOf(input.identity);
  const monthlyRate = Number(input.rate) / 100 / 12;
  const inflation = Number(input.inflation) / 100;
  const growth = Number(input.salaryGrowth) / 100;
  const salary = positive(input.salary);
  const workYears = Math.min(Math.round(positive(input.workYears)), MAX_YEARS);
  const workMonths = workYears * 12;
  const oneOff = oneOffCost(input);
  const start = positive(input.initialAssets);
  const summary = { start, oneOff, monthlySpend, workYears, years: Infinity, workEnd: null, shortfall: null };

  // 工资归零、又没有初始资产和收入时，等于起点就已经见底
  if (start <= 0 && salary <= 0 && monthlySpend > 0) return { ...summary, years: 0, shortfall: oneOff };

  const chargeMonth = Math.max(1, workMonths);
  let assets = start;
  let workEnd = null;
  for (let month = 1; month <= MAX_YEARS * 12; month += 1) {
    const year = Math.floor((month - 1) / 12);
    const before = assets;
    const income = month <= workMonths ? salary * Math.pow(1 + growth, year) : 0;
    assets = before * (1 + monthlyRate) + income - monthlySpend * Math.pow(1 + inflation, year);
    if (month === chargeMonth) {
      workEnd = assets;
      assets -= oneOff;
    }
    if (assets <= 0) {
      const share = before > 0 ? before / (before - assets) : 1;
      const months = month - 1 + Math.min(1, Math.max(0, share));
      return { ...summary, years: months / 12, workEnd, shortfall: gap(workEnd, oneOff) };
    }
  }
  return { ...summary, workEnd, shortfall: gap(workEnd, oneOff) };
}

/** 工作时攒下的钱够不够付专项支出：不够就给出还差多少，够则为 0。 */
function gap(workEnd, oneOff) {
  if (workEnd === null) return null;
  return Math.max(0, oneOff - workEnd);
}

/** 目标年数：非有限数或非正数按「花不完」处理，最长 MAX_YEARS。 */
function targetYears(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(number, MAX_YEARS) : MAX_YEARS;
}

/**
 * 反推单项：求出让钱刚好撑到目标年数时这一项的取值。
 * 支出类越大越早花完，取满足条件的最大值；工资与年数相反，取最小值。
 */
export function solve(input, target, key) {
  const spec = SOLVERS[key];
  if (!spec) return { value: Number.NaN, feasible: false };
  if (key === "workYears") return solveWorkYears(input, target);

  const field = FIELDS[key];
  const want = targetYears(target);
  const lasts = (value) => simulate({ ...input, [field]: value }).years;
  const low = spec.up;

  if (low) {
    if (lasts(0) >= want) return { value: 0, feasible: true };
    if (lasts(spec.max) < want) return { value: Number.NaN, feasible: false };
  } else if (lasts(0) < want) {
    return { value: Number.NaN, feasible: false };
  }

  let ok = 0;
  let bad = spec.max;
  for (let step = 0; step < 64; step += 1) {
    const mid = (ok + bad) / 2;
    if (spec.up) {
      if (lasts(mid) >= want) bad = mid;
      else ok = mid;
    } else if (lasts(mid) >= want) {
      ok = mid;
    } else {
      bad = mid;
    }
  }
  return { value: spec.up ? bad : ok, feasible: true };
}

/** 反推月均工资：能让钱撑到目标年数的最小工资。 */
export function solveSalary(input, target) {
  return solve(input, target, "salary");
}

/** 反推工作时长：能让钱撑到目标年数的最短整数年，逐年试。 */
export function solveWorkYears(input, target) {
  const want = targetYears(target);
  for (let years = 0; years <= MAX_YEARS; years += 1) {
    if (simulate({ ...input, workYears: years }).years >= want) return { value: years, feasible: true };
  }
  return { value: Number.NaN, feasible: false };
}
