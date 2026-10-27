// 计算逻辑的边界检查：用 Node 自带的 node:test，不引入任何测试依赖。
// 跑法：在 wealth/ 目录执行 `npm test`。
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULTS,
  computeAllocation,
  computeNeed,
  personsOf,
  validate,
} from "../src/core/calc.js";
import { formatPercent, formatWan } from "../src/core/format.js";

/** 12 ÷ 0.025 在浮点下是 479.99999999999994，金额一律按容差比较。 */
function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ""} 期望 ${expected}，实际 ${actual}`);
}

const base = { ...DEFAULTS };

test("默认参数是夫妻，需要 1,030 万", () => {
  const need = computeNeed(base);
  near(need.parts.living, 480, "生活本金");
  near(need.parts.children, 100);
  near(need.parts.health, 150);
  near(need.parts.major, 300);
  near(need.total, 1030);
  assert.equal(need.persons, 2);
  near(need.monthly, 1);
});

test("单人只算一个人的生活本金", () => {
  const need = computeNeed({ ...base, identity: "single" });
  assert.equal(need.persons, 1);
  near(need.monthly, 0.5);
  near(need.parts.living, 240);
  near(need.total, 790);
});

test("孩子数量取整后再乘单位成本", () => {
  near(computeNeed({ ...base, children: 2 }).parts.children, 200);
  near(computeNeed({ ...base, children: 2.6 }).parts.children, 300);
  near(computeNeed({ ...base, children: -1 }).parts.children, 0);
  near(computeNeed({ ...base, children: 1, childUnitCost: 80 }).parts.children, 80);
});

test("空输入按 0 处理，不会得到 NaN 总额", () => {
  const need = computeNeed({ ...base, monthlyPerPerson: Number.NaN, health: Number.NaN });
  near(need.parts.living, 0);
  near(need.parts.health, 0);
  near(need.total, 400);
});

test("收益率不高于通胀率时生活本金无解，并给出中文提示", () => {
  const need = computeNeed({ ...base, rate: 2, inflation: 2 });
  assert.equal(need.parts.living, Infinity);
  assert.deepEqual(validate({ ...base, rate: 2, inflation: 2 }), [
    "年收益率需要高于通货膨胀率，否则本金涨不过物价。",
  ]);
});

test("反推默认只放开重大投入：1000 − (480 + 100 + 150) = 270", () => {
  const allocation = computeAllocation(base, DEFAULTS.targets);
  near(allocation.fixedTotal, 730);
  near(allocation.free, 270);
  assert.deepEqual(
    allocation.fixed.map((item) => item.id),
    ["living", "children", "health"],
  );
});

test("四项全勾时没有固定支出，可分配等于总资产", () => {
  const all = ["living", "children", "health", "major"];
  const allocation = computeAllocation({ ...base, totalAssets: 800 }, all);
  near(allocation.fixedTotal, 0);
  near(allocation.free, 800);
  assert.equal(allocation.fixed.length, 0);
});

test("反推生活开支时不再要求收益率高于通胀率", () => {
  const input = { ...base, rate: 2, inflation: 2, totalAssets: 1000 };
  const allocation = computeAllocation(input, ["living"]);
  near(allocation.fixedTotal, 550);
  near(allocation.free, 450);
  assert.deepEqual(validate(input, ["living"]), []);
});

test("总资产不够覆盖固定项时，可分配为负数", () => {
  const allocation = computeAllocation({ ...base, totalAssets: 100 }, DEFAULTS.targets);
  near(allocation.free, -630);
});

test("反推缺少目标或总资产时给出提示", () => {
  assert.deepEqual(validate(base, []), ["至少勾选一项要反推的支出。"]);
  assert.ok(validate({ ...base, totalAssets: Number.NaN }, ["major"]).includes("现有总资产要填一个不小于 0 的数字。"));
  assert.ok(validate({ ...base, totalAssets: -1 }, ["major"]).includes("现有总资产要填一个不小于 0 的数字。"));
});

test("负数项逐个报错", () => {
  const errors = validate({ ...base, monthlyPerPerson: -1, health: -500, major: -1, children: -2 });
  assert.ok(errors.includes("人均月消费不能是负数。"));
  assert.ok(errors.includes("健康开销不能是负数。"));
  assert.ok(errors.includes("重大投入不能是负数。"));
  assert.ok(errors.includes("孩子数量不能是负数。"));
});

test("默认参数本身可以通过校验", () => {
  assert.deepEqual(validate(base), []);
  assert.deepEqual(validate(base, DEFAULTS.targets), []);
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
