/**
 * Web 版核心逻辑检查：校验、重叠、周裁剪与分类汇总。
 * 用例沿用桌面版 Rust 测试的口径，便于两边结果对照。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../src/core/errors.ts";
import { validateEntry, parseEntry, parseEntries } from "../src/core/entry-validation.ts";
import { findOverlap, rangesOverlap } from "../src/core/overlap.ts";
import { aggregateTotals } from "../src/core/totals.ts";
import { assembleWeek, dayRange, weekRange } from "../src/core/week.ts";
import { dayStartMs } from "../src/day-range.ts";
import { isNewer, newEntryId } from "../src/core/timestamp.ts";

const HOUR = 3_600_000;

function entry(overrides = {}) {
  return {
    id: "e1",
    startMs: Date.UTC(2026, 8, 22, 1),
    endMs: Date.UTC(2026, 8, 22, 2),
    startDate: null,
    endDate: null,
    content: "写周报",
    tag: "work",
    state: "completed",
    updatedAt: 1000,
    deletedAt: null,
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    startMs: Date.UTC(2026, 8, 22, 1),
    endMs: Date.UTC(2026, 8, 22, 2),
    startDate: null,
    endDate: null,
    content: "会议",
    tag: "work",
    ...overrides,
  };
}

test("校验时去除首尾空白并按字符数限制 500 字", () => {
  assert.equal(validateEntry(input({ content: "\u3000会议\u3000" })).content, "会议");
  assert.throws(() => validateEntry(input({ content: "界".repeat(501) })), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, "validation");
    return true;
  });
  assert.equal(validateEntry(input({ content: "界".repeat(500) })).content.length, 500);
});

test("拒绝结束时间不晚于开始时间与无效标签", () => {
  const start = Date.UTC(2026, 8, 22, 1);
  assert.throws(() => validateEntry(input({ endMs: start })), /结束时间必须晚于开始时间/);
  assert.throws(() => validateEntry(input({ tag: "unknown" })), /请选择有效标签/);
  assert.throws(() => validateEntry(input({ id: "" })), /记录编号无效/);
});

test("完全空白的输入被拒绝，字段不全时保存为待补全", () => {
  assert.throws(
    () => validateEntry({ startMs: null, endMs: null, startDate: null, endDate: null, content: "", tag: null }),
    /请至少填写一项记录内容/,
  );
  assert.equal(validateEntry(input({ endMs: null })).state, "draft");
  assert.equal(validateEntry(input({ content: "" })).state, "draft");
  assert.equal(validateEntry(input({ tag: null })).state, "draft");
  assert.equal(validateEntry(input()).state, "completed");
});

test("无效日期字符串被拒绝", () => {
  assert.throws(() => validateEntry(input({ startDate: "2026-02-30" })), /开始日期无效/);
  assert.throws(() => validateEntry(input({ startDate: "26-02-03" })), /开始日期无效/);
  assert.equal(validateEntry(input({ startDate: "2026-02-28" })).startDate, "2026-02-28");
});

test("区间相交判定首尾相接不算重叠", () => {
  const base = { startMs: 10, endMs: 20 };
  assert.equal(rangesOverlap(base, { startMs: 20, endMs: 30 }), false);
  assert.equal(rangesOverlap(base, { startMs: 19, endMs: 30 }), true);
  assert.equal(rangesOverlap(base, { startMs: 5, endMs: 11 }), true);
});

test("重叠检查忽略草稿并按开始时间返回第一条冲突记录", () => {
  const early = entry({ id: "e3", startMs: 0, endMs: 4 });
  const later = entry({ id: "e4", startMs: 2, endMs: 6 });
  const draft = entry({ id: "e5", startMs: 0, endMs: 9, state: "draft" });
  assert.equal(findOverlap([draft, later, early], { startMs: 3, endMs: 5 })?.id, "e3");
});

test("编辑记录时排除自身", () => {
  const existing = entry({ id: "e7", startMs: 0, endMs: 10 });
  assert.equal(findOverlap([existing], { startMs: 1, endMs: 2 }, "e7"), null);
  assert.equal(findOverlap([existing], { startMs: 1, endMs: 2 })?.id, "e7");
});

test("已删除的记录不参与重叠判定", () => {
  const removed = entry({ id: "e8", startMs: 0, endMs: 10, updatedAt: 5, deletedAt: 5 });
  assert.equal(findOverlap([removed], { startMs: 1, endMs: 2 }), null);
});

test("周区间固定为北京时间周一 00:00 至下周一 00:00", () => {
  const range = weekRange("2026-09-23");
  assert.equal(range.startMs, Date.UTC(2026, 8, 20, 16));
  assert.equal(range.endMs - range.startMs, 7 * 24 * HOUR);
  assert.deepEqual(
    range.days.map((day) => day.date),
    ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"],
  );
});

test("周一与周日都归属同一周，跨年周正确跳转", () => {
  assert.equal(weekRange("2026-09-21").days[0].date, "2026-09-21");
  assert.equal(weekRange("2026-09-27").days[0].date, "2026-09-21");
  assert.equal(weekRange("2027-01-01").days[0].date, "2026-12-28");
  assert.equal(weekRange("2028-02-29").days[0].date, "2028-02-28");
  assert.throws(() => weekRange("2026-13-01"), /日期/);
});

test("跨午夜记录拆成逐日片段并各自裁剪", () => {
  const mondayStart = weekRange("2026-09-21").startMs;
  const crossing = entry({ id: "e11", startMs: mondayStart - HOUR, endMs: mondayStart + HOUR, tag: "sleep" });
  const week = assembleWeek("2026-09-21", [crossing]);
  assert.equal(week.days[0].segments.length, 1);
  assert.equal(week.days[0].segments[0].startMs, mondayStart);
  assert.equal(week.days[0].segments[0].endMs, mondayStart + HOUR);
  assert.equal(week.days[1].segments.length, 0);
  assert.equal(week.totals.sleepMs, HOUR);
  assert.equal(week.totals.totalMs, HOUR);
});

test("周视图排除草稿与已删除记录并按四类标签汇总", () => {
  const entries = [
    entry({ id: "e21", startMs: Date.UTC(2026, 8, 21, 1), endMs: Date.UTC(2026, 8, 21, 4), tag: "work" }),
    entry({ id: "e22", startMs: Date.UTC(2026, 8, 22, 1), endMs: Date.UTC(2026, 8, 22, 2), tag: "leisure" }),
    entry({ id: "e23", startMs: Date.UTC(2026, 8, 23, 1), endMs: Date.UTC(2026, 8, 23, 3), tag: "sleep" }),
    entry({ id: "e24", startMs: Date.UTC(2026, 8, 24, 1), endMs: Date.UTC(2026, 8, 24, 2), tag: "other" }),
    entry({ id: "e25", startMs: Date.UTC(2026, 8, 25, 1), endMs: Date.UTC(2026, 8, 25, 5), tag: null, state: "draft" }),
    entry({ id: "e26", startMs: Date.UTC(2026, 7, 10, 1), endMs: Date.UTC(2026, 7, 10, 9), tag: "work" }),
    entry({ id: "e27", startMs: Date.UTC(2026, 8, 26, 1), endMs: Date.UTC(2026, 8, 26, 6), updatedAt: 9, deletedAt: 9 }),
  ];
  const week = assembleWeek("2026-09-23", entries);
  assert.equal(week.entries.length, 4);
  assert.deepEqual(week.totals, {
    workMs: 3 * HOUR,
    leisureMs: HOUR,
    sleepMs: 2 * HOUR,
    otherMs: HOUR,
    totalMs: 7 * HOUR,
  });
});

test("周日 23:00 至周一 01:00 在两周各计一小时", () => {
  const mondayStart = weekRange("2026-09-21").startMs;
  const crossing = entry({ id: "e31", startMs: mondayStart - HOUR, endMs: mondayStart + HOUR, tag: "work" });
  assert.equal(assembleWeek("2026-09-21", [crossing]).totals.workMs, HOUR);
  assert.equal(assembleWeek("2026-09-20", [crossing]).totals.workMs, HOUR);
  assert.equal(assembleWeek("2026-09-07", [crossing]).totals.totalMs, 0);
});

test("单日统计只计入当天覆盖部分并排除草稿", () => {
  const crossing = entry({
    id: "e41",
    startMs: dayStartMs("2026-09-22") - 2 * HOUR,
    endMs: dayStartMs("2026-09-22") + HOUR,
    tag: "work",
  });
  const draft = entry({
    id: "e42",
    startMs: dayStartMs("2026-09-22"),
    endMs: dayStartMs("2026-09-22") + 5 * HOUR,
    tag: null,
    state: "draft",
  });
  assert.equal(aggregateTotals([crossing, draft], dayRange("2026-09-22")).workMs, HOUR);
  assert.equal(aggregateTotals([crossing], dayRange("2026-09-21")).totalMs, 2 * HOUR);
});

test("累计统计覆盖全部已完成记录", () => {
  const entries = [
    entry({ id: "e51", startMs: Date.UTC(2020, 0, 1, 1), endMs: Date.UTC(2020, 0, 1, 2), tag: "work" }),
    entry({ id: "e52", startMs: Date.UTC(2026, 8, 22, 1), endMs: Date.UTC(2026, 8, 22, 3), tag: "other" }),
  ];
  const totals = aggregateTotals(entries, { startMs: Number.NEGATIVE_INFINITY, endMs: Number.POSITIVE_INFINITY });
  assert.equal(totals.workMs, HOUR);
  assert.equal(totals.otherMs, 2 * HOUR);
  assert.equal(totals.totalMs, 3 * HOUR);
});

test("记录编号为随机字符串，多次生成互不相同", () => {
  const first = newEntryId();
  const second = newEntryId();
  assert.equal(typeof first, "string");
  assert.ok(first.length >= 16);
  assert.notEqual(first, second);
  assert.match(first, /^[0-9a-zA-Z-]+$/);
});

test("冲突比较取修改时间更晚的一方，相同则保留原有副本", () => {
  assert.equal(isNewer({ updatedAt: 2000 }, { updatedAt: 1000 }), true);
  assert.equal(isNewer({ updatedAt: 1000 }, { updatedAt: 2000 }), false);
  assert.equal(isNewer({ updatedAt: 1000 }, { updatedAt: 1000 }), false);
});

test("备份记录缺失编号、标签或状态非法时明确报错", () => {
  assert.throws(() => parseEntry({ content: "缺少编号" }), /记录编号无效/);
  assert.throws(() => parseEntry({ id: "e2", tag: "unknown" }), /无效标签/);
  assert.throws(() => parseEntry({ id: "e2", state: "running" }), /无效状态/);
  assert.deepEqual(parseEntry({ id: "e2", startMs: 5, endMs: 9, content: "ok", tag: "work", state: "completed" }), {
    id: "e2",
    startMs: 5,
    endMs: 9,
    startDate: null,
    endDate: null,
    content: "ok",
    tag: "work",
    state: "completed",
    updatedAt: 0,
    deletedAt: null,
  });
});

test("整份记录列表任一条不合法即整体拒绝", () => {
  const valid = { id: "e1", state: "draft", content: "", tag: null, startMs: 1, endMs: null };
  assert.equal(parseEntries([valid, { ...valid, id: "e2" }]).length, 2);
  assert.throws(() => parseEntries([valid, { id: "", state: "draft" }]), /记录编号无效/);
  assert.throws(() => parseEntries("not-an-array"), /记录列表格式无效/);
});
