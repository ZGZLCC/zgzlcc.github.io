// 本地预览用的静态服务器，零依赖：只在 node:http 上把 wealth/ 目录发出去。
// 部署到 GitHub Pages 后不需要它，直接用 `npm run dev` 复现 /wealth/ 的路径行为。
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT ?? 5182);
const HOST = process.env.HOST ?? "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

/** 把 URL 路径解析成 ROOT 内的绝对路径；越界一律当作 404，别把整个磁盘发出去。 */
function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = normalize(decoded).replace(/^([/\\])+/, "");
  const full = join(ROOT, relative);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  return full;
}

async function sendFile(res, filePath) {
  const type = MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  createReadStream(filePath).pipe(res);
}

async function handle(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" });
    res.end("只支持 GET");
    return;
  }

  let target = resolvePath(req.url ?? "/");
  if (target === null) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("路径超出预览目录");
    return;
  }

  let info = await stat(target).catch(() => null);
  if (info?.isDirectory()) {
    target = join(target, "index.html");
    info = await stat(target).catch(() => null);
  }

  if (!info?.isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("这里没有页面，回到 / 看看。");
    return;
  }

  await sendFile(res, target);
}

createServer((req, res) => {
  handle(req, res).catch((error) => {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(`服务器出错：${error.message}`);
  });
}).listen(PORT, HOST, () => {
  console.log(`财富自由计算器：http://${HOST}:${PORT}/`);
});
