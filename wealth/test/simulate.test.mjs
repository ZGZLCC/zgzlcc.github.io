import assert from "node:assert/strict";
import { test } from "node:test";

import { accumulate, houseCost, runwayMonths } from "../src/core/simulate.js";

/** 收益率、通胀、工资增长、育儿与房子都归零的干净场景，好手算结果；工时用 workYears 一次写清。 */
function bare(overrides = {}) {
  const { workYears = 0, ...rest } = overrides;
  return {
    identity: "single",
    monthlyPerPerson: 1,
    rate: 0,
    inflation: 0,
    children: 0,
    childUnitCost: 100,
    childStartYears: [1],
    health: 0,
    houseDown: 0,
    houseDownYear: 0,
    houseMonthly: 0,
    houseMonthlyYear: 0,
    houseYears: 0,
    initialAssets: 0,
    annualSalary: 0,
    salaryGrowthYears: workYears,
    salaryGrowthEarly: 0,
    salaryGrowthLateYears: 0,
    salaryGrowthLate: 0,
    ...rest,
  };
}

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

test("工资刚好覆盖生活费时，攒下的就是初始资金", () => {
  const run = accumulate(bare({ initialAssets: 100, annualSalary: 12, workYears: 2 }));
  close(run.saved, 100);
  close(run.left, 100);
  assert.equal(run.stopped, null);
});

test("每月净攒 1 万，工作 10 年攒下 120 万", () => {
  const run = accumulate(bare({ initialAssets: 0, annualSalary: 24, workYears: 10 }));
  close(run.saved, 120);
});

test("工资不够生活费时余额转负，推演就地停下", () => {
  const run = accumulate(bare({ initialAssets: 120, annualSalary: 0, workYears: 20 }));
  // 每月花 1 万：第 120 个月正好花到 0，第 121 个月转负，停
  assert.equal(run.stopped, 121);
  close(run.stopBalance, -1);
  close(run.saved, 0);
  close(run.left, 0);
});

test("生活费按通胀上涨，攒得更少", () => {
  const flat = accumulate(bare({ annualSalary: 24, workYears: 10 })).saved;
  const inflated = accumulate(bare({ annualSalary: 24, workYears: 10, inflation: 2 })).saved;
  assert.ok(inflated < flat, `${inflated} 应该小于 ${flat}`);
});

test("工资按年增长率上涨，攒得更多", () => {
  const flat = accumulate(bare({ annualSalary: 24, workYears: 20 })).saved;
  const grown = accumulate(bare({ annualSalary: 24, workYears: 20, salaryGrowthEarly: 5 })).saved;
  assert.ok(grown > flat, `${grown} 应该大于 ${flat}`);
});

test("两段式增长：前 5 年每年涨 10%，后 15 年不涨", () => {
  // 月薪 1 万：第 1–6 年分别是 1、1.1、1.21、1.331、1.4641、1.61051 万，之后不再变
  const run = accumulate(bare({
    annualSalary: 12,
    monthlyPerPerson: 0,
    salaryGrowthYears: 5,
    salaryGrowthEarly: 10,
    salaryGrowthLateYears: 15,
    salaryGrowthLate: 0,
  }));
  close(run.saved, 12 * (7.71561 + 14 * 1.61051));
  assert.equal(run.workYears, 20);
});

test("同样是 5 年涨 10%，早涨比晚涨攒得多", () => {
  const base = { annualSalary: 12, monthlyPerPerson: 0, salaryGrowthYears: 5, salaryGrowthLateYears: 5 };
  const early = accumulate(bare({ ...base, salaryGrowthEarly: 10, salaryGrowthLate: 0 })).saved;
  const late = accumulate(bare({ ...base, salaryGrowthEarly: 0, salaryGrowthLate: 10 })).saved;
  assert.ok(early > late, `早涨（${early}）应该多于晚涨（${late}）`);
});

test("工作时长就是两段年数之和", () => {
  assert.equal(accumulate(bare({ salaryGrowthYears: 7, salaryGrowthLateYears: 23 })).workYears, 30);
});

