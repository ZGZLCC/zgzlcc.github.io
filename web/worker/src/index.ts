import type { TimeEntry } from "../../src/core/entries";
import { mergeEntries, normalizeEntry, pruneTombstones } from "./entries";
import { corsHeaders, isAdminAuthorized, json, readCode, type Env } from "./http";

/** 单次请求体上限，避免异常客户端把整份数据撑爆。 */
const MAX_BODY_BYTES = 2_000_000;
/** 单个同步码最多保留的记录条数，防止免费额度被单个租户吃光。 */
const MAX_ENTRIES_PER_CODE = 20_000;
/** 同步码格式：time_ 加 32 位随机字符。 */
const CODE_PATTERN = /^time_[A-Za-z0-9_-]{32}$/;
const CODE_RANDOM_LENGTH = 32;
const CODE_PREFIX = "time_";

/** 记录以其同步码为分区，一个码一个键。 */
const entriesKey = (code: string) => `entries/${code}`;
/** 同步码档案：是否有效、发给谁、创建时间。 */
const codeKey = (code: string) => `codes/${code}`;
/**
 * 全部同步码的清单，一个键保存数组。
 *
 * 为什么不直接 list()：KV 的 list 是最终一致的，新建的键可能几十秒内查不到，
 * 于是「刚建完的码立刻改备注」会报「没有找到」。get() 是强一致的，所以自己维护清单。
 */
const INDEX_KEY = "index/codes";

interface CodeRecord {
  label: string;
  createdAt: number;
  revokedAt: number | null;
  /** 最近一次成功写入的时间。 */
  lastSeenAt?: number;
  /** 该码当前保存的记录条数，写入时顺带更新；从未写入时不存在，按 0 看待。 */
  entryCount?: number;
}

interface EntriesPayload {
  revision: number;
  entries: TimeEntry[];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request.headers.get("Origin") ?? "", env.ALLOWED_ORIGINS);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const path = new URL(request.url).pathname;
    try {
      if (path === "/api/admin/codes" || path.startsWith("/api/admin/codes/")) {
        return await handleAdmin(request, env, path, cors);
      }
      if (path === "/api/entries") return await handleEntries(request, env, cors);
      return json({ error: "not_found" }, 404, cors);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: "storage_failed", message }, 500, cors);
    }
  },
};

