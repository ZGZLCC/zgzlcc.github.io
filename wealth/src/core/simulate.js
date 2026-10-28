/**
 * 现金流模拟：只服务于「工资计算」板块。
 * 从初始资金出发逐月推演——先记理财收益，工作年限内加上工资（按年增长率涨），
 * 再扣生活费（按通胀涨）、育儿（22 年摊到每月）与房子的首付 / 月供，
 * 得到工作结束那年手上有多少钱；健康开销留到最后一次扣。
 *
 * 约定与 calc.js 一致：金额单位万元，比率是百分比数值，年数按整年算。
 */
import { childMonthShare, childStartYears, houseTotal, personsOf } from "./calc.js";

/** 最多看 100 年。 */
export const MAX_YEARS = 100;

/** 数值归一：非有限数与负数都按 0 处理。 */
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * 「工作第几年」换成第几个月（1 基）：界面上的年份从 1 数起，1 就是工作第一年的第一个月。
 * 填 0 或者空着都按第 1 年处理。
 */
function firstMonthOfYear(value) {
  return (Math.max(1, Math.round(positive(value))) - 1) * 12 + 1;
}

/**
 * 房子在第 month 个月（1 基）要花多少：首付在「首付年份」的第一个月一次付清，
 * 月供从「月供开始年份」的第一个月起按月付 houseYears 年（全款时月供为 0，就只有首付）。
 */
export function houseCost(input, month) {
  const downMonth = firstMonthOfYear(input.houseDownYear);
  const firstMonth = firstMonthOfYear(input.houseMonthlyYear);
  const months = Math.round(positive(input.houseYears)) * 12;
  let cost = 0;
  if (month === downMonth) cost += positive(input.houseDown);
  if (month >= firstMonth && month < firstMonth + months) cost += positive(input.houseMonthly);
  return cost;
}

/**
 * 按月推演到工作结束：saved 是那时手上还剩多少。
 * 余额只在「交首付」那个月可以被打穿（借钱付首付）；这段欠款记在 debtStart 与 debtEnd 里，
 * 一直跑到达成平衡（debtEnd 为空表示到最后都没转正）。其他月份凭空转负说明这套收支撑不住，
 * 推演就地停下，记在 stopped（月份）与 stopBalance（那时的负数余额）里。
 * 工资分两段涨：前 salaryGrowthYears 年涨 salaryGrowthEarly，接着 salaryGrowthLateYears 年涨
 * salaryGrowthLate（都允许为负，即降薪）；两段年数相加就是工作时长。
 *
 * 理财收益按月精确换算：月收益率 = (1 + 年收益率)^(1/12) − 1。
 *
 * 育儿与房贷可能到工作结束还没付完：spent 是真正扣进现金流的钱，剩下的按名义金额记在
 * pending 里，表示「这笔钱还得付，要从攒下的钱里留出来」；健康 health 也在结束时预留，
 * left 就是预留完这些之后真正剩下的。都不打折、不计收益，偏保守。
 */