test("理财收益按月精确换算：年化 12% 放满 12 个月正好 ×1.12", () => {
  const run = accumulate(bare({ initialAssets: 100, monthlyPerPerson: 0, workYears: 1, rate: 12 }));
  close(run.saved, 112);
});

test("后期工资增长率可以是负数：每年降 8%，攒得比不降少", () => {
  const base = { annualSalary: 36, monthlyPerPerson: 0, salaryGrowthYears: 0, salaryGrowthLateYears: 10 };
  const flat = accumulate(bare({ ...base, salaryGrowthLate: 0 })).saved;
  const cut = accumulate(bare({ ...base, salaryGrowthLate: -8 })).saved;
  assert.ok(cut < flat, `降薪（${cut}）应该少于不变（${flat}）`);
  // 月薪 3 万起、每年降 8%，10 年总收入远小于 36 × 10 = 360 万
  assert.ok(cut < 300, `降薪 10 年攒下 ${cut}，应该明显小于 360`);
});

test("降薪最多降到 0，不会出现负工资", () => {
  const run = accumulate(bare({ annualSalary: 12, monthlyPerPerson: 0, salaryGrowthYears: 1, salaryGrowthEarly: -100, salaryGrowthLateYears: 4 }));
  assert.equal(run.stopped, null);
  close(run.saved, 12, "只有第 1 年的工资");
});

test("育儿按月从现金流里扣，22 年正好扣完一孩总成本", () => {
  const run = accumulate(bare({ initialAssets: 200, monthlyPerPerson: 0, workYears: 22, children: 1, childUnitCost: 100 }));
  close(run.childSpent, 100);
  close(run.saved, 100);
  close(run.pending, 0);
});

test("育儿只扣到工作结束，没摊完的部分记在 childPending 里", () => {
  const run = accumulate(bare({
    initialAssets: 200,
    monthlyPerPerson: 0,
    workYears: 5,
    children: 1,
    childUnitCost: 100,
    childStartYears: [2],
  }));
  // 第 2 年开始摊，工作结束前只走到育儿期的前 4 年：0.6 × 3 年 + 1.0 × 1 年
  close(run.childSpent, (100 * (0.6 * 3 + 1)) / 23.8);
  close(run.childPending, 100 - run.childSpent);
  close(run.saved, 200 - run.childSpent);
});

test("育儿开始年份决定哪几个月扣钱，年份从 1 数起", () => {
  const run = accumulate(bare({ initialAssets: 200, monthlyPerPerson: 0, workYears: 5, children: 1, childStartYears: [5] }));
  // 第 5 年才开始摊，只剩育儿期第 1 年那 12 个月
  close(run.childSpent, (100 * 0.6) / 23.8);
  const late = accumulate(bare({ initialAssets: 200, monthlyPerPerson: 0, workYears: 5, children: 1, childStartYears: [6] }));
  close(late.childSpent, 0);
  close(late.childPending, 100);
});

test("两个孩子各按自己的开始年份摊，互不影响", () => {
  const run = accumulate(bare({ initialAssets: 500, monthlyPerPerson: 0, workYears: 3, children: 2, childStartYears: [1, 3] }));
  // 第一个孩子摊了满 3 年（0.6 × 3），第二个刚满 1 年（0.6）
  close(run.childSpent, (100 * (0.6 * 3 + 0.6)) / 23.8);
  close(run.childTotal, 200);
  close(run.pending, 200 - run.childSpent);
});

test("房子先扣首付，再按月扣月供", () => {
  const run = accumulate(bare({
    initialAssets: 300,
    monthlyPerPerson: 0,
    workYears: 10,
    houseDown: 90,
    houseDownYear: 0,
    houseMonthly: 1,
    houseMonthlyYear: 0,
    houseYears: 10,
  }));
  close(run.houseSpent, 90 + 120);
  close(run.saved, 90);
  close(run.houseTotal, 210);
});

