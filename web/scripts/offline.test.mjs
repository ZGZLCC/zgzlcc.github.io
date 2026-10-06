/**
 * 网络不可达提示与备份提醒的检查。
 * 这两处在"国内连不上 workers.dev"和"记录只在浏览器里"的情况下决定用户看到什么。
 */
import assert from "node:assert/strict";
import test from "node:test";

// backup-reminder 在导入时读取 localStorage，这里先装上内存实现。
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const { unreachableHint } = await import("../src/storage/network-hint.ts");
const { isStale, shouldRemind, loadLastExportedAt, saveLastExportedAt, markExported } = await import(
  "../src/storage/backup-reminder.ts"
);

const DAY = 86_400_000;

test("workers.dev 连不上时说明是域名污染而不是配置错误", () => {
  const hint = unreachableHint("https://time-sync.zgzlcc.workers.dev");
  assert.match(hint, /workers\.dev/);
  assert.match(hint, /DNS 污染|域名解析被污染/);
  assert.match(hint, /与配置无关/);
  assert.match(hint, /本地记录不受影响/);
});

test("其他地址连不上时给出地址本身而不误报污染", () => {
  const hint = unreachableHint("https://sync.example.com/");
  assert.match(hint, /sync\.example\.com/);
  assert.doesNotMatch(hint, /workers\.dev/);
});

test("带路径与协议的地址都能提取出主机名", () => {
  const hint = unreachableHint("http://127.0.0.1:8787/api");
  assert.match(hint, /127\.0\.0\.1:8787/);
});

test("单项过期判定：从未发生或超过 7 天算过期", () => {
  const now = 1_800_000_000_000;
  assert.equal(isStale(null, now), true);
  assert.equal(isStale(now - 8 * DAY, now), true);
  assert.equal(isStale(now - 7 * DAY - 1, now), true);
  assert.equal(isStale(now - 7 * DAY, now), false);
  assert.equal(isStale(now - 3 * DAY, now), false);
  assert.equal(isStale(now, now), false);
});

test("未配置云端同步时只看导出时间，导出过就不提醒", () => {
  const now = 1_800_000_000_000;
  // 同步从未发生（null）不算过期，避免没配云端的人每次打开都被提醒
  assert.equal(shouldRemind(now, null, now - DAY), false);
  assert.equal(shouldRemind(now, null, null), true);
  assert.equal(shouldRemind(now, null, now - 8 * DAY), true);
});

test("已配置云端同步时，同步或导出任一超过 7 天就提醒", () => {
  const now = 1_800_000_000_000;
  assert.equal(shouldRemind(now, now - DAY, now - DAY), false);
  // 同步新鲜但导出过期
  assert.equal(shouldRemind(now, now - DAY, now - 8 * DAY), true);
  // 导出新鲜但同步过期
  assert.equal(shouldRemind(now, now - 8 * DAY, now - DAY), true);
  assert.equal(shouldRemind(now, now - 8 * DAY, now - 8 * DAY), true);
});

test("导出时间写入本地后能被重新读出", () => {
  assert.equal(loadLastExportedAt(), null);
  saveLastExportedAt(1_700_000_000_000);
  assert.equal(loadLastExportedAt(), 1_700_000_000_000);
  markExported(1_750_000_000_000);
  assert.equal(loadLastExportedAt(), 1_750_000_000_000);
});
