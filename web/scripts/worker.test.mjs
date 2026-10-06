/**
 * Worker 检查：用内存版 KV 替代真实存储，验证管理接口、同步码分区、
 * 数据隔离、吊销与"旧客户端不会覆盖新记录"。
 */
import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/src/index.ts";

const ADMIN = "admin-token-1234567890";
const ORIGIN = "https://zgzlcc.github.io";
const CODE_SHAPE = /^time_[A-Za-z0-9_-]{32}$/;

/** 只实现 Worker 用到的那部分 KV 接口。 */
function createKv(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix = "" } = {}) {
      const keys = [...store.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

const env = (kv) => ({ TIME_SYNC: kv, ADMIN_TOKEN: ADMIN });

function request(path, { method = "GET", headers = {}, body } = {}) {
  return new Request(`https://time-sync.example.workers.dev${path}`, {
    method,
    headers: {
      Origin: ORIGIN,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const adminHeaders = { "X-Time-Admin": ADMIN };
const codeHeaders = (code) => ({ "X-Time-Code": code });

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

async function createCode(kv, label = "") {
  const response = await worker.fetch(request("/api/admin/codes", { method: "POST", headers: adminHeaders, body: { label } }), env(kv));
  assert.equal(response.status, 200);
  return (await response.json()).code;
}

test("管理接口缺少或错误口令时返回 401", async () => {
  const kv = createKv();
  assert.equal((await worker.fetch(request("/api/admin/codes"), env(kv))).status, 401);
  const wrong = await worker.fetch(
    request("/api/admin/codes", { method: "POST", headers: { "X-Time-Admin": "wrong" }, body: {} }),
    env(kv),
  );
  assert.equal(wrong.status, 401);
});

test("未配置管理口令时一律拒绝，避免误开放", async () => {
  const response = await worker.fetch(request("/api/admin/codes", { headers: adminHeaders }), {
    TIME_SYNC: createKv(),
    ADMIN_TOKEN: "",
  });
  assert.equal(response.status, 401);
});

test("创建同步码返回合规格式并写入档案", async () => {
  const kv = createKv();
  const response = await worker.fetch(
    request("/api/admin/codes", { method: "POST", headers: adminHeaders, body: { label: "给张三" } }),
    env(kv),
  );
  const created = await response.json();
  assert.match(created.code, CODE_SHAPE);
  assert.equal(created.label, "给张三");
  assert.equal(created.revokedAt, null);
  assert.ok(kv.store.has(`codes/${created.code}`));
});

test("可以列出全部同步码并按创建时间倒序", async () => {
  const kv = createKv();
  const first = await createCode(kv, "第一个");
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await createCode(kv, "第二个");
  const response = await worker.fetch(request("/api/admin/codes", { headers: adminHeaders }), env(kv));
  const { codes } = await response.json();
  assert.equal(codes.length, 2);
  assert.deepEqual(codes.map((item) => item.code), [second, first]);
  assert.equal(codes[0].label, "第二个");
});

test("列表带上每个码的记录条数与最近同步时间", async () => {
  const kv = createKv();
  const code = await createCode(kv, "有数据的码");
  await worker.fetch(
    request("/api/entries", { method: "POST", headers: codeHeaders(code), body: { entries: [entry("a", 1), entry("b", 2)] } }),
    env(kv),
  );
  const { codes } = await (await worker.fetch(request("/api/admin/codes", { headers: adminHeaders }), env(kv))).json();
  assert.equal(codes[0].entryCount, 2);
  assert.ok(typeof codes[0].lastSeenAt === "number" && codes[0].lastSeenAt > 0);
});

test("带 purge 参数时连数据一起删除，且码不再存在", async () => {
  const kv = createKv();
  const code = await createCode(kv, "待删除");
  await worker.fetch(request("/api/entries", { method: "POST", headers: codeHeaders(code), body: { entries: [entry("a", 1)] } }), env(kv));
  assert.ok(kv.store.has(`entries/${code}`));

  const purged = await worker.fetch(
    request(`/api/admin/codes/${code}?purge=1`, { method: "DELETE", headers: adminHeaders }),
    env(kv),
  );
  assert.equal(purged.status, 200);
  assert.equal((await purged.json()).purged, true);
  assert.equal(kv.store.has(`entries/${code}`), false);
  assert.equal(kv.store.has(`codes/${code}`), false);
  assert.equal((await worker.fetch(request("/api/entries", { headers: codeHeaders(code) }), env(kv))).status, 401);
});

test("创建后立刻可列出，不依赖最终一致的 list()", async () => {
  const kv = createKv();
  // 模拟 KV 的最终一致：list() 在写入后的一段时间内看不到新键
  const realList = kv.list.bind(kv);
  kv.list = async () => ({ keys: [], list_complete: true });
  const code = await createCode(kv, "刚建的码");
  const { codes } = await (await worker.fetch(request("/api/admin/codes", { headers: adminHeaders }), env(kv))).json();
  assert.equal(codes.length, 1, "列表应读自强一致的索引键，而不是 list()");
  assert.equal(codes[0].code, code);
  assert.equal(codes[0].label, "刚建的码");
  kv.list = realList;
});

test("改备注与启停会同步更新索引", async () => {
  const kv = createKv();
  const code = await createCode(kv, "旧备注");
  await worker.fetch(
    request(`/api/admin/codes/${code}`, { method: "PATCH", headers: adminHeaders, body: { label: "新备注" } }),
    env(kv),
  );
  let codes = (await (await worker.fetch(request("/api/admin/codes", { headers: adminHeaders }), env(kv))).json()).codes;
  assert.equal(codes[0].label, "新备注");

  await worker.fetch(request(`/api/admin/codes/${code}`, { method: "DELETE", headers: adminHeaders }), env(kv));
  codes = (await (await worker.fetch(request("/api/admin/codes", { headers: adminHeaders }), env(kv))).json()).codes;
  assert.ok(typeof codes[0].revokedAt === "number");

  await worker.fetch(request(`/api/admin/codes/${code}?restore=1`, { method: "POST", headers: adminHeaders }), env(kv));
  codes = (await (await worker.fetch(request("/api/admin/codes", { headers: adminHeaders }), env(kv))).json()).codes;
  assert.equal(codes[0].revokedAt, null);
});

test("彻底删除会同时移出索引，列表里不再出现", async () => {
  const kv = createKv();
  const kept = await createCode(kv, "留着");
  const doomed = await createCode(kv, "删掉");
  await worker.fetch(
    request(`/api/admin/codes/${doomed}?purge=1`, { method: "DELETE", headers: adminHeaders }),
    env(kv),
  );
  const { codes } = await (await worker.fetch(request("/api/admin/codes", { headers: adminHeaders }), env(kv))).json();
  assert.deepEqual(codes.map((item) => item.code), [kept]);
});

test("同步写入只更新索引里对应的一项，不影响其他码", async () => {
  const kv = createKv();
  const alice = await createCode(kv, "alice");
  const bob = await createCode(kv, "bob");
  await worker.fetch(
    request("/api/entries", { method: "POST", headers: codeHeaders(bob), body: { entries: [entry("b1", 1), entry("b2", 2)] } }),
    env(kv),
  );
  const { codes } = await (await worker.fetch(request("/api/admin/codes", { headers: adminHeaders }), env(kv))).json();
  const byCode = Object.fromEntries(codes.map((item) => [item.code, item]));
  assert.equal(byCode[bob].entryCount, 2);
  assert.ok(typeof byCode[bob].lastSeenAt === "number");
  assert.equal(byCode[alice].entryCount, undefined);
  assert.equal(byCode[alice].label, "alice");
  assert.equal(byCode[alice].lastSeenAt, undefined);
});

test("档案被外部删掉时，列表会把它从索引里清理掉", async () => {
  const kv = createKv();
  const code = await createCode(kv, "会被手工删掉");
  kv.store.delete(`codes/${code}`);
  const { codes } = await (await worker.fetch(request("/api/admin/codes", { headers: adminHeaders }), env(kv))).json();
  assert.equal(codes.length, 0);
  // 索引本身也应被就地修正，避免每次都重新扫描
  assert.equal(kv.store.get("index/codes"), "[]");
});

test("索引为空时回退扫描一次，把老码补进索引", async () => {
  const kv = createKv();
  // 模拟索引上线前就存在的码：只有 codes/ 档案，没有索引
  kv.store.set("codes/time_" + "q".repeat(32), JSON.stringify({ label: "历史遗留", createdAt: 1, revokedAt: null }));
  const { codes } = await (await worker.fetch(request("/api/admin/codes", { headers: adminHeaders }), env(kv))).json();
  assert.equal(codes.length, 1);
  assert.equal(codes[0].label, "历史遗留");
  // 建好索引后应写回，后续不再依赖 list()
  assert.ok((kv.store.get("index/codes") ?? "").includes("历史遗留"));
});

test("删除不存在的码返回 404", async () => {
  const kv = createKv();
  const response = await worker.fetch(
    request(`/api/admin/codes/${"time_" + "z".repeat(32)}`, { method: "DELETE", headers: adminHeaders }),
    env(kv),
  );
  assert.equal(response.status, 404);
});

test("可以修改同步码的备注，码本身不变", async () => {
  const kv = createKv();
  const code = await createCode(kv, "旧备注");
  const response = await worker.fetch(
    request(`/api/admin/codes/${code}`, { method: "PATCH", headers: adminHeaders, body: { label: "新备注" } }),
    env(kv),
  );
  assert.equal(response.status, 200);
  const updated = await response.json();
  assert.equal(updated.code, code);
  assert.equal(updated.label, "新备注");

  const { codes } = await (await worker.fetch(request("/api/admin/codes", { headers: adminHeaders }), env(kv))).json();
  assert.equal(codes[0].label, "新备注");
  assert.equal(codes[0].code, code);
});

test("改备注时缺少 label 返回 400，码不存在返回 404", async () => {
  const kv = createKv();
  const code = await createCode(kv);
  const missing = await worker.fetch(
    request(`/api/admin/codes/${code}`, { method: "PATCH", headers: adminHeaders, body: {} }),
    env(kv),
  );
  assert.equal(missing.status, 400);
  const notFound = await worker.fetch(
    request(`/api/admin/codes/${"time_" + "y".repeat(32)}`, { method: "PATCH", headers: adminHeaders, body: { label: "x" } }),
    env(kv),
  );
  assert.equal(notFound.status, 404);
});

test("格式不合法的同步码返回 400", async () => {
  const kv = createKv();
  const bad = await worker.fetch(request("/api/entries", { headers: codeHeaders("short") }), env(kv));
  assert.equal(bad.status, 400);
  const notExists = await worker.fetch(request("/api/entries", { headers: codeHeaders("time_" + "a".repeat(32)) }), env(kv));
  assert.equal(notExists.status, 401);
});

test("不同同步码的数据彼此隔离", async () => {
  const kv = createKv();
  const alice = await createCode(kv, "alice");
  const bob = await createCode(kv, "bob");

  await worker.fetch(
    request("/api/entries", { method: "POST", headers: codeHeaders(alice), body: { entries: [entry("a1", 100)] } }),
    env(kv),
  );
  await worker.fetch(
    request("/api/entries", { method: "POST", headers: codeHeaders(bob), body: { entries: [entry("b1", 100)] } }),
    env(kv),
  );

  const aliceView = await (await worker.fetch(request("/api/entries", { headers: codeHeaders(alice) }), env(kv))).json();
  const bobView = await (await worker.fetch(request("/api/entries", { headers: codeHeaders(bob) }), env(kv))).json();
  assert.deepEqual(aliceView.entries.map((item) => item.id), ["a1"]);
  assert.deepEqual(bobView.entries.map((item) => item.id), ["b1"]);
  assert.ok(kv.store.has(`entries/${alice}`));
  assert.ok(kv.store.has(`entries/${bob}`));
});

test("停用后拒绝读写，且其他码不受影响", async () => {
  const kv = createKv();
  const alice = await createCode(kv, "alice");
  const bob = await createCode(kv, "bob");
  await worker.fetch(request("/api/entries", { method: "POST", headers: codeHeaders(alice), body: { entries: [entry("a1", 1)] } }), env(kv));

  const revoked = await worker.fetch(
    request(`/api/admin/codes/${alice}`, { method: "DELETE", headers: adminHeaders }),
    env(kv),
  );
  assert.equal(revoked.status, 200);
  assert.equal((await worker.fetch(request("/api/entries", { headers: codeHeaders(alice) }), env(kv))).status, 401);
  assert.equal((await worker.fetch(request("/api/entries", { headers: codeHeaders(bob) }), env(kv))).status, 200);
  // 数据仍在，启用回来就能继续用
  assert.ok(kv.store.has(`entries/${alice}`));
});

test("启用被停用的码后，原来的数据一条不少", async () => {
  const kv = createKv();
  const code = await createCode(kv, "会停用再启用");
  await worker.fetch(
    request("/api/entries", { method: "POST", headers: codeHeaders(code), body: { entries: [entry("a", 1), entry("b", 2)] } }),
    env(kv),
  );
  const before = await (await worker.fetch(request("/api/entries", { headers: codeHeaders(code) }), env(kv))).json();

  await worker.fetch(request(`/api/admin/codes/${code}`, { method: "DELETE", headers: adminHeaders }), env(kv));
  const restored = await worker.fetch(
    request(`/api/admin/codes/${code}?restore=1`, { method: "POST", headers: adminHeaders }),
    env(kv),
  );
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).revokedAt, null);

  const after = await (await worker.fetch(request("/api/entries", { headers: codeHeaders(code) }), env(kv))).json();
  assert.deepEqual(after.entries, before.entries);
  assert.equal(after.entries.length, 2);

  // 启用后还能继续写入
  const written = await (
    await worker.fetch(
      request("/api/entries", { method: "POST", headers: codeHeaders(code), body: { entries: [entry("c", 3)] } }),
      env(kv),
    )
  ).json();
  assert.equal(written.entries.length, 3);
});

test("列表里能看到停用状态，启用后恢复为启用中", async () => {
  const kv = createKv();
  const code = await createCode(kv, "状态演示");
  await worker.fetch(request(`/api/admin/codes/${code}`, { method: "DELETE", headers: adminHeaders }), env(kv));
  let codes = (await (await worker.fetch(request("/api/admin/codes", { headers: adminHeaders }), env(kv))).json()).codes;
  assert.ok(typeof codes[0].revokedAt === "number", "停用后应带停用时间");

  await worker.fetch(request(`/api/admin/codes/${code}?restore=1`, { method: "POST", headers: adminHeaders }), env(kv));
  codes = (await (await worker.fetch(request("/api/admin/codes", { headers: adminHeaders }), env(kv))).json()).codes;
  assert.equal(codes[0].revokedAt, null);
});

test("重复停用或启用同一个码都不会报错", async () => {
  const kv = createKv();
  const code = await createCode(kv);
  await worker.fetch(request(`/api/admin/codes/${code}`, { method: "DELETE", headers: adminHeaders }), env(kv));
  const again = await worker.fetch(request(`/api/admin/codes/${code}`, { method: "DELETE", headers: adminHeaders }), env(kv));
  assert.equal(again.status, 200);

  await worker.fetch(request(`/api/admin/codes/${code}?restore=1`, { method: "POST", headers: adminHeaders }), env(kv));
  const againRestore = await worker.fetch(
    request(`/api/admin/codes/${code}?restore=1`, { method: "POST", headers: adminHeaders }),
    env(kv),
  );
  assert.equal(againRestore.status, 200);
});

test("启用不存在的码返回 404", async () => {
  const kv = createKv();
  const response = await worker.fetch(
    request(`/api/admin/codes/${"time_" + "w".repeat(32)}?restore=1`, { method: "POST", headers: adminHeaders }),
    env(kv),
  );
  assert.equal(response.status, 404);
});

test("写入后能读回，且合并保留两端记录", async () => {
  const kv = createKv();
  const code = await createCode(kv);
  await worker.fetch(request("/api/entries", { method: "POST", headers: codeHeaders(code), body: { entries: [entry("a", 100)] } }), env(kv));
  const pushed = await (
    await worker.fetch(
      request("/api/entries", { method: "POST", headers: codeHeaders(code), body: { entries: [entry("b", 200)] } }),
      env(kv),
    )
  ).json();
  assert.deepEqual(pushed.entries.map((item) => item.id).sort(), ["a", "b"]);
  assert.ok(pushed.revision > 0);

  const read = await (await worker.fetch(request("/api/entries", { headers: codeHeaders(code) }), env(kv))).json();
  assert.deepEqual(read.entries.map((item) => item.id).sort(), ["a", "b"]);
});

test("旧客户端推送的旧版本不会覆盖较新的记录", async () => {
  const kv = createKv();
  const code = await createCode(kv);
  await worker.fetch(
    request("/api/entries", { method: "POST", headers: codeHeaders(code), body: { entries: [entry("a", 500, { content: "新内容" })] } }),
    env(kv),
  );
  const stale = await (
    await worker.fetch(
      request("/api/entries", { method: "POST", headers: codeHeaders(code), body: { entries: [entry("a", 100, { content: "旧内容" })] } }),
      env(kv),
    )
  ).json();
  assert.equal(stale.entries[0].content, "新内容");
  assert.match(kv.store.get(`entries/${code}`), /新内容/);
});

test("格式非法的记录被整份拒绝且不写入", async () => {
  const kv = createKv();
  const code = await createCode(kv);
  const bad = await worker.fetch(
    request("/api/entries", { method: "POST", headers: codeHeaders(code), body: { entries: [entry("a", 1), { id: "", state: "completed" }] } }),
    env(kv),
  );
  assert.equal(bad.status, 500);
  assert.equal(kv.store.has(`entries/${code}`), false);
});

test("非法 JSON 与缺少 entries 都被拒绝", async () => {
  const kv = createKv();
  const code = await createCode(kv);
  const broken = await worker.fetch(
    new Request("https://example.workers.dev/api/entries", {
      method: "POST",
      headers: { Origin: ORIGIN, "X-Time-Code": code, "Content-Type": "application/json" },
      body: "{not json",
    }),
    env(kv),
  );
  assert.equal(broken.status, 500);
  const missing = await worker.fetch(
    request("/api/entries", { method: "POST", headers: codeHeaders(code), body: { data: [] } }),
    env(kv),
  );
  assert.equal(missing.status, 500);
});

test("未知路径 404、未知方法 405", async () => {
  const kv = createKv();
  const code = await createCode(kv);
  assert.equal((await worker.fetch(request("/other", { headers: codeHeaders(code) }), env(kv))).status, 404);
  assert.equal((await worker.fetch(request("/api/entries", { method: "DELETE", headers: codeHeaders(code) }), env(kv))).status, 405);
});

test("预检请求放行站点来源并允许自定义头", async () => {
  const response = await worker.fetch(
    new Request("https://example.workers.dev/api/entries", { method: "OPTIONS", headers: { Origin: ORIGIN } }),
    env(createKv()),
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.match(response.headers.get("Access-Control-Allow-Headers") ?? "", /X-Time-Code/);
  assert.match(response.headers.get("Access-Control-Allow-Headers") ?? "", /X-Time-Admin/);
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
      env(createKv()),
    );
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin, `${origin} 应被放行`);
  }
  const stranger = await worker.fetch(
    new Request("https://example.workers.dev/api/entries", { method: "OPTIONS", headers: { Origin: "https://evil.example.com" } }),
    env(createKv()),
  );
  assert.equal(stranger.headers.get("Access-Control-Allow-Origin"), null);
});

test("显式配置 ALLOWED_ORIGINS 后只放行配置的来源", async () => {
  const kv = createKv();
  const allowed = await worker.fetch(
    new Request("https://example.workers.dev/api/entries", {
      method: "OPTIONS",
      headers: { Origin: "https://time.example.com" },
    }),
    { ...env(kv), ALLOWED_ORIGINS: "https://time.example.com" },
  );
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "https://time.example.com");

  const rejected = await worker.fetch(
    new Request("https://example.workers.dev/api/entries", { method: "OPTIONS", headers: { Origin: ORIGIN } }),
    { ...env(kv), ALLOWED_ORIGINS: "https://time.example.com" },
  );
  assert.equal(rejected.headers.get("Access-Control-Allow-Origin"), null);
});
