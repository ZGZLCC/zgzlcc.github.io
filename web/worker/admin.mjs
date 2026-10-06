#!/usr/bin/env node
/**
 * 同步码管理工具：创建、查看、停用/启用、彻底删除。
 *
 * 用法（在 web/worker 目录下执行）：
 *   node admin.mjs                          显示帮助
 *   node admin.mjs status                   检查地址、口令与代理连通性
 *   node admin.mjs list                     列出全部同步码
 *   node admin.mjs create 张三               创建一个码，备注写清发给谁
 *   node admin.mjs show time_xxx            查看某个码的详情
 *   node admin.mjs rename time_xxx 李四      修改备注（也可写现有备注代替码）
 *   node admin.mjs revoke time_xxx          停用（数据保留，可随时启用回来）
 *   node admin.mjs restore time_xxx         启用（恢复被停用的码）
 *   node admin.mjs purge time_xxx           彻底删除（连数据一起删，不可恢复）
 *
 * 需要先设置管理口令与服务地址：
 *   $env:TIME_SYNC_ADMIN = "你的 ADMIN_TOKEN"
 *   $env:TIME_SYNC_URL   = "https://time-sync.zgzlcc.workers.dev"   # 可省略，默认值见下
 *
 * 代理：自动识别 HTTPS_PROXY / ALL_PROXY，其次读 Windows 系统代理设置。
 * 本机的 fetch 不读系统代理，直连会被 *.workers.dev 的 DNS 污染挡住，所以自己处理。
 */
import { detectProxy, sendRequest } from "./http.mjs";

const DEFAULT_URL = "https://time-sync.zgzlcc.workers.dev";

const base = (process.env.TIME_SYNC_URL || DEFAULT_URL).replace(/\/+$/, "");
const adminToken = process.env.TIME_SYNC_ADMIN || "";
const [action, argument, second] = process.argv.slice(2);

const HELP = `同步码管理

  node admin.mjs status              检查地址、口令与代理连通性
  node admin.mjs list                列出全部同步码
  node admin.mjs create <备注名>      创建新同步码
  node admin.mjs show <码|备注>       查看详情
  node admin.mjs rename <码|备注> <新备注>  修改备注
  node admin.mjs revoke <码|备注>     停用（数据保留，可启用回来）
  node admin.mjs restore <码|备注>    启用（恢复被停用的码）
  node admin.mjs purge <码|备注>      彻底删除（连数据一起删）

查看与停用/启用/删除都可以用同步码或备注来指定。

前置条件：
  $env:TIME_SYNC_ADMIN = "你的 ADMIN_TOKEN"
  $env:TIME_SYNC_URL   = "${DEFAULT_URL}"   # 可省略
`;

const ACTIONS = ["list", "create", "show", "rename", "revoke", "restore", "purge"];

function fail(message) {
  console.error(`错误：${message}`);
  process.exit(1);
}

