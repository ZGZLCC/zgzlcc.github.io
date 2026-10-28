/**
 * 现金流模拟：只服务于「工资计算」板块。
 * 从初始资金出发逐月推演——先记理财收益，工作年限内加上工资（按年增长率涨），
 * 再扣生活费（按通胀涨）、育儿（22 年摊到每月）、房子的首付 / 月供，以及用户加的专项支出，
 * 得到工作结束那年手上有多少钱；医疗预留留到最后一次扣。
 *
 * 约定与 calc.js 一致：金额单位万元，比率是百分比数值，年数按整年算。
 */
import {
  childMonthShare,
  childStartYears,
  customItems,
  customName,
  customTotal,
  healthTotal,
  houseTotal,
  isEnabled,
  personsOf,
} from "./calc.js";

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
 * 房子整块被移除时一直是 0。
 */
export function houseCost(input, month) {
  if (!isEnabled(input, "house")) return 0;
  const downMonth = firstMonthOfYear(input.houseDownYear);
  const firstMonth = firstMonthOfYear(input.houseMonthlyYear);
  const months = Math.round(positive(input.houseYears)) * 12;
  let cost = 0;
  if (month === downMonth) cost += positive(input.houseDown);
  if (month >= firstMonth && month < firstMonth + months) cost += positive(input.houseMonthly);
  return cost;
}

/** 某一项自定义专项在第 month 个月的支出：一次性那笔 + 当期月付。 */
export function customCost(item, month) {
  const months = Math.round(positive(item.years)) * 12;
  const firstMonth = firstMonthOfYear(item.monthlyYear);
  let cost = 0;
  if (month === firstMonthOfYear(item.year)) cost += positive(item.amount);
  if (month >= firstMonth && month < firstMonth + months) cost += positive(item.monthly);
  return cost;
}

/**
 * 按月推演到工作结束：saved 是那时手上还剩多少。
 * 余额只在「一次性大额」（首付、自定义专项的一次性金额）那个月可以被打穿；被打穿之后的这段欠款
 * 记进 debts（每段都有开始月份、当时的负数余额、转正月份），可以有好几段。其他月份凭空转负说明
 * 这套收支撑不住，推演就地停下，记在 stopped（月份）与 stopBalance（那时的负数余额）里。
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
  const customs = customItems(input);
  // 一次性的大额支出（首付、自定义专项的一次性部分）：这些月份允许把余额打穿
  const oneTimeMonths = new Map();
  const hasDownPayment = isEnabled(input, "house") && positive(input.houseDown) > 0;
  if (hasDownPayment) {
    oneTimeMonths.set(firstMonthOfYear(input.houseDownYear), [
      { name: "首付", amount: positive(input.houseDown) },
    ]);
  }
  for (const item of customs) {
    if (positive(item.amount) <= 0) continue;
    const month = firstMonthOfYear(item.year);
    const causes = oneTimeMonths.get(month) ?? [];
    causes.push({ name: `「${customName(item)}」`, amount: positive(item.amount) });
    oneTimeMonths.set(month, causes);
  }

  let assets = start;
  let lowest = start;
  let lowestMonth = 0;
  let stopped = null;
  // 大额支出把钱打穿之后，余额为负的那几段都记下来：从哪个月开始、当时欠多少、哪个月转正
  const debts = [];
  let openDebt = null;
  let childSpent = 0;
  let houseSpent = 0;
  const customSpent = customs.map(() => 0);
  for (let month = 1; month <= months; month += 1) {
    const year = Math.floor((month - 1) / 12);
    let child = 0;
    for (const start of childStarts) child += childMonthShare(childUnitCost, month - 1 - start);
    const house = houseCost(input, month);
    let extra = 0;
    customs.forEach((item, index) => {
      const cost = customCost(item, month);
      customSpent[index] += cost;
      extra += cost;
    });
    childSpent += child;
    houseSpent += house;
    // 有欠款的时候不算收益：每月结余直接拿去还债，欠多少还多少，债本身也不生息
    const grown = assets > 0 ? assets * (1 + monthlyRate) : assets;
    assets = grown + salary - monthlySpend * Math.pow(1 + inflation, year) - child - house - extra;
    if (assets < lowest) {
      lowest = assets;
      lowestMonth = month;
    }
    const inDebt = openDebt !== null;
    if (assets < 0) {
      // 只有一次性大额（首付、自定义专项）那个月可以把余额打穿，之后算欠款、继续往下跑；
      // 其他月份凭空转负，说明这套收支撑不住，直接停
      if (!inDebt) {
        if (oneTimeMonths.has(month)) {
          openDebt = {
            start: month,
            startBalance: assets,
            end: null,
            causes: oneTimeMonths.get(month).map((cause) => ({ ...cause })),
          };
          debts.push(openDebt);
        } else { stopped = month; break; }
      }
    } else if (inDebt) {
      openDebt.end = month;
      openDebt = null;
    }
    // 走完一整年、进入下一年时调一次工资；两段都走完就不再涨。降薪最多降到 0
    if (month % 12 === 0) salary = Math.max(0, salary * (1 + (month / 12 <= earlyYears ? early : late)));
  }

  const childTotal = childStarts.length * childUnitCost;
  const houseAll = houseTotal(input);
  const health = healthTotal(input);
  // 到工作结束还没付完的部分：不打折、不计收益，只提示「还得继续付」，不在这里扣
  const childPending = Math.max(0, childTotal - childSpent);
  const housePending = Math.max(0, houseAll - houseSpent);
  const custom = customs.map((item, index) => {
    const total = customTotal(item);
    const spent = customSpent[index];
    return { name: customName(item), total, spent, pending: Math.max(0, total - spent) };
  });
  const customPending = custom.reduce((sum, item) => sum + item.pending, 0);
  const pending = childPending + housePending + customPending;
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
    custom,
    customPending,
    pending,
    health,
    saved,
    stopped,
    stopBalance: stopped === null ? 0 : assets,
    lowest,
    lowestMonth,
    debts,
    // 最后能攒下来的钱：工作结束时的余额，只预留医疗；没付完的育儿/房贷不在这里扣，交给「能撑多少年」按月继续扣
    left: saved - health,
  };
}

/**
 * 工作结束后这笔钱还能撑几个月：没有工资了，但生活费继续按通胀涨，
 * 育儿、房贷与自定义专项按各自的日程继续按月扣，余额按同一个年收益率增值。
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
  const customs = customItems(input);

  let balance = start;
  for (let month = workMonths + 1; month <= workMonths + MAX_YEARS * 12; month += 1) {
    const year = Math.floor((month - 1) / 12);
    let child = 0;
    for (const begin of childStarts) child += childMonthShare(childUnitCost, month - 1 - begin);
    let extra = 0;
    for (const item of customs) extra += customCost(item, month);
    balance = balance * (1 + monthlyRate)
      - monthlySpend * Math.pow(1 + inflation, year)
      - child
      - houseCost(input, month)
      - extra;
    if (balance < 0) return month - workMonths - 1;
  }
  return Infinity;
}
