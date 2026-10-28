// 结果卡文案的边界检查：纯函数拼字符串，直接喂参数断言关键说法。
import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULTS } from "../src/core/calc.js";
import { renderRunway, renderSalary } from "../src/render.js";

/** 去掉标签，方便按文字断言。 */
function text(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

test("默认参数：大数字是扣掉医疗预留之后的净额", () => {
  const html = renderSalary({ ...DEFAULTS });
  assert.match(text(html), /工作 30 年后能攒下/);
  assert.match(text(html), /1,075\.9/);
  assert.match(text(html), /预留 150 万用于医疗等方面/);
});

test("首付把余额打穿时不中断，说明负值什么时候出现、什么时候结束", () => {
  const html = text(renderSalary({ ...DEFAULTS, houseDownYear: 6, houseMonthlyYear: 6 }));
  assert.doesNotMatch(html, /推演停在这里/);
  assert.match(html, /付首付时余额掉到 -15\.5 万/);
  assert.match(html, /才回到正数/);
});

test("不是首付的日子余额转负，才提示停在这里", () => {
  // 生活费高到第 1 个月就兜不住：没有首付可以背锅，直接停
  const html = text(renderSalary({ ...DEFAULTS, monthlyPerPerson: 30, initialAssets: 0 }));
  assert.match(html, /推演停在这里/);
  assert.match(html, /工资撑不住生活费与育儿/);
});

test("首付透支后一直没补回来，说清欠到最后", () => {
  const html = text(renderSalary({ ...DEFAULTS, salaryGrowthEarly: 0, salaryGrowthLate: 0 }));
  assert.match(html, /一直没回到正数/);
  assert.match(html, /仍在欠钱/);
});

test("工资增长率为 0 时有单独的说法", () => {
  const caption = text(renderSalary({ ...DEFAULTS, salaryGrowthEarly: 0, salaryGrowthLate: 0 }));
  assert.match(caption, /工资一直不变/);
  // 只有一段不涨时，也只写那一段
  const half = text(renderSalary({ ...DEFAULTS, salaryGrowthLate: 0 }));
  assert.match(half, /前 10 年每年涨 8%，接着 20 年工资不变/);
});

test("「能撑多少年」卡片：撑不住时给 0，撑得下去时只写「永远」", () => {
  const forever = text(renderRunway({ ...DEFAULTS }));
  assert.match(forever, /这笔钱能撑 永远 /);
  assert.doesNotMatch(forever, /撑得下去/);
  const broke = text(renderRunway({ ...DEFAULTS, health: 5000 }));
  assert.match(broke, /0 /);
  assert.match(broke, /没有剩下的钱/);
});

test("「能撑多少年」卡片：收益跑不过通胀时给出具体年数", () => {
  const html = text(renderRunway({ ...DEFAULTS, rate: 0.5, annualSalary: 60 }));
  assert.match(html, /\d+(\.\d)? 年/);
  assert.doesNotMatch(html, /一直/);
  assert.match(html, /年收益 0\.5%/);
});

test("后期增长率为负时用「每年降」的说法", () => {
  const caption = text(renderSalary({ ...DEFAULTS, salaryGrowthLate: -3 }));
  assert.match(caption, /接着 20 年每年降 3%/);
});

test("后期年数为 0 时不再出现「接着 0 年」", () => {
  const caption = text(renderSalary({ ...DEFAULTS, salaryGrowthLateYears: 0 }));
  assert.doesNotMatch(caption, /接着/);
  assert.doesNotMatch(caption, /0 年每年涨/);
  assert.match(caption, /每年涨 8%/);
  assert.match(caption, /工作 10 年/);
});

test("前期年数为 0 时整段都按后期增长率说", () => {
  const caption = text(renderSalary({ ...DEFAULTS, salaryGrowthYears: 0, salaryGrowthLateYears: 12 }));
  assert.match(caption, /每年涨 3%/);
  assert.match(caption, /工作 12 年/);
  assert.doesNotMatch(caption, /接着/);
});

test("工作时长为 0 时换成不依赖工资的说法", () => {
  const caption = text(renderSalary({
    ...DEFAULTS,
    salaryGrowthYears: 0,
    salaryGrowthLateYears: 0,
    initialAssets: 30,
  }));
  assert.match(caption, /按现在的设置能攒下/);
  assert.match(caption, /工作时长是 0 年/);
  assert.match(caption, /初始资金 30 万/);
  assert.doesNotMatch(caption, /每月生活费/);
});

test("育儿或房贷没付完时，提示还有多少要继续付（不从大数字里扣）", () => {
  const html = text(renderSalary({ ...DEFAULTS, houseYears: 40 }));
  assert.match(html, /另外还有 .* 万育儿 \/ 房贷要在工作结束后继续按月付/);
  // 大数字只受医疗预留影响：1,225.9 − 150
  assert.match(html, /1,075\.9/);
});
