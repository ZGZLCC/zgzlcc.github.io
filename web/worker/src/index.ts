import type { TimeEntry } from "../../src/core/entries";
import { mergeEntries, normalizeEntry, rowToEntry } from "./entries";
import { corsHeaders, isAuthorized, json, type Env } from "./http";

/** 单次请求体上限，避免异常客户端把整份数据撑爆。 */
const MAX_BODY_BYTES = 2_000_000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request.headers.get("Origin") ?? "", env.ALLOWED_ORIGINS);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (new URL(request.url).pathname !== "/api/entries") {
      return json({ error: "not_found" }, 404, cors);
    }
    if (!isAuthorized(request, env)) {
      return json({ error: "unauthorized" }, 401, cors);
    }

    try {
      if (request.method === "GET") return json(await readAll(env), 200, cors);
      if (request.method === "POST") return json(await mergeAndStore(request, env), 200, cors);
      return json({ error: "method_not_allowed" }, 405, cors);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: "storage_failed", message }, 500, cors);
    }
  },
};

/** D1 绑定；名字与 wrangler.toml 的 binding 一致。 */
function database(env: Env): D1Database {
  return env.time_sync;
}

async function readAll(env: Env): Promise<{ revision: number; entries: TimeEntry[] }> {
  const db = database(env);
  const [rows, meta] = await db.batch([
    db.prepare(
      "SELECT id, start_ms, end_ms, start_date, end_date, content, tag, state, updated_at, deleted_at FROM entries",
    ),
    db.prepare("SELECT value FROM meta WHERE key = 'revision'"),
  ]);
  const entries = (rows.results ?? [])
    .map((row) => rowToEntry(row as Record<string, unknown>))
    .filter((entry): entry is TimeEntry => entry !== null);
  const revisionRow = (meta.results ?? [])[0] as { value?: unknown } | undefined;
  const revision = typeof revisionRow?.value === "string" ? Number(revisionRow.value) || 0 : 0;
  return { revision, entries };
}

/** 读取请求里的记录，任一条格式非法就整份拒绝，不写入半份数据。 */
async function readIncoming(request: Request): Promise<TimeEntry[]> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new Error("请求内容过大，请确认同步的是 Time 的记录数据");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("请求内容不是有效的 JSON");
  }
  const rawEntries = (payload as { entries?: unknown })?.entries;
  if (!Array.isArray(rawEntries)) throw new Error("请求缺少 entries 数组");
  const incoming = rawEntries.map(normalizeEntry);
  if (incoming.some((entry) => entry === null)) throw new Error("存在格式无效的记录，已拒绝写入");
  return incoming as TimeEntry[];
}

async function mergeAndStore(request: Request, env: Env): Promise<{ revision: number; entries: TimeEntry[] }> {
  const db = database(env);
  const incoming = await readIncoming(request);
  const existing = (await readAll(env)).entries;
  const merged = mergeEntries(incoming, existing);
  const revision = Date.now();
  const statements = [
    ...merged.map((entry) => upsert(db, entry)),
    db
      .prepare("INSERT INTO meta (key, value) VALUES ('revision', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1")
      .bind(String(revision)),
  ];
  await db.batch(statements);
  return { revision, entries: merged };
}

/** 只有更新的版本才能覆盖已有行，防止旧客户端把云端较新的记录写回去。 */
function upsert(db: D1Database, entry: TimeEntry) {
  return db
    .prepare(
      `INSERT INTO entries (id, start_ms, end_ms, start_date, end_date, content, tag, state, updated_at, deleted_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
     ON CONFLICT(id) DO UPDATE SET
       start_ms = ?2, end_ms = ?3, start_date = ?4, end_date = ?5, content = ?6,
       tag = ?7, state = ?8, updated_at = ?9, deleted_at = ?10
     WHERE ?9 > entries.updated_at`,
    )
    .bind(
      entry.id,
      entry.startMs,
      entry.endMs,
      entry.startDate,
      entry.endDate,
      entry.content,
      entry.tag,
      entry.state,
      entry.updatedAt,
      entry.deletedAt,
    );
}