test("全款：月供填 0 时只扣首付", () => {
  const run = accumulate(bare({ initialAssets: 400, monthlyPerPerson: 0, workYears: 5, houseDown: 300, houseYears: 0 }));
  close(run.houseSpent, 300);
  close(run.saved, 100);
});

test("首付与月供各按自己的年份开始扣", () => {
  const run = accumulate(bare({
    initialAssets: 100,
    monthlyPerPerson: 0,
    workYears: 2,
    houseDown: 50,
    houseDownYear: 1,
    houseMonthly: 1,
    houseMonthlyYear: 2,
    houseYears: 10,
  }));
  // 第 1 年付首付 50 万；月供第 2 年才开始，工作上两年只付了 12 个月
  close(run.houseSpent, 50 + 12);
  close(run.housePending, 1 * 12 * 10 - 12);
});

test("houseCost 按月份给出现金流出：首付单独一月，月供按月", () => {
  const input = { houseDown: 90, houseDownYear: 1, houseMonthly: 1, houseMonthlyYear: 2, houseYears: 2 };
  close(houseCost(input, 1), 90);
  close(houseCost(input, 2), 0);
  close(houseCost(input, 12), 0);
  close(houseCost(input, 13), 1);
  close(houseCost(input, 12 + 24), 1);
  close(houseCost(input, 12 + 25), 0);
});

test("健康开销在工作结束时预留，left 是预留之后的余额", () => {
  const run = accumulate(bare({ initialAssets: 120, monthlyPerPerson: 0, workYears: 10, health: 50 }));
  close(run.saved, 120);
  close(run.pending, 0);
  close(run.left, 70);
  assert.equal(run.stopped, null);
});

test("最后剩下的钱 = 余额 − 医疗预留；没付完的育儿/房贷只统计、不在这里扣", () => {
  // 工作 5 年，育儿从第 2 年开始只摊了 4 年，房贷月供付了 3 年（第 3–5 年）
  const run = accumulate(bare({
    initialAssets: 0,
    monthlyPerPerson: 0,
    annualSalary: 24,
    workYears: 5,
    children: 1,
    childUnitCost: 100,
    childStartYears: [2],
    houseDown: 0,
    houseMonthly: 1,
    houseMonthlyYear: 3,
    houseYears: 10,
    health: 20,
  }));
  close(run.houseSpent, 36, "第 3–5 年共 36 个月月供");
  close(run.saved, 120 - run.childSpent - run.houseSpent, "余额 = 工资 120 − 已扣的育儿与月供");
  close(run.pending, run.childPending + run.housePending);
  close(run.left, run.saved - run.health, "只扣医疗预留");
  assert.ok(run.pending > 0, "育儿与房贷都该有没付完的部分");
});

test("首付那个月允许透支，下个月补回来就继续跑", () => {
  const run = accumulate(bare({
    initialAssets: 0,
    monthlyPerPerson: 0,
    annualSalary: 240, // 月薪 20 万
    workYears: 2,
    houseDown: 25,
    houseDownYear: 1,
    houseYears: 0,
  }));
  // 第 1 个月：20 − 25 = −5（首付月，允许）；第 2 个月 +20 → 15，转正
  assert.equal(run.stopped, null);
  close(run.saved, 24 * 20 - 25, "24 个月工资 480 万，减掉 25 万首付");
  close(run.lowest, -5);});

test("首付打穿余额不算失败，记下欠款从哪个月开始、哪个月转正", () => {
  const run = accumulate(bare({
    initialAssets: 0,
    monthlyPerPerson: 0,
    annualSalary: 24, // 月薪 2 万
    workYears: 10,
    houseDown: 40,
    houseDownYear: 1,
    houseYears: 0,
  }));
  assert.equal(run.stopped, null);
  assert.equal(run.debts.length, 1);
  close(run.debts[0].start, 1);
  close(run.debts[0].startBalance, -38, "第 1 个月 2 − 40");
  assert.equal(run.debts[0].end, 20, "每月补 2 万，第 20 个月回到 0");
  close(run.saved, 120 * 2 - 40);
});

