/**
 * 同步合并逻辑检查：多设备离线各写各的之后，谁胜出、删除会不会被复活、
 * 墓碑多久清理。这些规则决定了"两台设备来回同步"能不能得到同一份数据。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { isInSync, mergeSnapshot, pruneTombstones } from "../src/core/sync.ts";

function entry(id, updatedAt, overrides = {}) {
  return {
    id,
    startMs: updatedAt * 10,
    endMs: updatedAt * 10 + 1000,
    startDate: null,
    endDate: null,
    content: `记录 ${id}`,
    tag: "work",
    state: "completed",
    updatedAt,
    deletedAt: null,
    ...overrides,
  };
}

test("只有远端存在的记录会拉到本地", () => {
  const result = mergeSnapshot([entry("a", 1)], [entry("a", 1), entry("b", 2)]);
  assert.deepEqual(result.toPull.map((item) => item.id), ["b"]);
  assert.deepEqual(result.toPush, []);
  assert.equal(result.entries.length, 2);
});

test("只有本地存在的记录会推到云端", () => {
  const result = mergeSnapshot([entry("a", 1), entry("b", 2)], [entry("a", 1)]);
  assert.deepEqual(result.toPush.map((item) => item.id), ["b"]);
  assert.deepEqual(result.toPull, []);
});

test("同一条记录两端都改过时，修改时间更晚的一方胜出", () => {
  const local = entry("a", 200, { content: "本地较新" });
  const remote = entry("a", 100, { content: "云端较旧" });
  const result = mergeSnapshot([local], [remote]);
  assert.equal(result.entries[0].content, "本地较新");
  assert.deepEqual(result.toPush.map((item) => item.id), ["a"]);
  assert.deepEqual(result.toPull, []);
  assert.equal(result.conflicts, 1);
});

test("云端更新时以云端为准并写回本地", () => {
  const result = mergeSnapshot([entry("a", 100, { content: "本地较旧" })], [entry("a", 200, { content: "云端较新" })]);
  assert.equal(result.entries[0].content, "云端较新");
  assert.deepEqual(result.toPull.map((item) => item.id), ["a"]);
  assert.equal(result.conflicts, 1);
});

test("修改时间相同时保留本地副本且不重复推送", () => {
  const result = mergeSnapshot([entry("a", 100)], [entry("a", 100)]);
  assert.deepEqual(result.toPush, []);
  assert.deepEqual(result.toPull, []);
  assert.equal(result.conflicts, 0);
  assert.equal(result.entries.length, 1);
});

test("删除墓碑不会被另一端的旧数据复活", () => {
  const tombstone = entry("a", 300, { deletedAt: 300 });
  const stale = entry("a", 100);
  const forward = mergeSnapshot([tombstone], [stale]);
  assert.equal(forward.entries[0].deletedAt, 300);
  assert.deepEqual(forward.toPush.map((item) => item.id), ["a"]);

  const backward = mergeSnapshot([stale], [tombstone]);
  assert.equal(backward.entries[0].deletedAt, 300);
  assert.deepEqual(backward.toPull.map((item) => item.id), ["a"]);
});

test("两台设备的老数据合并后按开始时间倒序排列", () => {
  const result = mergeSnapshot([entry("a", 100), entry("c", 300)], [entry("b", 200)]);
  assert.deepEqual(result.entries.map((item) => item.id), ["c", "b", "a"]);
});

test("两端逐条一致时判定为已同步", () => {
  const entries = [entry("a", 100), entry("b", 200)];
  assert.equal(isInSync(entries, [entry("b", 200), entry("a", 100)]), true);
  assert.equal(isInSync(entries, [entry("a", 100)]), false);
  assert.equal(isInSync(entries, [entry("a", 101), entry("b", 200)]), false);
  assert.equal(isInSync(entries, [entry("a", 100), entry("c", 200)]), false);
});

test("超过保留期的删除墓碑被清理，未到期与未删除的保留", () => {
  const now = 1_000_000_000_000;
  const old = entry("old", 1, { deletedAt: now - 200 * 86_400_000 });
  const recent = entry("recent", 2, { deletedAt: now - 10 * 86_400_000 });
  const alive = entry("alive", 3);
  const kept = pruneTombstones([old, recent, alive], now).map((item) => item.id);
  assert.deepEqual(kept, ["recent", "alive"]);
});