export function accumulate(input) {
  const monthlySpend = positive(input.monthlyPerPerson) * personsOf(input.identity);
  // 月收益率按 (1 + 年收益率)^(1/12) − 1 精确换算，12 个月复利正好等于年收益率
  const annualRate = Number.isFinite(Number(input.rate)) ? Number(input.rate) / 100 : 0;
  const monthlyRate = annualRate > -1 ? Math.pow(1 + annualRate, 1 / 12) - 1 : -1;
  const inflation = Number(input.inflation) / 100;
  // 两段工资增长率都可以为负，表示降薪
  const early = Number.isFinite(Number(input.salaryGrowthEarly)) ? Number(input.salaryGrowthEarly) / 100 : 0;
  const late = Number.isFinite(Number(input.salaryGrowthLate)) ? Number(input.salaryGrowthLate) / 100 : 0;
  const earlyYears = Math.min(Math.round(positive(input.salaryGrowthYears)), MAX_YEARS);
  const lateYears = Math.min(Math.round(positive(input.salaryGrowthLateYears)), MAX_YEARS);
  // 输入填的是年均工资，逐月推演时折成月薪
  let salary = positive(input.annualSalary) / 12;
  const workYears = earlyYears + lateYears;
  const start = positive(input.initialAssets);
  const months = workYears * 12;
  // 每个孩子各有自己的 22 年窗口：把开始年份换成窗口起点（0 基月份）
  const childStarts = childStartYears(input).map((year) => firstMonthOfYear(year) - 1);
  const childUnitCost = positive(input.childUnitCost);

  let assets = start;
  let lowest = start;
  let lowestMonth = 0;
  let stopped = null;
  // 首付把钱打穿之后，余额为负的这一段记下来：从哪个月开始、哪个月转正
  let debtStart = null;
  let debtStartBalance = 0;
  let debtEnd = null;
  let childSpent = 0;
  let houseSpent = 0;
  const downMonth = firstMonthOfYear(input.houseDownYear);
  const hasDownPayment = positive(input.houseDown) > 0;
  for (let month = 1; month <= months; month += 1) {
    const year = Math.floor((month - 1) / 12);
    let child = 0;
    for (const start of childStarts) child += childMonthShare(childUnitCost, month - 1 - start);
    const house = houseCost(input, month);
    childSpent += child;
    houseSpent += house;
    assets = assets * (1 + monthlyRate) + salary - monthlySpend * Math.pow(1 + inflation, year) - child - house;
    if (assets < lowest) {
      lowest = assets;
      lowestMonth = month;
    }
    const inDebt = debtStart !== null && debtEnd === null;
    if (assets < 0) {
      // 只有交首付那个月可以把余额打穿（借钱付首付），之后算欠款、继续往下跑；
      // 其他月份凭空转负，说明这套收支撑不住，直接停
      if (!inDebt) {
        if (hasDownPayment && month === downMonth) {
          debtStart = month;
          debtStartBalance = assets;
        } else { stopped = month; break; }
      }
    } else if (inDebt) {
      debtEnd = month;
    }
    // 走完一整年、进入下一年时调一次工资；两段都走完就不再涨。降薪最多降到 0
    if (month % 12 === 0) salary = Math.max(0, salary * (1 + (month / 12 <= earlyYears ? early : late)));
  }

  const childTotal = childStarts.length * childUnitCost;
  const houseAll = houseTotal(input);
  const health = positive(input.health);
  // 到工作结束还没付完的部分：不打折、不计收益，直接当作要从这笔钱里留出来
  const childPending = Math.max(0, childTotal - childSpent);
  const housePending = Math.max(0, houseAll - houseSpent);
  const pending = childPending + housePending;
  const saved = stopped !== null ? 0 : Math.max(0, assets);
  // 工作结束后每月生活费的水平：最后一年再按通胀涨一次，往后就照这个基数继续涨
  const monthlySpendAfterWork = monthlySpend * Math.pow(1 + inflation, workYears);

  return {
    start,
    workYears,
    monthlySpend,
    monthlySpendAfterWork,
    childTotal,
    childSpent,
    childPending,
    houseTotal: houseAll,
    houseSpent,
    housePending,
    pending,
    health,
    saved,
    stopped,
    stopBalance: stopped === null ? 0 : assets,
    lowest,
    lowestMonth,
    debtStart,
    debtStartBalance,
    debtEnd,
    // 最后能攒下来的钱：工作结束时的余额，只预留医疗；没付完的育儿/房贷不在这里扣，交给「能撑多少年」按月继续扣
    left: saved - health,
  };
}

/**
 * 工作结束后这笔钱还能撑几个月：没有工资了，但生活费继续按通胀涨，
 * 育儿与房贷按各自的日程继续按月扣，余额按同一个年收益率增值。
 * 撑过 MAX_YEARS 还没见底就返回 Infinity（花不完）。
 */
export function runwayMonths(input, amount) {
  const start = Number(amount);
  if (!Number.isFinite(start) || start <= 0) return 0;
  const monthlySpend = positive(input.monthlyPerPerson) * personsOf(input.identity);
  const rate = Number(input.rate) / 100;
  const monthlyRate = rate > -1 ? Math.pow(1 + rate, 1 / 12) - 1 : -1;
  const inflation = Number.isFinite(Number(input.inflation)) ? Number(input.inflation) / 100 : 0;
  const earlyYears = Math.min(Math.round(positive(input.salaryGrowthYears)), MAX_YEARS);
  const lateYears = Math.min(Math.round(positive(input.salaryGrowthLateYears)), MAX_YEARS);
  const workMonths = (earlyYears + lateYears) * 12;
  const childStarts = childStartYears(input).map((year) => firstMonthOfYear(year) - 1);
  const childUnitCost = positive(input.childUnitCost);

  let balance = start;
  for (let month = workMonths + 1; month <= workMonths + MAX_YEARS * 12; month += 1) {
    const year = Math.floor((month - 1) / 12);
    let child = 0;
    for (const begin of childStarts) child += childMonthShare(childUnitCost, month - 1 - begin);
    balance = balance * (1 + monthlyRate) - monthlySpend * Math.pow(1 + inflation, year) - child - houseCost(input, month);
    if (balance < 0) return month - workMonths - 1;
  }
  return Infinity;
}
