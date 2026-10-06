/**
 * Worker 检查：用内存版 D1 替代真实数据库，验证鉴权、CORS、
 * 合并写入与"旧客户端不会覆盖新记录"。
 */
import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/src/index.ts";

const TOKEN = "test-token-1234567890";
const ORIGIN = "https://zgzlcc.github.io";

/** 只实现 Worker 用到的那部分 D1 接口：batch、prepare、bind、first/all。 */
function createDatabase(rows = []) {
  const entries = new Map(rows.map((row) => [row.id, row]));
  const meta = new Map();

  function makeStatement(sql, params = []) {
    return {
      sql,
      params,
      bind: (...values) => makeStatement(sql, values),
      async run() {
        return apply(sql, params);
      },
    };
  }

  function apply(sql, params) {
    if (sql.includes("INSERT INTO entries")) {
      const [id, startMs, endMs, startDate, endDate, content, tag, state, updatedAt, deletedAt] = params;
      const current = entries.get(id);
      // 与线上一致的守卫：只有更新的版本才能覆盖已有行。
      if (current === undefined || updatedAt > current.updated_at) {
        entries.set(id, {
          id,
          start_ms: startMs,
          end_ms: endMs,
          start_date: startDate,
          end_date: endDate,
          content,
          tag,
          state,
          updated_at: updatedAt,
          deleted_at: deletedAt,
        });
        return { meta: { rows_written: 1 } };
      }
      return { meta: { rows_written: 0 } };
    }
    if (sql.includes("INSERT INTO meta")) {
      meta.set("revision", params[0]);
      return { meta: { rows_written: 1 } };
    }
    throw new Error(`未预期的 SQL: ${sql}`);
  }

  return {
    entries,
    meta,
    prepare: (sql) => makeStatement(sql),
    async batch(statements) {
      const results = [];
      for (const statement of statements) {
        if (statement.sql.includes("FROM entries")) {
          results.push({ results: [...entries.values()] });
        } else if (statement.sql.includes("FROM meta")) {
          results.push({ results: meta.has("revision") ? [{ value: meta.get("revision") }] : [] });
        } else {
          results.push(await apply(statement.sql, statement.params));
        }
      }
      return results;
    },
  };
}

