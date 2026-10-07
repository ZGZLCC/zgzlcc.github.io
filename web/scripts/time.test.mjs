import assert from "node:assert/strict";
import test from "node:test";
import { formatDateHeading, formatDateLabel, formatDurationMinutes, formatWeekRange, fromBeijingInput, shiftDate, toBeijingInput } from "../src/time.ts";

test("Beijing wall time round-trips as UTC milliseconds", () => {
  const timestamp = fromBeijingInput("2026-09-23T08:15");
  assert.equal(timestamp, Date.UTC(2026, 8, 23, 0, 15));
  assert.equal(toBeijingInput(timestamp), "2026-09-23T08:15");
});

test("rejects invalid or missing Beijing date and time", () => {
  assert.throws(() => fromBeijingInput("2026-02-30T10:00"), /无效/);
  assert.throws(() => fromBeijingInput(""), /完整/);
});

test("week dates shift across leap days and years without local-time dependence", () => {
  assert.equal(shiftDate("2024-02-28", 1), "2024-02-29");
  assert.equal(shiftDate("2023-12-31", 1), "2024-01-01");
  assert.equal(formatDateHeading("2024-01-01"), "1月1日");
  assert.equal(formatWeekRange("2023-12-25", "2023-12-31"), "2023年12月25日 – 12月31日");
  assert.equal(formatWeekRange("2024-12-30", "2025-01-05"), "2024年12月30日 – 2025年1月5日");
  assert.throws(() => shiftDate("2024-02-31", 7), /无效/);
});

test("displayed dates follow Beijing time at the UTC month boundary", () => {
  assert.equal(toBeijingInput(Date.UTC(2026, 7, 31, 15, 59)).slice(0, 10), "2026-08-31");
  assert.equal(toBeijingInput(Date.UTC(2026, 7, 31, 16, 0)).slice(0, 10), "2026-09-01");
});

test("week duration displays whole minutes without seconds", () => {
  assert.equal(formatDurationMinutes(59_999), "0时 0分");
  assert.equal(formatDurationMinutes(3_661_999), "1时 1分");
});

test("day card labels the selected date with its year, without weekday", () => {
  assert.equal(formatDateLabel("2026-10-04"), "2026年10月4日");
  assert.equal(formatDateLabel("2024-02-29"), "2024年2月29日");
  assert.equal(formatDateLabel("2026-01-01"), "2026年1月1日");
});
