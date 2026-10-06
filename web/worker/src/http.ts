export interface Env {
  /** KV 绑定：一个同步码一个键。名字必须与 wrangler.toml 的 binding 完全一致。 */
  TIME_SYNC: KVNamespace;
  /** 管理口令，只有持有者能创建、查看与吊销同步码。用 `wrangler secret put ADMIN_TOKEN` 写入。 */
  ADMIN_TOKEN: string;
  /** 旧版单租户口令，仅用于提示迁移；不再参与鉴权。 */
  SYNC_TOKEN?: string;
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
    // Tauri 桌面版：WebView 发出的 Origin 就是这几个，不放行的话浏览器会拦掉响应，
    // 表现为「网页版能同步、桌面版连不上」。这与页面地址无关，是来源校验。
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    // Tauri 开发模式：vite dev server 的默认端口
    "http://localhost:1420",
    "http://127.0.0.1:1420",
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
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Time-Admin, X-Time-Code",
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

/** 管理接口鉴权：未配置管理口令时一律拒绝。 */
export function isAdminAuthorized(request: Request, env: Env): boolean {
  const expected = env.ADMIN_TOKEN ?? "";
  if (expected === "") return false;
  const provided = request.headers.get("X-Time-Admin") ?? "";
  return provided !== "" && safeEqual(provided, expected);
}

/** 读取请求里的同步码；同步码是数据分区标识，不是密钥，因此不做定长比较。 */
export function readCode(request: Request): string {
  return (request.headers.get("X-Time-Code") ?? "").trim();
}
