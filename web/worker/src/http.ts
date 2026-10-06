export interface Env {
  /** D1 绑定。名字必须与 wrangler.toml 的 binding 完全一致。 */
  time_sync: D1Database;
  /** 与前端设置页填写的访问口令一致，用 `wrangler secret put SYNC_TOKEN` 写入。 */
  SYNC_TOKEN: string;
  /** 可选：限定允许访问的前端来源，多个用逗号分隔。 */
  ALLOWED_ORIGINS?: string;
}

export const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export function json(payload: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...JSON_HEADERS, ...cors } });
}

/** 允许的页面来源：默认放行 GitHub Pages 站点、本站预览端口与网站版开发端口。 */
export function corsHeaders(origin: string, allowed?: string): Record<string, string> {
  const list = (allowed ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const defaults = [
    "https://zgzlcc.github.io",
    // 相册站点的 dev / preview 端口，本地整站联调时使用
    "http://localhost:4321",
    "http://localhost:4322",
    "http://127.0.0.1:4321",
    "http://127.0.0.1:4322",
    // 网站版自身的开发与预览端口
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5180",
    "http://127.0.0.1:5181",
    "http://localhost:5173",
    "http://localhost:5180",
    "http://localhost:5181",
  ];
  const permitted = list.length > 0 ? list : defaults;
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Time-Token",
    "Access-Control-Max-Age": "86400",
  };
  if (permitted.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

/** 定长比较，避免用普通字符串比较泄露口令长度信息。 */
function safeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

/** 未配置口令时一律拒绝，避免误把数据开放出去。 */
export function isAuthorized(request: Request, env: Env): boolean {
  const expected = env.SYNC_TOKEN ?? "";
  if (expected === "") return false;
  const provided = request.headers.get("X-Time-Token") ?? "";
  return provided !== "" && safeEqual(provided, expected);
}