/** 管理接口：只有持有 ADMIN_TOKEN 的人能创建、查看与吊销同步码。 */
async function handleAdmin(
  request: Request,
  env: Env,
  path: string,
  cors: Record<string, string>,
): Promise<Response> {
  if (!isAdminAuthorized(request, env)) return json({ error: "unauthorized" }, 401, cors);
  const suffix = path.slice("/api/admin/codes".length).replace(/^\//, "");
  const code = suffix === "" ? "" : decodeURIComponent(suffix);

  if (request.method === "POST" && code === "") {
    const body = (await readJson(request)) as { label?: unknown } | null;
    const label = typeof body?.label === "string" ? body.label.trim().slice(0, 60) : "";
    return json(await createCode(env, label), 200, cors);
  }
  if (request.method === "GET" && code === "") {
    return json({ codes: await listCodes(env) }, 200, cors);
  }
  // 改备注：码本身不变，只更新 label，便于事后辨认发给谁
  if (request.method === "PATCH" && code !== "") {
    const record = await readCodeRecord(env, code);
    if (!record) return json({ error: "code_not_found" }, 404, cors);
    const body = (await readJson(request)) as { label?: unknown } | null;
    if (typeof body?.label !== "string") return json({ error: "label_required" }, 400, cors);
    const label = body.label.trim().slice(0, 60);
    const next = { ...record, label };
    await env.TIME_SYNC.put(codeKey(code), JSON.stringify(next));
    await upsertIndex(env, code, next);
    return json({ code, ...next }, 200, cors);
  }
  // 启用（恢复被停用的码）：只清掉停用标记，数据完全没动过
  if (request.method === "POST" && code !== "" && new URL(request.url).searchParams.get("restore") === "1") {
    const record = await readCodeRecord(env, code);
    if (!record) return json({ error: "code_not_found" }, 404, cors);
    const next = { ...record, revokedAt: null };
    await env.TIME_SYNC.put(codeKey(code), JSON.stringify(next));
    await upsertIndex(env, code, next);
    return json({ code, ...next }, 200, cors);
  }
  if (request.method === "DELETE" && code !== "") {
    const record = await readCodeRecord(env, code);
    if (!record) return json({ error: "code_not_found" }, 404, cors);
    // 带 ?purge=1 时连数据一起删掉；默认只停用，数据留着，随时可以启用回来。
    const purge = new URL(request.url).searchParams.get("purge") === "1";
    if (purge) {
      await env.TIME_SYNC.delete(entriesKey(code));
      await env.TIME_SYNC.delete(codeKey(code));
      await dropFromIndex(env, code);
      return json({ code, purged: true }, 200, cors);
    }
    if (record.revokedAt === null) {
      const next = { ...record, revokedAt: Date.now() };
      await env.TIME_SYNC.put(codeKey(code), JSON.stringify(next));
      await upsertIndex(env, code, next);
      return json({ code, ...next }, 200, cors);
    }
    return json({ code, ...record }, 200, cors);
  }
  return json({ error: "method_not_allowed" }, 405, cors);
}

/** 数据接口：按请求头里的同步码分区读写。 */
async function handleEntries(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const code = readCode(request);
  if (!CODE_PATTERN.test(code)) return json({ error: "code_invalid" }, 400, cors);
  const record = await readCodeRecord(env, code);
  if (!record) return json({ error: "code_not_found" }, 401, cors);
  if (record.revokedAt !== null) return json({ error: "code_revoked" }, 401, cors);

  if (request.method === "GET") return json(await readEntries(env, code), 200, cors);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const incoming = await readIncoming(request);
  const stored = await readEntries(env, code);
  // 写入时顺手丢掉过期墓碑：保留期内要留着让离线设备知道自己删过什么，
  // 过期后就没用了，不清理会一直堆在 KV 里（以前两端都没真正删除过）。
  const merged = pruneTombstones(mergeEntries(incoming, stored.entries), Date.now());
  if (merged.length > MAX_ENTRIES_PER_CODE) {
    throw new Error(`记录数超过单码上限 ${MAX_ENTRIES_PER_CODE} 条，请先导出备份并清理历史记录`);
  }
  const next: EntriesPayload = { revision: Date.now(), entries: merged };
  await env.TIME_SYNC.put(entriesKey(code), JSON.stringify(next));
  // 记录条数与最近同步时间只写进清单，免得列表为了统计去读每份记录
  await upsertIndex(env, code, { ...record, lastSeenAt: next.revision, entryCount: merged.length });
  return json(next, 200, cors);
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("请求内容过大，请确认同步的是 Time 的记录数据");
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("请求内容不是有效的 JSON");
  }
}

async function readIncoming(request: Request): Promise<TimeEntry[]> {
  const payload = (await readJson(request)) as { entries?: unknown } | null;
  const rawEntries = payload?.entries;
  if (!Array.isArray(rawEntries)) throw new Error("请求缺少 entries 数组");
  const incoming = rawEntries.map(normalizeEntry);
  if (incoming.some((entry) => entry === null)) throw new Error("存在格式无效的记录，已拒绝写入");
  return incoming as TimeEntry[];
}

async function readEntries(env: Env, code: string): Promise<EntriesPayload> {
  const raw = await env.TIME_SYNC.get(entriesKey(code));
  if (raw === null) return { revision: 0, entries: [] };
  try {
    const parsed = JSON.parse(raw) as { revision?: unknown; entries?: unknown };
    const entries = Array.isArray(parsed.entries) ? parsed.entries.map(normalizeEntry) : [];
    return {
      revision: typeof parsed.revision === "number" ? parsed.revision : 0,
      entries: entries.filter((entry): entry is TimeEntry => entry !== null),
    };
  } catch {
    // 存的内容损坏时按空处理，避免把整个码卡死；下一次写入会覆盖成新快照。
    return { revision: 0, entries: [] };
  }
}