/** 北京时间，格式 YYYY-MM-DD HH:mm。 */
function formatTime(timestamp) {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return "—";
  return new Date(timestamp + 8 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
}

const proxy = detectProxy();

async function call(path, init = {}) {
  let result;
  try {
    result = await sendRequest({
      url: `${base}${path}`,
      method: init.method ?? "GET",
      body: init.body,
      proxy: proxy.url,
      headers: { "X-Time-Admin": adminToken, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
  } catch (error) {
    const hint = proxy.url
      ? `已尝试通过代理 ${proxy.url}（来源：${proxy.source}）连接。`
      : "没有检测到代理。如果是国内网络，*.workers.dev 被 DNS 污染，需要在系统里开启代理，或设置 HTTPS_PROXY / TIME_SYNC_PROXY。";
    fail(`连不上 ${base}：${error instanceof Error ? error.message : error}\n${hint}`);
  }
  let payload = null;
  try {
    payload = result.body === "" ? null : JSON.parse(result.body);
  } catch {
    payload = result.body;
  }
  if (result.status === 401) {
    fail("管理口令不对。请确认本地口令与 Worker 上的 ADMIN_TOKEN 完全一致。");
  }
  if (result.status < 200 || result.status >= 300) {
    const detail = typeof payload === "string" ? payload : JSON.stringify(payload);
    fail(`请求失败（HTTP ${result.status}）：${detail}`);
  }
  return payload;
}

function printCode(item, index) {
  const state = item.revokedAt === null ? "启用中" : `已停用（${formatTime(item.revokedAt)}）`;
  // 从未写入过的码没有 entryCount 字段，那是 0 条而不是未知
  const count = `${typeof item.entryCount === "number" ? item.entryCount : 0} 条`;
  const seen = item.lastSeenAt ? formatTime(item.lastSeenAt) : "从未同步";
  console.log(`  ${index === undefined ? "" : `${index + 1}. `}${item.code}`);
  console.log(`     备注：${item.label || "（无）"}`);
  console.log(`     创建：${formatTime(item.createdAt)}    状态：${state}`);
  console.log(`     记录：${count}    最近同步：${seen}`);
}

async function findAllCodes() {
  const { codes } = await call("/api/admin/codes");
  return codes ?? [];
}

/** 支持用同步码或备注查找：先精确匹配码，再匹配备注。 */
async function resolveCodes(query) {
  const codes = await findAllCodes();
  const wanted = query.trim();
  const byCode = codes.filter((item) => item.code === wanted);
  if (byCode.length > 0) return byCode;
  return codes.filter((item) => item.label === wanted);
}

/** 把「码或备注」解析成唯一一个码；失败时直接退出并说明原因。 */
async function requireOneCode(query) {
  const matched = await resolveCodes(query);
  if (matched.length === 0) {
    fail(
      `没有找到「${query.trim()}」。用 node admin.mjs list 看看都有哪些；` +
        "同步码要以 time_ 开头，备注要与创建时完全一致。",
    );
  }
  if (matched.length > 1) {
    fail(`有 ${matched.length} 个码使用了备注「${query.trim()}」，请改用同步码指定其中一个。`);
  }
  return matched[0];
}

/** 连通性检查：地址、口令、代理各报一行，最后真实请求一次。 */
async function showStatus() {
  console.log(`服务地址：${base}`);
  console.log(`管理口令：${adminToken ? "已配置" : "未配置"}`);
  console.log(`代理：${proxy.url ? `${proxy.url}（${proxy.source}）` : "未检测到"}`);

  try {
    const result = await sendRequest({
      url: `${base}/api/admin/codes`,
      proxy: proxy.url,
      headers: adminToken ? { "X-Time-Admin": adminToken } : {},
    });
    if (result.status === 401) {
      console.log("连通性：服务可访问，鉴权生效");
    } else if (result.status >= 200 && result.status < 300) {
      console.log(`连通性：服务可访问，仅返回 HTTP ${result.status}（${adminToken ? "口令有效" : "未带口令却通过了，请检查 Worker" }）`);
    } else {
      console.log(`连通性：服务返回 HTTP ${result.status}`);
    }
  } catch (error) {
    console.log(`连通性：连不上 —— ${error instanceof Error ? error.message : error}`);
    if (!proxy.url) {
      console.log("  没有检测到代理。国内访问 *.workers.dev 会被 DNS 污染，需要在系统里开代理，或设置 HTTPS_PROXY。");
    } else {
      console.log("  已尝试走上面的代理。若仍失败，检查代理是否在运行、或换一个地址试试。");
    }
  }
}

if (ACTIONS.includes(action) && adminToken === "") {
  fail(
    "缺少管理口令。请先设置环境变量：\n" +
      '  $env:TIME_SYNC_ADMIN = "你的 ADMIN_TOKEN"',
  );
}

switch (action) {
  case "status": {
    await showStatus();
    break;
  }

  case "list": {
    const codes = await findAllCodes();
    if (codes.length === 0) {
      console.log("还没有任何同步码。用 `node admin.mjs create 备注名` 创建一个。");
      break;
    }
    const active = codes.filter((item) => item.revokedAt === null).length;
    console.log(`共 ${codes.length} 个同步码（启用中 ${active} 个，已停用 ${codes.length - active} 个）：\n`);
    codes.forEach((item, index) => printCode(item, index));
    console.log("\n把码发给对方后，对方填进网站设置页的「同步码」即可。");
    break;
  }

  case "create": {
    const label = (argument || "").trim();
    const created = await call("/api/admin/codes", { method: "POST", body: JSON.stringify({ label }) });
    console.log("同步码已创建：\n");
    console.log(`  ${created.code}\n`);
    console.log(`备注：${created.label || "（无）"}`);
    console.log("\n发给对方时附上两句：");
    console.log("  1. 把码填进设置页的「同步码」，点保存配置");
    console.log("  2. 请定期在设置页导出 JSON 备份，云端只是第二份副本");
    break;
  }

  case "show": {
    if (!argument) fail("请给出同步码或备注。");
    const matched = await resolveCodes(argument);
    if (matched.length === 0) {
      fail(
        `没有找到「${argument.trim()}」。用 node admin.mjs list 看看都有哪些；` +
          "同步码要以 time_ 开头，备注要与创建时完全一致。",
      );
    }
    if (matched.length > 1) {
      console.log(`有 ${matched.length} 个码使用了备注「${argument.trim()}」，全部列出：\n`);
    }
    matched.forEach((item, index) => printCode(item, matched.length > 1 ? index : undefined));
    break;
  }

  case "rename": {
    if (!argument) fail("请给出同步码或备注。");
    if (second === undefined) fail("请给出新的备注，例如：node admin.mjs rename time_xxx 李四");
    // 和 show/revoke/restore 一样，允许用现有备注定位，否则只能靠手抄那串长码
    const target = await requireOneCode(argument);
    const updated = await call(`/api/admin/codes/${encodeURIComponent(target.code)}`, {
      method: "PATCH",
      body: JSON.stringify({ label: second }),
    });
    console.log(`已把 ${updated.code} 的备注从「${target.label || "无"}」改为「${updated.label || "无"}」。`);
    break;
  }

  case "revoke": {
    if (!argument) fail("请给出同步码或备注。");
    const target = await requireOneCode(argument);
    if (target.revokedAt !== null) {
      console.log(`${target.code}（备注：${target.label || "无"}）本来就是停用状态。`);
      break;
    }
    await call(`/api/admin/codes/${encodeURIComponent(target.code)}`, { method: "DELETE" });
    console.log(`已停用 ${target.code}（备注：${target.label || "无"}）。`);
    console.log("对方立刻无法同步；云端数据一条都没动，随时可以 restore 启用回来。");
    break;
  }

  case "restore": {
    if (!argument) fail("请给出同步码或备注。");
    const target = await requireOneCode(argument);
    if (target.revokedAt === null) {
      console.log(`${target.code}（备注：${target.label || "无"}）本来就是启用状态。`);
      break;
    }
    await call(`/api/admin/codes/${encodeURIComponent(target.code)}?restore=1`, { method: "POST" });
    console.log(`已启用 ${target.code}（备注：${target.label || "无"}）。`);
    console.log("对方用原来的码就能继续同步，数据仍在。");
    break;
  }

  case "purge": {
    if (!argument) fail("请给出同步码或备注。");
    const target = await requireOneCode(argument);
    const code = target.code;
    if (!process.argv.includes("--yes")) {
      const count = typeof target.entryCount === "number" ? target.entryCount : 0;
      console.log(`即将永久删除 ${code}（备注：${target.label || "无"}，含 ${count} 条记录）。`);
      console.log("删除后不再出现在列表里，此操作不可恢复。");
      console.log("确认无误请重新执行并加上 --yes：");
      console.log(`  node admin.mjs purge ${code} --yes`);
      break;
    }
    await call(`/api/admin/codes/${encodeURIComponent(code)}?purge=1`, { method: "DELETE" });
    console.log(`已彻底删除 ${code} 及其数据。`);
    break;
  }

  default:
    console.log(HELP);
    break;
}
