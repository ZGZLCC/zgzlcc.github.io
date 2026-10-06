/**
 * 构建产物检查：确认 dist 存在、入口与资源都存在，
 * 并且资源引用都指向部署子目录 /time/，可以直接放进站点的 time 目录。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

assert.ok(existsSync(dist), "缺少 dist 目录，请先执行 npm run build");

const html = readFileSync(join(dist, "index.html"), "utf8");
const assets = readdirSync(join(dist, "assets"));
const scripts = assets.filter((name) => name.endsWith(".js"));
const styles = assets.filter((name) => name.endsWith(".css"));

assert.ok(scripts.length > 0, "dist/assets 中缺少 JavaScript 产物");
assert.ok(styles.length > 0, "dist/assets 中缺少 CSS 产物");
assert.ok(existsSync(join(dist, "icon.svg")), "dist 中缺少 icon.svg");
for (const name of [...scripts, ...styles]) {
  assert.ok(html.includes(`/time/assets/${name}`), `index.html 未按 /time/ 引用 ${name}`);
}

const absolute = [...html.matchAll(/(?:src|href)="(\/[^/][^"]*)"/g)]
  .map((match) => match[1])
  .filter((path) => !path.startsWith("/time/"));
assert.deepEqual(absolute, [], `index.html 存在 /time/ 之外的绝对路径引用：${absolute.join("、")}`);

const bundle = readFileSync(join(dist, "assets", scripts[0]), "utf8");
assert.ok(!bundle.includes("@tauri-apps"), "产物中不应包含桌面版依赖");
assert.ok(bundle.includes("indexedDB"), "产物中应包含 IndexedDB 存储实现");

console.log(`构建产物检查通过：${scripts.length} 个脚本、${styles.length} 个样式，均按 /time/ 引用。`);