function request(method, body, headers = {}) {
  return new Request("https://time-sync.example.workers.dev/api/entries", {
    method,
    headers: { Origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function entry(id, updatedAt, overrides = {}) {
  return {
    id,
    startMs: 1000,
    endMs: 2000,
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

// 绑定名与 wrangler.toml 的 binding 一致。
const env = (db) => ({ time_sync: db, SYNC_TOKEN: TOKEN });

test("缺少或错误的口令都返回 401", async () => {
  const db = createDatabase();
  const missing = await worker.fetch(request("GET"), env(db));
  assert.equal(missing.status, 401);
  const wrong = await worker.fetch(request("GET", undefined, { "X-Time-Token": "wrong" }), env(db));
  assert.equal(wrong.status, 401);
});

test("未配置 SYNC_TOKEN 时一律拒绝，避免误开放", async () => {
  const response = await worker.fetch(request("GET", undefined, { "X-Time-Token": TOKEN }), {
    time_sync: createDatabase(),
    SYNC_TOKEN: "",
  });
  assert.equal(response.status, 401);
});

test("未知路径返回 404，未知方法返回 405", async () => {
  const db = createDatabase();
  const headers = { "X-Time-Token": TOKEN };
  const notFound = await worker.fetch(
    new Request("https://example.workers.dev/other", { method: "GET", headers }),
    env(db),
  );
  assert.equal(notFound.status, 404);
  const notAllowed = await worker.fetch(request("DELETE", undefined, headers), env(db));
  assert.equal(notAllowed.status, 405);
});

test("预检请求返回允许来源与自定义头", async () => {
  const response = await worker.fetch(
    new Request("https://example.workers.dev/api/entries", { method: "OPTIONS", headers: { Origin: ORIGIN } }),
    env(createDatabase()),
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.match(response.headers.get("Access-Control-Allow-Headers") ?? "", /X-Time-Token/);
});

test("不在白名单的来源不返回允许来源头", async () => {
  const response = await worker.fetch(
    new Request("https://example.workers.dev/api/entries", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example.com" },
    }),
    env(createDatabase()),
  );
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("站点预览端口与网站版开发端口都在白名单内", async () => {
  const origins = [
    "https://zgzlcc.github.io",
    "http://localhost:4321",
    "http://127.0.0.1:4321",
    "http://localhost:5180",
    "http://127.0.0.1:5181",
  ];
  for (const origin of origins) {
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/entries", { method: "OPTIONS", headers: { Origin: origin } }),
      env(createDatabase()),
    );
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin, `${origin} 应被放行`);
  }
});

test("显式配置 ALLOWED_ORIGINS 后只放行配置的来源", async () => {
  const db = createDatabase();
  const allowed = await worker.fetch(
    new Request("https://example.workers.dev/api/entries", {
      method: "OPTIONS",
      headers: { Origin: "https://time.example.com" },
    }),
    { ...env(db), ALLOWED_ORIGINS: "https://time.example.com" },
  );
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "https://time.example.com");

  const rejected = await worker.fetch(
    new Request("https://example.workers.dev/api/entries", { method: "OPTIONS", headers: { Origin: ORIGIN } }),
    { ...env(db), ALLOWED_ORIGINS: "https://time.example.com" },
  );
  assert.equal(rejected.headers.get("Access-Control-Allow-Origin"), null);
});

test("POST 写入后 GET 能读回同一条记录", async () => {
  const db = createDatabase();
  const headers = { "X-Time-Token": TOKEN, "Content-Type": "application/json" };
  const pushed = await worker.fetch(request("POST", { entries: [entry("a", 100)] }, headers), env(db));
  assert.equal(pushed.status, 200);
  const body = await pushed.json();
  assert.equal(body.entries.length, 1);
  assert.equal(body.revision > 0, true);

  const pulled = await worker.fetch(request("GET", undefined, { "X-Time-Token": TOKEN }), env(db));
  const read = await pulled.json();
  assert.equal(read.entries.length, 1);
  assert.equal(read.entries[0].id, "a");
  assert.equal(read.revision, body.revision);
});

test("旧客户端推送的旧版本不会覆盖云端更新的记录", async () => {
  const db = createDatabase();
  const headers = { "X-Time-Token": TOKEN, "Content-Type": "application/json" };
  await worker.fetch(request("POST", { entries: [entry("a", 500, { content: "新内容" })] }, headers), env(db));
  const stale = await worker.fetch(
    request("POST", { entries: [entry("a", 100, { content: "旧内容" })] }, headers),
    env(db),
  );
  const body = await stale.json();
  assert.equal(body.entries[0].content, "新内容");
  assert.equal(db.entries.get("a").content, "新内容");
});

test("同一请求里两台设备的记录会合并保存", async () => {
  const db = createDatabase();
  const headers = { "X-Time-Token": TOKEN, "Content-Type": "application/json" };
  // 云端已有一条来自第三台设备的旧记录。
  await worker.fetch(request("POST", { entries: [entry("cloud", 50)] }, headers), env(db));
  const response = await worker.fetch(
    request("POST", { entries: [entry("phone", 200), entry("laptop", 300)] }, headers),
    env(db),
  );
  const body = await response.json();
  assert.deepEqual(body.entries.map((item) => item.id).sort(), ["cloud", "laptop", "phone"]);
  assert.equal(db.entries.size, 3);
  assert.equal(db.entries.get("phone").updated_at, 200);
  assert.equal(db.entries.get("phone").content, "记录 phone");
});

test("格式无效的记录被整份拒绝，且不写入任何内容", async () => {
  const db = createDatabase();
  const headers = { "X-Time-Token": TOKEN, "Content-Type": "application/json" };
  const bad = await worker.fetch(
    request("POST", { entries: [entry("a", 100), { id: "", state: "completed" }] }, headers),
    env(db),
  );
  assert.equal(bad.status, 500);
  assert.equal(db.entries.size, 0);
});

test("非法 JSON 与缺少 entries 都被拒绝", async () => {
  const db = createDatabase();
  const headers = { "X-Time-Token": TOKEN, "Content-Type": "application/json" };
  const brokenJson = await worker.fetch(
    new Request("https://example.workers.dev/api/entries", { method: "POST", headers, body: "{not json" }),
    env(db),
  );
  assert.equal(brokenJson.status, 500);
  const noEntries = await worker.fetch(request("POST", { data: [] }, headers), env(db));
  assert.equal(noEntries.status, 500);
});