test("首付之后一直补不回来：不中断，但欠款没有结束月", () => {
  const run = accumulate(bare({
    initialAssets: 0,
    monthlyPerPerson: 1, // 月薪 1 万刚好月光，缺口一直还不完
    annualSalary: 12,
    workYears: 5,
    houseDown: 40,
    houseDownYear: 1,
    houseYears: 0,
  }));
  assert.equal(run.stopped, null);
  assert.equal(run.debts.length, 1);
  close(run.debts[0].start, 1);
  assert.equal(run.debts[0].end, null);
  close(run.saved, 0);
});

test("runwayMonths：没有收益、没有育儿房贷时，能撑的月数就是本金 ÷ 月开销", () => {
  const state = bare({ workYears: 10, monthlyPerPerson: 1, rate: 0, inflation: 0 });
  close(runwayMonths(state, 100), 100);
  close(runwayMonths(state, 0), 0);
  close(runwayMonths(state, -5), 0);
});

test("runwayMonths：收益明显跑赢通胀时花不完", () => {
  assert.equal(runwayMonths(bare({ workYears: 10, monthlyPerPerson: 1, rate: 5, inflation: 2 }), 1000), Infinity);
  assert.equal(runwayMonths(bare({ workYears: 10, monthlyPerPerson: 1, rate: 4.5, inflation: 2 }), 1000), Infinity);
});

test("runwayMonths：工作结束后还在付的育儿会缩短能撑的月数", () => {
  const base = { workYears: 30, monthlyPerPerson: 1, rate: 0, inflation: 0, childUnitCost: 100 };
  const none = runwayMonths(bare({ ...base, children: 0 }), 100);
  // 第 10 年开始摊育儿，22 年窗口要到第 32 年才结束，工作结束后的头两年还在付
  const later = runwayMonths(bare({ ...base, children: 1, childStartYears: [10] }), 100);
  assert.equal(none, 100);
  assert.ok(Number.isFinite(later) && later < none, `带育儿（${later}）应该比不带（${none}）短`);
});

test("runwayMonths：工作结束后还要还的房贷也算进去", () => {
  const input = bare({
    workYears: 30,
    monthlyPerPerson: 0,
    rate: 0,
    inflation: 0,
    houseMonthly: 1,
    houseMonthlyYear: 1,
    houseYears: 40,
  });
  close(runwayMonths(input, 100), 100, "每月 1 万月供，100 万正好撑 100 个月");
});

test("育儿与房贷都没付完时，钱不够 left 为负", () => {
  const run = accumulate(bare({
    initialAssets: 50,
    monthlyPerPerson: 0,
    workYears: 10,
    children: 1,
    childUnitCost: 100,
    houseDown: 90,
    houseMonthly: 1,
    houseMonthlyYear: 0,
    houseYears: 10,
    health: 20,
  }));
  assert.ok(run.left < 0, `left 应该为负，实际 ${run.left}`);
});

test("自定义专项：一次性那笔在指定年份扣，月付按年数扣", () => {
  const oneOff = accumulate(bare({
    monthlyPerPerson: 0,
    annualSalary: 24,
    workYears: 2,
    custom: [{ id: "c1", name: "装修", amount: 10, year: 1, monthly: 0, monthlyYear: 0, years: 0 }],
  }));
  close(oneOff.saved, 48 - 10);
  close(oneOff.custom[0].total, 10);
  close(oneOff.custom[0].spent, 10);
  assert.equal(oneOff.custom[0].name, "装修");

  const monthly = accumulate(bare({
    monthlyPerPerson: 0,
    annualSalary: 24,
    workYears: 3,
    custom: [{ id: "c1", name: "赡养", amount: 0, year: 1, monthly: 1, monthlyYear: 1, years: 2 }],
  }));
  close(monthly.saved, 72 - 24, "每月 1 万付 2 年 = 24 万");
});

