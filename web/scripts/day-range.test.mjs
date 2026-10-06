import assert from "node:assert/strict";
import test from "node:test";
import { beijingDateOf, dayRange, dayStartMs, entryIntersectsDay, recordsOnDay } from "../src/day-range.ts";

test("Beijing day range starts at local midnight as UTC milliseconds", () => {
  assert.equal(dayStartMs("2026-09-23"), Date.UTC(2026, 8, 22, 16, 0));
  const { startMs, endMs } = dayRange("2026-09-23");
  assert.equal(endMs - startMs, 86_400_000);
  assert.equal(beijingDateOf(startMs), "2026-09-23");
  assert.equal(beijingDateOf(endMs - 1), "2026-09-23");
  assert.equal(beijingDateOf(endMs), "2026-09-24");
});

test("day range follows Beijing time across the UTC date boundary", () => {
  const { startMs } = dayRange("2026-08-31");
  assert.equal(beijingDateOf(startMs - 1), "2026-08-30");
  assert.equal(beijingDateOf(Date.UTC(2026, 7, 31, 15, 59)), "2026-08-31");
  assert.equal(beijingDateOf(Date.UTC(2026, 7, 31, 16, 0)), "2026-09-01");
});

test("history day filter keeps records that cross midnight", () => {
  const { startMs, endMs } = dayRange("2026-09-23");
  const overnight = { startMs: startMs - 3_600_000, endMs: startMs + 3_600_000 };
  const inside = { startMs: startMs, endMs: endMs };
  const before = { startMs: startMs - 7_200_000, endMs: startMs };
  const missing = { startMs: null, endMs: null };

  assert.equal(entryIntersectsDay(overnight, startMs, endMs), true);
  assert.equal(entryIntersectsDay(inside, startMs, endMs), true);
  assert.equal(entryIntersectsDay(before, startMs, endMs), false);
  assert.equal(entryIntersectsDay(missing, startMs, endMs), true);
});

test("history day filter keeps all records when no date is chosen", () => {
  const { startMs, endMs } = dayRange("2026-09-23");
  const midnight = { startMs: startMs + 3_600_000, endMs: endMs + 3_600_000 };
  const earlier = { startMs: startMs - 7_200_000, endMs: startMs - 3_600_000 };
  const completed = [midnight, earlier];

  assert.deepEqual(recordsOnDay(completed, ""), completed);
  assert.deepEqual(recordsOnDay(completed, "2026-09-23"), [midnight]);
  assert.deepEqual(recordsOnDay(completed, "2026-09-22"), [earlier]);
  assert.deepEqual(recordsOnDay(completed, "2026-09-25"), []);
});
