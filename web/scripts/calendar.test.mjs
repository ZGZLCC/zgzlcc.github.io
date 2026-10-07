/**
 * 日期选择器的日历计算：跨月、跨年、闰日与非法日期。
 * 这些是自绘日历最容易出错的地方，跑一遍比肉眼看可靠。
 */
import assert from "node:assert/strict";
import test from "node:test";

const { WEEKDAYS, addDays, addMonths, isDate, monthGrid } = await import("../src/components/calendar.ts");

test("周一开头，与实际星期一致", () => {
  assert.deepEqual(WEEKDAYS, ["一", "二", "三", "四", "五", "六", "日"]);
  // 2026-10-01 是周四，网格应从它前面那个周一开始
  const { cells } = monthGrid("2026-10");
  assert.equal(cells[0].date, "2026-09-28");
  assert.equal(cells[0].day, 28);
  assert.equal(cells[0].currentMonth, false);
  // 固定 42 格，切换月份时高度不跳
  assert.equal(cells.length, 42);
});

test("二月与闰年的天数正确", () => {
  assert.equal(monthGrid("2024-02").cells.filter((cell) => cell.currentMonth).length, 29, "2024 是闰年");
  assert.equal(monthGrid("2026-02").cells.filter((cell) => cell.currentMonth).length, 28);
  assert.equal(monthGrid("1900-02").cells.filter((cell) => cell.currentMonth).length, 28, "1900 不是闰年");
  assert.equal(monthGrid("2000-02").cells.filter((cell) => cell.currentMonth).length, 29, "2000 是闰年");
});

test("非法日期被拒绝", () => {
  assert.equal(isDate("2026-02-30"), false, "2 月没有 30 号");
  assert.equal(isDate("2026-13-01"), false, "没有 13 月");
  assert.equal(isDate("2026-10-6"), false, "必须是两位月份与日");
  assert.equal(isDate("2026-02-28"), true);
  assert.equal(isDate(""), false);
});

test("加减天数跨月跨年", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29", "闰年二月有 29 天");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
});

test("加减月份把日号夹到目标月的合法范围", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28", "1月31日加一个月应落到 2 月最后一天");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29", "闰年是 29 日");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-15", "跨年");
  assert.equal(addMonths("2026-01-15", -1), "2025-12-15");
});

test("网格覆盖完整的一个月且首尾补齐临近月份", () => {
  const { cells, label } = monthGrid("2026-10");
  assert.equal(label, "2026年10月");
  const october = cells.filter((cell) => cell.currentMonth);
  assert.equal(october[0].date, "2026-10-01");
  assert.equal(october[october.length - 1].date, "2026-10-31");
  // 补齐的日子必须连续，不能有空洞
  for (let index = 1; index < cells.length; index += 1) {
    assert.equal(addDays(cells[index - 1].date, 1), cells[index].date, "相邻格必须连续");
  }
});