test("自定义专项的大额支出也能把余额打穿，之后按欠款继续跑", () => {
  const run = accumulate(bare({
    monthlyPerPerson: 0,
    annualSalary: 24,
    workYears: 2,
    custom: [{ id: "c1", name: "装修", amount: 24, year: 1, monthly: 0, monthlyYear: 0, years: 0 }],
  }));
  // 第 1 个月：2 − 24 = −22（一次性那笔，允许）；之后每月 +2，第 12 个月转正
  assert.equal(run.stopped, null);
  assert.equal(run.debts.length, 1);
  close(run.debts[0].startBalance, -22);
  assert.equal(run.debts[0].end, 12);
  close(run.saved, 48 - 24);
});

test("两段欠款：第一段还清后又被打穿，第二段照样算欠款而不是停", () => {
  const run = accumulate(bare({
    monthlyPerPerson: 1,
    annualSalary: 24, // 月薪 2 万，扣掉生活费每月结余 1 万
    workYears: 10,
    houseDown: 20,
    houseDownYear: 1,
    houseYears: 0,
    custom: [{ id: "c1", name: "车", amount: 80, year: 6, monthly: 0, monthlyYear: 0, years: 0 }],
  }));
  // 第 1 个月首付把余额打到 −19（月薪 2 − 生活费 1 − 首付 20），第 20 个月还清；
  // 第 61 个月车钱 80 万再把余额打到 −39，之后每月补 1 万，第 100 个月还清
  assert.equal(run.debts.length, 2, "两段欠款都要记下来");
  close(run.debts[0].start, 1);
  assert.equal(run.debts[0].end, 20, "第一段第 20 个月还清");
  close(run.debts[1].start, 61);
  close(run.debts[1].startBalance, -39);
  assert.equal(run.debts[1].end, 100, "第二段第 100 个月还清，中间不该停");
  assert.equal(run.stopped, null);
  close(run.saved, 240 - 120 - 20 - 80, "工资 240 − 生活费 120 − 首付 20 − 车 80");
});

test("欠款期间不按收益率生息，靠每月结余往下还", () => {
  // 年收益 12% 也不该让欠款变大：第 1 个月 −22，之后每月 +2，第 12 个月正好还清
  const run = accumulate(bare({
    monthlyPerPerson: 0,
    annualSalary: 24,
    workYears: 5,
    rate: 12,
    custom: [{ id: "c1", name: "装修", amount: 24, year: 1, monthly: 0, monthlyYear: 0, years: 0 }],
  }));
  close(run.debts[0].startBalance, -22);
  assert.equal(run.debts[0].end, 12, "第 12 个月还清，没有被利息拖长");
  // 还清之后余额再开始吃收益：剩 48 个月，每月 +2，按月复利
  const monthlyRate = Math.pow(1.12, 1 / 12) - 1;
  close(run.saved, 2 * ((Math.pow(1 + monthlyRate, 48) - 1) / monthlyRate));
});

test("被移除的块不算钱：房子 / 育儿 / 健康都能删掉", () => {
  const run = accumulate(bare({
    workYears: 5,
    monthlyPerPerson: 0,
    annualSalary: 24,
    children: 1,
    childUnitCost: 100,
    houseDown: 90,
    houseMonthly: 1,
    houseMonthlyYear: 1,
    houseYears: 10,
    health: 20,
    removed: ["children", "house", "health"],
  }));
  close(run.saved, 120);
  close(run.pending, 0);
  close(run.left, 120, "医疗也移除了，所以不留医疗");
  close(run.health, 0);
});

test("runwayMonths：自定义专项的月付也会一直扣下去", () => {
  const input = bare({
    workYears: 30,
    monthlyPerPerson: 0,
    rate: 0,
    inflation: 0,
    custom: [{ id: "c1", name: "赡养", amount: 0, year: 1, monthly: 1, monthlyYear: 30, years: 20 }],
  });
  close(runwayMonths(input, 100), 100, "工作结束后每月还要付 1 万，100 万撑 100 个月");
});
