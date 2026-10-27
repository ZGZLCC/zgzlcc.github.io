import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_YEARS, oneOffCost, simulate, solve, solveSalary, solveWorkYears } from "../src/core/simulate.js";

/** 收益率、通胀、工资增长都设成 0 的干净场景，好手算结果。 */
function bare(overrides = {}) {
  return {
    identity: "single",
    monthlyPerPerson: 1,
    rate: 0,
    inflation: 0,
    children: 0,
    childUnitCost: 100,
    health: 0,
    major: 0,
    initialAssets: 0,
    salary: 0,
    salaryGrowth: 0,
    workYears: 0,
    targetYears: 20,
    ...overrides,
  };
}

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

test("一次性大额：育儿按孩子数计，再加上健康与重大投入", () => {
  assert.equal(oneOffCost(bare({ children: 2, childUnitCost: 50, health: 150, major: 300 })), 550);
  assert.equal(oneOffCost(bare()), 0);
});

test("没有收入时按每月生活费一直扣到 0", () => {
  // 120 万、每月 1 万、收益为零：正好 120 个月
  close(simulate(bare({ initialAssets: 120 })).years, 10);
  close(simulate(bare({ initialAssets: 120, salary: 0 })).years, 10);
});

test("钱够花时返回无穷大", () => {
  assert.equal(simulate(bare({ initialAssets: 1000, salary: 2, workYears: 40 })).years, Infinity);
});

test("生活费按通胀上涨，钱会花得更快", () => {
  const flat = simulate(bare({ initialAssets: 120 })).years;
  const inflated = simulate(bare({ initialAssets: 120, inflation: 2 })).years;
  assert.ok(inflated < flat, `${inflated} 应该小于 ${flat}`);
});

test("工资按年增长率上涨，涨得越快撑得越久", () => {
  const slow = simulate(bare({ initialAssets: 120, salary: 1.2, salaryGrowth: 0, workYears: 60 })).years;
  const fast = simulate(bare({ initialAssets: 120, salary: 1.2, salaryGrowth: 5, workYears: 60 })).years;
  assert.ok(fast > slow, `${fast} 应该大于 ${slow}`);
});

test("大额支出扣在工作年限结束那个月", () => {
  // 工作 2 年、工资刚好覆盖生活费，结束时一次扣掉 100 万
  const result = simulate(bare({ initialAssets: 100, salary: 1, workYears: 2, major: 100 }));
  close(result.oneOff, 100);
  assert.ok(result.years >= 1.9 && result.years <= 2, `第 ${result.years} 年`);
});

test("工作结束后不再有工资，资产开始减少", () => {
  const working = simulate(bare({ initialAssets: 0, salary: 3, workYears: 10 })).years;
  // 工作 10 年攒下 360 万，之后每月净花 1 万
  assert.ok(working > 10, `${working} 应该大于工作年限本身`);
});

test("反推工资：收益为零时可以手算出临界值", () => {
  // 120 万起步、每月花 1 万，要撑 20 年需要每月净收入 0.5 万
  const solved = solveSalary(bare({ initialAssets: 120, workYears: 40 }), 20);
  assert.equal(solved.feasible, true);
  close(solved.value, 0.5);
});

test("反推工资：不需要工资也能撑到目标年份时返回 0", () => {
  const solved = solveSalary(bare({ initialAssets: 120, workYears: 40 }), 5);
  assert.deepEqual(solved, { value: 0, feasible: true });
});

test("反推工资：目标远到再加薪也够不着时标记不可行", () => {
  const solved = solveSalary(bare({ initialAssets: 1, monthlyPerPerson: 100, workYears: 0 }), 100);
  assert.equal(solved.feasible, false);
  assert.ok(Number.isNaN(solved.value));
});

test("反推工作时长：每月净攒 1 万、之后每月净花 1 万", () => {
  // 攒 W 个月、再花 W 个月，20 年 = 240 个月 → 需要工作 10 年
  const solved = solveWorkYears(bare({ initialAssets: 0, salary: 2, workYears: 0 }), 20);
  assert.deepEqual(solved, { value: 10, feasible: true });
});

test("反推工作时长：目标年份超过上限时标记不可行", () => {
  const solved = solveWorkYears(bare({ initialAssets: 120, salary: 0 }), MAX_YEARS);
  assert.equal(solved.feasible, false);
});

test("工作结束时攒下的钱：扣一次性大额之前手上还剩多少", () => {
  // 起点 100 万，工资刚好覆盖生活费，工作 2 年后手上仍是 100 万
  const even = simulate(bare({ initialAssets: 100, salary: 1, workYears: 2, major: 0 }));
  close(even.workEnd, 100);
  assert.equal(even.shortfall, 0);

  const short = simulate(bare({ initialAssets: 10, salary: 1, workYears: 2, major: 100 }));
  close(short.workEnd, 10);
  close(short.shortfall, 90);
});

test("撑不到工作结束时没有可分配的资产", () => {
  const result = simulate(bare({ initialAssets: 5, monthlyPerPerson: 1, salary: 0, workYears: 3 }));
  assert.equal(result.workEnd, null);
  assert.equal(result.shortfall, null);
  close(result.years, 5 / 12);
});

test("反推支出：收益为零时可以手算出临界值", () => {
  // 120 万、每月花 1 万、工作 1 年后扣重大投入：撑 5 年要扣掉 60 万
  const solved = solve(bare({ initialAssets: 120, workYears: 1 }), 5, "major");
  assert.equal(solved.feasible, true);
  close(solved.value, 60);
});

test("反推生活费：起点 120 万要撑 20 年，每月最多花 0.5 万", () => {
  const solved = solve(bare({ initialAssets: 120 }), 20, "living");
  close(solved.value, 0.5);
});

test("反推支出：起点和工资都是 0 时无解", () => {
  const solved = solve(bare({ initialAssets: 0, salary: 0 }), 20, "health");
  assert.equal(solved.feasible, false);
  assert.ok(Number.isNaN(solved.value));
});

test("solve 与专用反推函数结果一致", () => {
  assert.deepEqual(solve(bare({ initialAssets: 120, workYears: 40 }), 20, "salary"), solveSalary(bare({ initialAssets: 120, workYears: 40 }), 20));
  assert.deepEqual(solve(bare({ initialAssets: 0, salary: 2, workYears: 0 }), 20, "workYears"), solveWorkYears(bare({ initialAssets: 0, salary: 2, workYears: 0 }), 20));
});