async function readCodeRecord(env: Env, code: string): Promise<CodeRecord | null> {
  const raw = await env.TIME_SYNC.get(codeKey(code));
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as CodeRecord;
  } catch {
    return null;
  }
}

interface IndexEntry {
  code: string;
  label: string;
  createdAt: number;
  revokedAt: number | null;
  lastSeenAt?: number;
  entryCount?: number;
}

async function readIndex(env: Env): Promise<IndexEntry[]> {
  const raw = await env.TIME_SYNC.get(INDEX_KEY);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as IndexEntry[]) : [];
  } catch {
    return [];
  }
}

const writeIndex = (env: Env, entries: IndexEntry[]) => env.TIME_SYNC.put(INDEX_KEY, JSON.stringify(entries));

/** 新增或就地更新清单里的一项。 */
async function upsertIndex(env: Env, code: string, record: CodeRecord): Promise<void> {
  const entries = await readIndex(env);
  const next: IndexEntry = { code, ...record };
  const at = entries.findIndex((item) => item.code === code);
  if (at >= 0) entries[at] = next;
  else entries.push(next);
  await writeIndex(env, entries);
}

/** 从清单里彻底移除一项，用于永久删除。 */
async function dropFromIndex(env: Env, code: string): Promise<void> {
  const entries = await readIndex(env);
  await writeIndex(
    env,
    entries.filter((item) => item.code !== code),
  );
}

/** 生成一个随机同步码；撞码（概率极低）时重试。 */
async function createCode(env: Env, label: string): Promise<{ code: string } & CodeRecord> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = CODE_PREFIX + randomString(CODE_RANDOM_LENGTH);
    if ((await env.TIME_SYNC.get(codeKey(code))) !== null) continue;
    const record: CodeRecord = { label, createdAt: Date.now(), revokedAt: null };
    await env.TIME_SYNC.put(codeKey(code), JSON.stringify(record));
    await upsertIndex(env, code, record);
    return { code, ...record };
  }
  throw new Error("生成同步码失败，请重试");
}

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "";
  for (const byte of bytes) result += alphabet[byte % alphabet.length];
  return result;
}

/**
 * 列出全部同步码，读自索引键（强一致）。
 *
 * 索引为空时回退到 list() 建一次索引：索引是后加的，之前建的码不在里面。
 * list() 是最终一致的，但这时已经没有别的办法找到它们；建好索引后就走强一致路径。
 * 档案已不存在的项会被清掉，避免清单越积越脏。
 */
async function listCodes(env: Env) {
  let indexed = await readIndex(env);
  let changed = false;

  if (indexed.length === 0) {
    indexed = await bootstrapIndex(env);
    changed = indexed.length > 0;
  }

  const kept: IndexEntry[] = [];
  for (const item of indexed) {
    const record = await readCodeRecord(env, item.code);
    if (!record) {
      // 档案已经没了（例如在 Dashboard 里手工删过），从清单里去掉
      changed = true;
      continue;
    }
    // lastSeenAt 与 entryCount 只存在清单里，档案没有这两个字段
    kept.push({ ...item, ...record, code: item.code });
  }

  if (changed) await writeIndex(env, kept);
  return kept.sort((left, right) => right.createdAt - left.createdAt);
}

/** 从 codes/ 前缀扫描出全部码，用于建立初始索引。 */
async function bootstrapIndex(env: Env): Promise<IndexEntry[]> {
  const listed = await env.TIME_SYNC.list({ prefix: "codes/" });
  const built: IndexEntry[] = [];
  for (const key of listed.keys) {
    const code = key.name.slice("codes/".length);
    const record = await readCodeRecord(env, code);
    if (record) built.push({ code, ...record });
  }
  if (built.length > 0) await writeIndex(env, built);
  return built;
}
