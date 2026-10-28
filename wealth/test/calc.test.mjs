// 计算逻辑的边界检查：用 Node 自带的 node:test，不引入任何测试依赖。
// 跑法：在 wealth/ 目录执行 `npm test`。
import assert from "node:assert/strict";
import test from "node:test";

import {
  CHILD_YEARS,
  DEFAULTS,
  childMonthShare,
  childStartYears,
  customItems,
  customTotal,
  healthTotal,
  houseTotal,
  isEnabled,
  personsOf,
} from "../src/core/calc.js";
import { formatPercent, formatWan } from "../src/core/format.js";

/** 12 ÷ 0.025 在浮点下是 479.99999999999994，金额一律按容差比较。 */
function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ""} 期望 ${expected}，实际 ${actual}`);
}

/** 数组按 JSON 比，省得写一串 assert.deepEqual。 */
function equalish(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
}

test("育儿按月摊开：22 年 264 个月加起来正好是每孩总成本", () => {
  let sum = 0;
  for (let month = 0; month < CHILD_YEARS * 12; month += 1) {
    sum += childMonthShare(100, month);
  }
  near(sum, 100, "22 年合计");
  assert.equal(childMonthShare(100, CHILD_YEARS * 12), 0, "超出 22 年不再摊");
  assert.equal(childMonthShare(100, -1), 0);
  // 婴幼儿期每月少于大学期间每月
  assert.ok(childMonthShare(100, 0) < childMonthShare(100, 21 * 12));
  assert.equal(childMonthShare(0, 0), 0);
});

test("每个孩子各有开始年份：按孩子数量截断或补齐", () => {
  assert.deepEqual(childStartYears({ children: 1, childStartYears: [5] }), [5]);
  assert.deepEqual(childStartYears({ children: 3, childStartYears: [1, 5] }), [1, 5, 2], "缺的补默认第 2 年");
  assert.deepEqual(childStartYears({ children: 1, childStartYears: [1, 5, 9] }), [1], "多的按数量截掉");
  assert.deepEqual(childStartYears({ children: 0, childStartYears: [3] }), []);
  assert.deepEqual(childStartYears({ children: 2, childStartYears: [0, -1] }), [2, 2], "0 与负数都算没填");
});

test("房子 = 首付 + 月供 × 12 × 年数，全款时只剩首付", () => {
  near(houseTotal({ houseDown: 120, houseMonthly: 1, houseYears: 20 }), 120 + 240);
  near(houseTotal({ houseDown: 300, houseMonthly: 0, houseYears: 25 }), 300);
  near(houseTotal({ houseDown: 300, houseMonthly: 1, houseYears: 0 }), 300);
  near(houseTotal({}), 0);
  near(houseTotal({ houseDown: -5, houseMonthly: -1, houseYears: -2 }), 0, "负数按 0");
});

test("默认参数本身算得出正数，育儿与房子的年份都在 1 起算的范围内", () => {
  assert.equal(DEFAULTS.children, DEFAULTS.childStartYears.length);
  assert.ok(DEFAULTS.childStartYears.every((year) => year >= 1));
  assert.ok(houseTotal(DEFAULTS) > 0);
  assert.ok(childMonthShare(DEFAULTS.childUnitCost, 0) > 0);
});

test("被移除的块不参与计算", () => {
  assert.equal(isEnabled(DEFAULTS, "house"), true);
  const removed = ["house", "children", "health"];
  assert.equal(isEnabled({ removed }, "house"), false);
  near(houseTotal({ ...DEFAULTS, removed }), 0);
  equalish(childStartYears({ ...DEFAULTS, removed }), []);
  near(healthTotal({ ...DEFAULTS, removed }), 0);
  near(healthTotal(DEFAULTS), 150);
});

test("自定义专项：数字归一，名字去掉空白，年份至少 1", () => {
  const items = customItems({
    custom: [
      { id: "a", name: " 装修 ", amount: 30, year: 5, monthly: 0.2, monthlyYear: 5, years: 3 },
      { id: "b", name: "", amount: -1, year: 0, monthly: 0, monthlyYear: 0, years: 0 },
    ],
  });
  assert.equal(items[0].name, "装修");
  assert.equal(items[0].year, 5);
  near(customTotal(items[0]), 30 + 0.2 * 12 * 3);
  assert.equal(items[1].amount, 0);
  assert.equal(items[1].year, 1, "年份填 0 按第 1 年算");
  near(customTotal(items[1]), 0);
});

test("未知身份按单人处理", () => {
  assert.equal(personsOf("couple"), 2);
  assert.equal(personsOf("single"), 1);
  assert.equal(personsOf("nobody"), 1);
});

test("金额与百分比按一位小数展示，无解显示占位符", () => {
  assert.equal(formatWan(480), "480");
  assert.equal(formatWan(479.99999999999994), "480");
  assert.equal(formatWan(1234.56), "1,234.6");
  assert.equal(formatWan(Number.NaN), "—");
  assert.equal(formatPercent(4.5), "4.5%");
  assert.equal(formatPercent(25), "25%");
});
