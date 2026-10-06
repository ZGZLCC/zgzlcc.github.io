/**
 * 浏览器实测用的假 Worker：实现与 worker/src/index.ts 相同的接口与合并规则，
 * 但不依赖 Cloudflare，用于在本地验证前端的推送与恢复链路。
 */
import { createServer } from "node:http";

const CODE = "time_b7xK2mQ9wZ4nR8tY6uP3sL5vC1aD0eFg";
const MAX_BODY_BYTES = 2_000_000;
/** 与线上一致：只有更新的版本才允许覆盖已有行。 */
const rows = new Map();

function normalize(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw;
  if (typeof value.id !== "string" || value.id === "" || value.id.length > 64) return null;
  if (value.state !== "completed" && value.state !== "draft") return null;
  if (typeof value.content !== "string") return null;
  const tag = value.tag;
  if (!(tag === null || ["work", "leisure", "sleep", "other"].includes(tag))) return null;
  return {
    id: value.id,
    startMs: value.startMs ?? null,
    endMs: value.endMs ?? null,
    startDate: value.startDate ?? null,
    endDate: value.endDate ?? null,
    content: value.content,
    tag,
    state: value.state,
    updatedAt: value.updatedAt ?? 0,
    deletedAt: value.deletedAt ?? null,
  };
}

function merged() {
  return [...rows.values()].sort(
    (left, right) =>
      (right.startMs ?? right.endMs ?? Number.NEGATIVE_INFINITY) -
        (left.startMs ?? left.endMs ?? Number.NEGATIVE_INFINITY) || left.id.localeCompare(right.id),
  );
}

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Time-Code",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  response.end(body);
}

/** 启动假 Worker，返回地址与当前保存的记录。 */
export function startMockWorker(options = {}) {
  const testFiles = options.testFiles ?? new Map();
  const server = createServer((request, response) => {
    if (request.method === "OPTIONS") {
      send(response, 204, {});
      return;
    }
    // 仅在实测中使用：把本地导出的备份文件提供给页面，用于验证导入流程。
    if (request.url?.startsWith("/api/test-download/")) {
      const name = decodeURIComponent(request.url.slice("/api/test-download/".length));
      const content = testFiles.get(name);
      if (content === undefined) {
        send(response, 404, { error: "test_file_not_found", name });
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      response.end(content);
      return;
    }
    if (request.url !== "/api/entries") {
      send(response, 404, { error: "not_found" });
      return;
    }
    if (request.headers["x-time-code"] !== CODE) {
      send(response, 401, { error: "unauthorized" });
      return;
    }
    if (request.method === "GET") {
      send(response, 200, { revision: Date.now(), entries: merged() });
      return;
    }
    if (request.method !== "POST") {
      send(response, 405, { error: "method_not_allowed" });
      return;
    }
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) request.destroy();
    });
    request.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        send(response, 500, { error: "invalid_json" });
        return;
      }
      if (!Array.isArray(payload?.entries)) {
        send(response, 500, { error: "missing_entries" });
        return;
      }
      const incoming = payload.entries.map(normalize);
      if (incoming.some((entry) => entry === null)) {
        send(response, 500, { error: "invalid_entry" });
        return;
      }
      for (const entry of incoming) {
        const current = rows.get(entry.id);
        if (current === undefined || entry.updatedAt > current.updatedAt) rows.set(entry.id, entry);
      }
      send(response, 200, { revision: Date.now(), entries: merged() });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        endpoint: `http://127.0.0.1:${port}`,
        code: CODE,
        rows,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
