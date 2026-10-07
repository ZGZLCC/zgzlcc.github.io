/**
 * 浏览器实测：用 Chrome DevTools Protocol 驱动无头 Edge，
 * 在真实页面上验证记录、打卡、编辑、重叠提示、确认弹窗样式、周视图、主题持久化、
 * JSON 备份导出与恢复、PNG 下载、备份提醒以及云端推送与恢复。
 *
 * 用法：先执行 npm run build，再执行本脚本（静态服务由脚本自行启停）。
 * 环境变量：TIMEWEB_URL 覆盖页面地址，TIMEWEB_DOWNLOADS 指定下载目录。
 */
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startMockWorker } from "./mock-worker.mjs";

const URL_UNDER_TEST = process.env.TIMEWEB_URL ?? "http://127.0.0.1:5181/time/";
const URL_UNDER_TEST_BASE = URL_UNDER_TEST.endsWith("/") ? URL_UNDER_TEST : `${URL_UNDER_TEST}/`;
const DOWNLOAD_DIR = process.env.TIMEWEB_DOWNLOADS ?? join(tmpdir(), `timeweb-downloads-${process.pid}`);
/** 供页面取回的测试文件（当前只有导出的备份），仅存在于实测进程内。 */
const testFiles = new Map();
const EDGE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

const results = [];
let session = null;

class CdpError extends Error {}

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  const mark = passed ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? `  ${detail}` : ""}`);
}

/** 只实现 CDP 需要的文本帧，避免引入运行时依赖。 */
class WebSocketClient {
  constructor(url) {
    const parsed = new URL(url);
    this.host = parsed.hostname;
    this.port = Number(parsed.port || 80);
    this.path = `${parsed.pathname}${parsed.search}`;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = randomBytes(16).toString("base64");
      const expected = createHash("sha1")
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest("base64");
      const socket = connect(this.port, this.host);
      this.socket = socket;
      socket.on("error", reject);
      socket.on("connect", () => {
        socket.write(
          `GET ${this.path} HTTP/1.1\r\nHost: ${this.host}:${this.port}\r\nUpgrade: websocket\r\n` +
            `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
        );
      });
      let handshake = "";
      const onHandshake = (chunk) => {
        handshake += chunk.toString("latin1");
        const end = handshake.indexOf("\r\n\r\n");
        if (end === -1) return;
        socket.off("data", onHandshake);
        if (!handshake.includes(expected)) {
          reject(new CdpError("WebSocket 握手校验失败"));
          return;
        }
        socket.on("data", (data) => this.#onData(data));
        resolve();
      };
      socket.on("data", onHandshake);
    });
  }

  #onData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    for (;;) {
      if (this.buffer.length < 2) return;
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        length = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }
      if (this.buffer.length < offset + length) return;
      const payload = this.buffer.subarray(offset, offset + length);
      this.buffer = this.buffer.subarray(offset + length);
      if (opcode === 0x8) return;
      if (opcode === 0x9) {
        continue;
      }
      this.fragments.push(payload);
      if (!fin) continue;
      const text = Buffer.concat(this.fragments).toString("utf8");
      this.fragments = [];
      this.#dispatch(text);
    }
  }

  #dispatch(text) {
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (message.id !== undefined && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new CdpError(`${message.error.message} (${message.method ?? ""})`));
      else resolve(message.result);
      return;
    }
    for (const listener of this.listeners) listener(message);
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.#write(JSON.stringify(payload));
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  #write(text) {
    const payload = Buffer.from(text, "utf8");
    const mask = randomBytes(4);
    const length = payload.length;
    let header;
    if (length < 126) {
      header = Buffer.from([0x81, 0x80 | length]);
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    const masked = Buffer.allocUnsafe(length);
    for (let index = 0; index < length; index += 1) {
      masked[index] = payload[index] ^ mask[index % 4];
    }
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  on(listener) {
    this.listeners.add(listener);
  }

  close() {
    this.socket?.destroy();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function isServerReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** 页面地址没人服务时自行启动 `vite preview`，结束后关闭。 */
async function ensureServer(projectRoot) {
  if (await isServerReady(URL_UNDER_TEST)) return null;
  const host = new URL(URL_UNDER_TEST).hostname;
  const port = new URL(URL_UNDER_TEST).port || "80";
  const executable = process.execPath;
  const vite = join(projectRoot, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(executable, [vite, "preview", "--host", host, "--port", port, "--strictPort"], {
    cwd: projectRoot,
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await isServerReady(URL_UNDER_TEST)) return child;
    await sleep(250);
  }
  child.kill();
  throw new Error(`静态服务未能在 ${URL_UNDER_TEST} 就绪，请先执行 npm run build`);
}

async function launchBrowser(profileDir) {
  const executable = EDGE_CANDIDATES.find((path) => existsSync(path));
  if (!executable) throw new Error("未找到 Edge 或 Chrome");
  const port = 9334;
  const child = spawn(
    executable,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      "--remote-allow-origins=*",
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-component-update",
      "--disable-background-networking",
      "--disable-sync",
      "--window-size=1280,900",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const endpoint = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const info = await fetch(`${endpoint}/json/version`).then((response) => response.json());
      return { child, endpoint, info };
    } catch {
      await sleep(250);
    }
  }
  child.kill();
  throw new Error("浏览器调试端口未就绪");
}

async function attach(endpoint, pageUrl) {
  const target = await fetch(`${endpoint}/json/new?${encodeURIComponent(pageUrl)}`, {
    method: "PUT",
  }).then((response) => response.json());
  const client = new WebSocketClient(target.webSocketDebuggerUrl);
  await client.connect();
  const { sessionId } = await client.send("Target.attachToTarget", { targetId: target.id, flatten: true });
  return { client, sessionId, targetId: target.id };
}

/** 记录日期取"今天"，保证周视图默认就落在记录所在的那一周。 */
function shiftIsoDate(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function weekOf(date) {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const monday = new Date(utc.getTime() - ((utc.getUTCDay() + 6) % 7) * 86_400_000);
  return { start: monday.toISOString().slice(0, 10), end: shiftIsoDate(monday.toISOString().slice(0, 10), 6) };
}

async function evaluate(expression) {
  const response = await session.client.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    session.sessionId,
  );
  if (response.exceptionDetails) {
    const text = response.exceptionDetails.exception?.description ?? response.exceptionDetails.text;
    throw new Error(`页面脚本异常：${text}\n表达式：${expression.slice(0, 160)}`);
  }
  return response.result.value;
}

async function clickByText(scope, text) {
  return evaluate(`(() => {
    const nodes = [...document.querySelectorAll(${JSON.stringify(scope)})];
    const target = nodes.find((node) => node.textContent.trim() === ${JSON.stringify(text)});
    if (!target) throw new Error("找不到按钮：" + ${JSON.stringify(text)});
    target.click();
    return true;
  })()`);
}

async function typeInto(selector, value, eventName = "input") {
  return evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    if (!field) throw new Error("找不到输入框：" + ${JSON.stringify(selector)});
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event(${JSON.stringify(eventName)}, { bubbles: true }));
    return true;
  })()`);
}

/** 写入表单字段：绕开框架缓存，并依次派发 input 与 change。 */
function fillExpression(elementExpression, value) {
  return `(() => {
    const field = ${elementExpression};
    if (!field) throw new Error('表单缺少目标输入框');
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return field.value;
  })()`;
}

const pickField = (legend, type) =>
  `[...document.querySelectorAll('fieldset.date-time-field')].find((node) => node.querySelector('legend').textContent.includes(${JSON.stringify(legend)}))?.querySelector('input[type=${type}]')`;

/** 定位某一组「开始/结束时间」的 fieldset。 */
const pickGroup = (legend) =>
  `[...document.querySelectorAll('fieldset.date-time-field')].find((node) => node.querySelector('legend').textContent.includes(${JSON.stringify(legend)}))`;

/**
 * 填日期：打开自绘日历，翻到目标月份后点具体那一天。
 * 日历是自绘的，没有原生 input[type=date] 可以赋值。
 */
async function fillDate(legend, value) {
  const target = `${value.slice(0, 7)}`;
  await evaluate(`(() => {
    const group = ${pickGroup(legend)};
    const trigger = group?.querySelector('.date-picker-trigger');
    if (!trigger) throw new Error('缺少日期选择按钮');
    trigger.click();
    return true;
  })()`);
  await waitFor(`${pickGroup(legend)}?.querySelector('.date-picker-popover') !== null`, "日期面板打开");

  // 翻月份：标题形如 2026年10月，对不上就点上一月／下一月
  for (let step = 0; step < 36; step += 1) {
    const label = await evaluate(`${pickGroup(legend)}.querySelector('.date-picker-month').textContent.trim()`);
    const wanted = `${Number(target.slice(0, 4))}年${Number(target.slice(5, 7))}月`;
    if (label === wanted) break;
    const forward = label < wanted;
    await evaluate(`${pickGroup(legend)}.querySelector('[aria-label="${forward ? "下个月" : "上个月"}"]').click()`);
    await sleep(80);
  }

  const clicked = await evaluate(`(() => {
    const group = ${pickGroup(legend)};
    const day = group.querySelector('[data-date="${value}"]');
    if (!day) throw new Error('日历里没有这一天');
    day.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`日期未选中：${legend} → ${value}`);
  await waitFor(`${pickGroup(legend)}?.querySelector('.date-picker-popover') === null`, "日期面板关闭");
}

/**
 * 填时间：打开滚动选择器，在两列竖条里点中目标时与分。
 * 列表渲染三份，所以取中间那份的按钮，避免点到外侧那份。
 */
async function fillTime(legend, value) {
  const wantHour = JSON.stringify(value.slice(0, 2));
  const wantMinute = JSON.stringify(value.slice(3, 5));
  const clicked = await evaluate(`(() => {
    const group = ${pickGroup(legend)};
    const trigger = group?.querySelector('.time-field-trigger');
    if (!trigger) throw new Error('缺少时间选择按钮');
    trigger.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`时间面板打不开：${legend}`);
  await waitFor(`${pickGroup(legend)}?.querySelector('.time-wheel-list') !== null`, "时间面板打开");

  const applied = await evaluate(`(() => {
    const group = ${pickGroup(legend)};
    const lists = group.querySelectorAll('.time-wheel-list');
    if (lists.length < 2) throw new Error('时间选择器缺少两列');
    const pickFrom = (list, wanted, size) => {
      const items = [...list.querySelectorAll('.time-wheel-item')];
      const middle = items.slice(size, size * 2);
      const target = middle.find((node) => node.textContent.trim() === wanted);
      if (!target) throw new Error('列表里没有 ' + wanted);
      target.click();
      return true;
    };
    pickFrom(lists[0], ${wantHour}, 24);
    pickFrom(lists[1], ${wantMinute}, 60);
    return true;
  })()`);
  if (!applied) throw new Error(`时间未选中：${legend}`);
  // 触发按钮的文本要等 Vue 把新值回填后才会变，得单独读一次
  await sleep(200);
  const shown = await evaluate(`${pickGroup(legend)}.querySelector('.time-field-trigger span').textContent.trim()`);
  if (shown !== value) throw new Error(`时间未写入：${legend} 期望 ${value}，实际 ${shown}`);
}

/** 打印页面关键状态，便于定位实测失败的位置。 */
async function dumpState(label) {
  if (!process.env.TIMEWEB_DEBUG) return;
  const snapshot = await evaluate(`(() => ({
    hash: location.hash,
    formTitle: document.querySelector('#form-title')?.textContent ?? null,
    error: document.querySelector('.form-panel .inline-error')?.textContent ?? null,
    historyCount: document.querySelector('#history-title .count')?.textContent ?? null,
    pendingCount: document.querySelector('#pending-title .count')?.textContent ?? null,
    fields: [...document.querySelectorAll('.form-panel input, .form-panel textarea')].map((node) => node.type + '=' + node.value),
    selectedTags: [...document.querySelectorAll('.form-panel .tag-option.selected')].map((node) => node.textContent.trim()),
    saveDisabled: document.querySelector('.form-actions button')?.disabled ?? null,
    toast: document.querySelector('.punch-panel .inline-error')?.textContent ?? null,
    dialogs: document.querySelectorAll('dialog').length,
    settingsMessage: document.querySelector('#backup-title')?.parentElement?.querySelector('.folder-message')?.textContent ?? null,
    cloudCard: document.querySelector('#cloud-title')?.parentElement?.textContent.replace(/\s+/g, ' ').trim().slice(0, 160) ?? null,
    syncConfig: (() => { try { return localStorage.getItem('timeweb-sync'); } catch { return 'unavailable'; } })(),
  }))()`).catch((error) => ({ snapshotError: error.message }));
  console.log(`[debug] ${label}`, JSON.stringify(snapshot));
}

async function waitFor(expression, description, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await evaluate(expression)) return true;
    } catch {
      // 页面可能正在重新加载，继续重试。
    }
    if (Date.now() > deadline) {
      const snapshot = await evaluate(`(() => ({
        hash: location.hash,
        formTitle: document.querySelector('#form-title')?.textContent ?? null,
        error: document.querySelector('.form-panel .inline-error')?.textContent ?? null,
        pageError: document.querySelector('.page-status-error')?.textContent ?? null,
        historyCount: document.querySelector('#history-title .count')?.textContent ?? null,
        pendingCount: document.querySelector('#pending-title .count')?.textContent ?? null,
        fields: [...document.querySelectorAll('.form-panel input, .form-panel textarea')].map((node) => node.type + '=' + node.value),
        tags: [...document.querySelectorAll('.form-panel .tag-option')].map((node) => node.className + ':' + node.textContent.trim()),
      }))()`).catch((error) => ({ snapshotError: error.message }));
      throw new Error(`等待超时：${description}\n页面状态：${JSON.stringify(snapshot, null, 2)}`);
    }
    await sleep(150);
  }
}

/** 点击卡片内的按钮：按卡片定位，避免同名按钮互相干扰。 */
async function clickInCard(cardSelector, buttonText) {
  return evaluate(`(() => {
    const card = document.querySelector(${JSON.stringify(cardSelector)});
    if (!card) throw new Error("找不到卡片：" + ${JSON.stringify(cardSelector)});
    const button = [...card.querySelectorAll('button')]
      .find((node) => node.textContent.trim() === ${JSON.stringify(buttonText)});
    if (!button) throw new Error("卡片内找不到按钮：" + ${JSON.stringify(buttonText)});
    button.click();
    return true;
  })()`);
}

/** 量一下当前打开的确认框：是否用项目样式、是否水平垂直居中。 */
async function measureDialog() {
  return evaluate(`(() => {
    const dialog = document.querySelector('dialog[open]');
    if (!dialog) throw new Error('没有打开的确认框');
    const box = dialog.getBoundingClientRect();
    const style = getComputedStyle(dialog);
    return {
      centered: Math.abs(box.left - (window.innerWidth - box.right)) <= 2 &&
        Math.abs(box.top - (window.innerHeight - box.bottom)) <= 2,
      backdrop: getComputedStyle(dialog, '::backdrop').backgroundColor,
      border: style.borderTopWidth,
      gaps: Math.round(box.left) + '/' + Math.round(window.innerWidth - box.right) + ' ' +
        Math.round(box.top) + '/' + Math.round(window.innerHeight - box.bottom),
    };
  })()`);
}

function dialogLooksRight(measured) {
  return measured.centered && measured.backdrop !== "rgba(0, 0, 0, 0)" && measured.border === "1px";
}

/** 量每一组操作按钮：按行分组，给出每行的等宽与铺满情况。 */
async function measureButtonRows() {
  return evaluate(`(() => {
    return [...document.querySelectorAll('.backup-actions')].map((row) => {
      const rowBox = row.getBoundingClientRect();
      const buttons = [...row.querySelectorAll('.button')];
      const boxes = buttons.map((button) => button.getBoundingClientRect());
      // 按 top 分组得到实际渲染出来的每一行
      const lines = [];
      boxes.forEach((box, index) => {
        const top = Math.round(box.top);
        const line = lines.find((item) => Math.abs(item.top - top) <= 2);
        if (line) line.indexes.push(index);
        else lines.push({ top, indexes: [index] });
      });
      const linesInfo = lines.map((line) => {
        const lineBoxes = line.indexes.map((index) => boxes[index]);
        const widths = lineBoxes.map((box) => Math.round(box.width));
        const total = lineBoxes.reduce((sum, box) => sum + box.width, 0);
        return {
          labels: line.indexes.map((index) => buttons[index].textContent.trim()),
          widths,
          equalWidth: new Set(widths).size === 1,
          spansToEdges: Math.abs(lineBoxes[0].left - rowBox.left) <= 1 &&
            Math.abs(rowBox.right - lineBoxes[lineBoxes.length - 1].right) <= 1,
          fillsRow: Math.abs(total + 8 * (lineBoxes.length - 1) - rowBox.width) <= 2,
        };
      });
      const widths = boxes.map((box) => Math.round(box.width));
      return {
        labels: buttons.map((button) => button.textContent.trim()),
        count: buttons.length,
        /** 按钮变体类，用于确认同一行里没有混用不同颜色的样式。 */
        variants: [...new Set(buttons.map((button) => [...button.classList].filter((name) => name.startsWith("button-")).join("+")))],
        lineCount: lines.length,
        lines: linesInfo,
        /** 每行最多几个按钮，窄屏应当不大于 2。 */
        maxPerLine: Math.max(...linesInfo.map((line) => line.widths.length), 0),
        sameLine: new Set(boxes.map((box) => Math.round(box.top))).size === 1,
        wraps: lines.length > 1,
        equalWidth: new Set(widths).size === 1,
        spansToEdges: boxes.length > 0 &&
          Math.abs(boxes[0].left - rowBox.left) <= 1 &&
          Math.abs(rowBox.right - boxes[boxes.length - 1].right) <= 1,
        // 按钮总宽加间距应当约等于整行宽度
        fillsRow: Math.abs(widths.reduce((sum, value) => sum + value, 0) + 8 * (boxes.length - 1) - rowBox.width) <= 2,
        widths,
      };
    });
  })()`);
}

function buttonRowLooksRight(row) {
  return (
    row.count > 0 &&
    row.sameLine &&
    row.equalWidth &&
    row.spansToEdges &&
    row.fillsRow &&
    // 同一行只用一种按钮样式，不混用不同底色
    row.variants.length === 1 &&
    row.variants[0] === "button-secondary"
  );
}

/** 用真实鼠标事件点击：只有需要用户手势的下载链接才必须走这条路。 */
async function clickRect(selector, text = null) {
  const target = JSON.stringify(selector);
  const pickText = text === null
    ? "nodes[0]"
    : `nodes.find((node) => node.textContent.trim() === ${JSON.stringify(text)})`;

  // 先把元素滚到视口内，并等滚动停止：平滑滚动会让紧接着测量的坐标失效。
  await evaluate(`(async () => {
    const target = ${pickText.replace("nodes", `[...document.querySelectorAll(${target})]`)};
    if (!target) throw new Error("找不到元素");
    target.scrollIntoView({ block: "center", behavior: "instant" });
    let previous = -1;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const y = window.scrollY;
      if (y === previous) break;
      previous = y;
    }
    return true;
  })()`);

  const point = await evaluate(`(() => {
    const nodes = [...document.querySelectorAll(${target})];
    const element = ${pickText};
    if (!element) throw new Error("找不到元素");
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    // CDP 的鼠标事件使用视口坐标，这里先确认落点真的是目标元素。
    const hit = document.elementFromPoint(x, y);
    if (!hit || (hit !== element && !element.contains(hit))) {
      throw new Error(
        '落点不在目标元素上：' + (hit ? hit.tagName + '.' + hit.className : 'null') +
        ' | 矩形 ' + JSON.stringify({ l: Math.round(box.left), t: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) }) +
        ' | 视口 ' + JSON.stringify({ w: window.innerWidth, h: window.innerHeight, sy: Math.round(window.scrollY) }) +
        ' | 匹配元素数 ' + nodes.length,
      );
    }
    return { x, y };
  })()`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await session.client.send(
      "Input.dispatchMouseEvent",
      { type, x: point.x, y: point.y, button: "left", clickCount: 1 },
      session.sessionId,
    );
  }
}

async function downloadNames() {
  return (await readdir(DOWNLOAD_DIR).catch(() => [])).filter((name) => !name.endsWith(".crdownload"));
}

async function waitForDownload(predicate, description, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const names = await downloadNames();
    const match = names.find(predicate);
    if (match) return match;
    if (Date.now() > deadline) throw new Error(`等待下载超时：${description}（当前：${names.join("、") || "无"}）`);
    await sleep(250);
  }
}

/**
 * 点击按钮后等待浏览器确认下载开始，拿到落盘文件名。
 *
 * 必须用 clickRect 发真实鼠标事件：下载需要用户手势，普通 DOM click() 触发的
 * link.click() 会被浏览器丢弃，控件自己的成功提示却照常显示，很难查。
 */
/** 下载诊断：clickAndCaptureDownload 执行期间收集 CDP 的下载事件。 */
let downloadListener = null;

/**
 * 点击按钮后等待下载落盘，返回文件名与内容。
 *
 * 两个坑：
 *   1. 必须用 clickRect 发真实鼠标事件——下载需要用户手势，普通 DOM click()
 *      触发的 link.click() 会被浏览器丢弃，而控件自己的成功提示照常显示；
 *   2. 不能用「文件内容变了」判断完成：导出结果本来就该是可复现的，内容完全相同
 *      时那个判据永远不成立。这里改为等 CDP 的 completed 事件，再按文件名读盘。
 */
async function clickAndCaptureDownload(selector, text) {
  const events = [];
  const previous = downloadListener;
  downloadListener = (event) => events.push(event);
  try {
    await clickRect(selector, text);
    const deadline = Date.now() + 15000;
    for (;;) {
      const completed = findCompletedDownload(events, text);
      if (completed) {
        const bytes = await readFile(completed.path).catch(() => null);
        if (bytes) return { name: completed.name, bytes };
      }
      if (Date.now() > deadline) {
        const state = await evaluate(`(() => {
          const button = [...document.querySelectorAll(${JSON.stringify(selector)})]
            .find((node) => node.textContent.trim() === ${JSON.stringify(text)});
          return {
            view: document.querySelector('.app-nav-button.active')?.textContent ?? null,
            hasButton: !!button,
            disabled: button ? button.disabled : null,
            message: document.querySelector('.folder-message')?.textContent.trim() ?? null,
          };
        })()`).catch((error) => ({ error: String(error) }));
        throw new Error(
          `下载未落盘：CDP 事件 [${events.join(" | ") || "无"}]；页面状态 ${JSON.stringify(state)}`,
        );
      }
      await sleep(200);
    }
  } finally {
    downloadListener = previous;
  }
}

/** 从 CDP 事件里挑出这次点击对应的已完成下载。 */
function findCompletedDownload(events, displayName) {
  const completed = events.filter(
    (event) => event.startsWith("Browser.downloadProgress") && event.includes('"state":"completed"'),
  );
  for (const event of completed) {
    try {
      const payload = JSON.parse(event.slice(event.indexOf("{")));
      const name = basename(payload.filePath ?? "");
      if (name && payload.filePath) return { name, path: payload.filePath };
    } catch {
      // 事件解析失败就跳过，继续等下一个
    }
  }
  return null;
}

/** 只要文件名的场景（既有用例沿用）。 */
async function downloadName(selector, text) {
  return (await clickAndCaptureDownload(selector, text)).name;
}

async function main() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const workDir = await mkdtemp(join(tmpdir(), "timeweb-ui-"));
  const profileDir = join(workDir, "profile");
  const server = await ensureServer(projectRoot);
  const mock = await startMockWorker({ testFiles });
  const { child, endpoint } = await launchBrowser(profileDir);
  try {
    session = await attach(endpoint, "about:blank");
    await session.client.send("Page.enable", {}, session.sessionId);
    await session.client.send("Runtime.enable", {}, session.sessionId);
    await session.client.send("DOM.enable", {}, session.sessionId);
    await session.client.send(
      "Browser.setDownloadBehavior",
      { behavior: "allow", downloadPath: DOWNLOAD_DIR, eventsEnabled: true },
    );
    // 下载相关事件只用于失败诊断，不影响判定
    session.client.listeners.add((message) => {
      if (downloadListener && message.method?.startsWith("Browser.download")) {
        downloadListener(`${message.method} ${JSON.stringify(message.params)}`);
      }
    });

    console.log(`\n=== 页面：${URL_UNDER_TEST} ===`);
    await session.client.send("Page.navigate", { url: URL_UNDER_TEST }, session.sessionId);
    await waitFor("!!document.querySelector('.punch-panel')", "记录页渲染完成");

    // 1. 首屏与空状态
    check(
      "记录页在真实浏览器中渲染",
      await evaluate(
        "document.title === '时间记录' && !!document.querySelector('.app-nav') && !!document.querySelector('.form-panel')",
      ),
      await evaluate("document.title"),
    );
    check(
      "空数据时显示待补全与历史空状态",
      await evaluate(
        "document.querySelector('.pending-empty')?.textContent.includes('暂无待补全记录') === true && document.querySelector('.history-panel .empty-state') !== null",
      ),
    );

    // 2. 打卡生成独立草稿
    await clickByText(".punch-button", "记录当前时间");
    await waitFor("document.querySelector('#pending-title .count')?.textContent === '1'", "打卡后待补全计为 1");
    const draft = await evaluate(`(() => {
      const card = document.querySelector('.pending-scroll .record-card');
      return { text: card?.querySelector('.record-time')?.textContent.replace(/\\s+/g, ' ').trim(), count: document.querySelector('#pending-title .count').textContent };
    })()`);
    check("打卡新增只含开始时间的待补全记录", draft.count === "1" && /xx:xx/.test(draft.text), draft.text);

    // 3. 补全为已完成记录
    await dumpState("打卡后");
    await clickInCard(".pending-scroll .record-card", "补全");
    await dumpState("点击补全后");
    await waitFor("document.querySelector('#form-title').textContent === '编辑记录'", "表单进入编辑态");
    const recordDate = await evaluate("new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)");
    const week = weekOf(recordDate);
    await fillDate("开始时间", recordDate);
    await fillDate("结束时间", recordDate);
    await fillTime("开始时间", "09:00");
    await fillTime("结束时间", "10:30");
    await evaluate(`(() => {
      const field = document.querySelector('.form-panel textarea');
      if (!field) throw new Error('表单缺少内容输入框');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, '浏览器实测记录');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await dumpState("填充表单后");
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.form-panel .tag-option')]
        .find((node) => node.textContent.includes('工作'));
      if (!button) throw new Error('缺少工作标签按钮');
      button.click();
      return true;
    })()`);
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.form-actions button')]
        .find((node) => node.textContent.trim() === '保存记录');
      if (!button) throw new Error('找不到保存按钮');
      button.click();
      return true;
    })()`);
    await dumpState("点击保存后");
    await waitFor("document.querySelector('#history-title .count')?.textContent === '1'", "历史出现 1 条记录");
    const history = await evaluate(`(() => {
      const card = document.querySelector('.history-scroll .record-card');
      return {
        title: card?.querySelector('.history-time')?.textContent.trim(),
        tag: card?.querySelector('.tag')?.textContent.trim(),
        content: card?.querySelector('.history-content')?.textContent.trim(),
        pending: document.querySelector('#pending-title .count').textContent,
      };
    })()`);
    check(
      "补全后进入历史并带日期、标签与内容",
      history.title?.includes(`${recordDate} 09:00 → ${recordDate} 10:30`) && history.tag === "工作" &&
        history.content === "浏览器实测记录" && history.pending === "0",
      `${history.title} / ${history.tag} / ${history.pending}`,
    );

    // 4. 重叠校验阻止保存
    await fillDate("开始时间", recordDate);
    await fillDate("结束时间", recordDate);
    await fillTime("开始时间", "10:00");
    await fillTime("结束时间", "11:00");
    await evaluate(`(() => {
      const field = document.querySelector('.form-panel textarea');
      if (!field) throw new Error('表单缺少内容输入框');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, '重叠测试');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.form-panel .tag-option')]
        .find((node) => node.textContent.includes('休闲'));
      if (!button) throw new Error('缺少休闲标签按钮');
      button.click();
      return true;
    })()`);
    await dumpState("重叠用例填充后");
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.form-actions button')]
        .find((node) => node.textContent.trim() === '保存记录');
      button.click();
      return true;
    })()`);
    await waitFor("!!document.querySelector('.form-panel .inline-error')", "出现重叠错误提示");
    const overlap = await evaluate("document.querySelector('.form-panel .inline-error').textContent.trim()");
    check("重叠记录被拒绝并提示原因", overlap.includes("重叠"), overlap);
    check(
      "保存失败后保留用户输入",
      await evaluate("document.querySelector('.form-panel textarea').value === '重叠测试'"),
    );
    await sleep(300);

    // 5. IndexedDB 落库
    const stored = await evaluate(`(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('time-web');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const entries = await new Promise((resolve, reject) => {
        const request = db.transaction('entries', 'readonly').objectStore('entries').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const meta = await new Promise((resolve) => {
        const request = db.transaction('meta', 'readonly').objectStore('meta').get('createdAt');
        request.onsuccess = () => resolve({ createdAt: request.result });
      });
      return {
        count: entries.length,
        first: entries[0],
        states: entries.map((entry) => entry.state),
        meta,
      };
    })()`);
    check("数据写入 IndexedDB，编号为 UUID 且带同步时间戳",
      stored.count === 1 &&
        stored.states[0] === "completed" &&
        typeof stored.first.id === "string" &&
        stored.first.id.length >= 16 &&
        typeof stored.first.updatedAt === "number" &&
        stored.first.updatedAt > 0 &&
        stored.first.deletedAt === null &&
        typeof stored.meta.createdAt === "number",
      `记录 ${stored.count} 条，编号 ${String(stored.first.id).slice(0, 8)}…`,
    );

    // 5.5 从未导出过备份时用居中弹窗提醒
    await waitFor("!!document.querySelector('.delete-dialog[open]')", "出现备份提醒弹窗");
    const remindDialog = await measureDialog();
    const remindText = await evaluate("document.querySelector('dialog[open]').textContent.replace(/\\s+/g, ' ').trim()");
    check(
      "从未备份过时弹出居中的备份提醒",
      dialogLooksRight(remindDialog) &&
        /该做一次备份了/.test(remindText) &&
        /(还没有导出过备份|上次导出)/.test(remindText) &&
        /(还没有成功同步过|上次同步)/.test(remindText),
      `留白 ${remindDialog.gaps}；${remindText.slice(0, 44)}`,
    );
    await clickByText(".delete-dialog .button-quiet", "明天再说");
    await waitFor("!document.querySelector('dialog[open]')", "忽略后提醒关闭");
    check(
      "备份提醒可忽略且当天不再弹出",
      (await evaluate("!!document.querySelector('dialog[open]')")) === false,
      await evaluate("localStorage.getItem('timeweb-backup-dismissed') !== null ? '已记录忽略时间' : '未记录'"),
    );

    // 5.6 删除确认框：用项目样式居中，按钮整行
    await clickInCard(".history-scroll .record-card", "删除");
    await waitFor("!!document.querySelector('.delete-dialog[open]')", "出现删除确认框");
    const deleteDialog = await measureDialog();
    check(
      "删除确认框使用项目样式并居中",
      dialogLooksRight(deleteDialog),
      `留白 ${deleteDialog.gaps}，遮罩 ${deleteDialog.backdrop}`,
    );
    await clickByText(".delete-dialog .button-quiet", "取消");
    await waitFor("!document.querySelector('.delete-dialog[open]')", "取消后确认框关闭");

    // 6. 周视图与统计
    await clickByText(".app-nav-button", "周视图");
    await waitFor("!!document.querySelector('.week-timeline')", "周时间轴渲染");
    const weekView = await evaluate(`(() => ({
      title: document.querySelector('#week-title').textContent.trim(),
      events: document.querySelectorAll('.timeline-event').length,
      day: [...document.querySelectorAll('.week-stat-item')].map((node) => node.textContent.replace(/\\s+/g, ' ').trim()),
      canvasWidth: document.querySelector('.week-timeline')?.getBoundingClientRect().width,
      pendingButton: document.querySelector('.pending-link')?.textContent.trim(),
    }))()`);
    check(
      "周视图渲染时间块与分类时长",
      weekView.events === 1 && weekView.day.some((item) => item.includes("工作") && item.includes("1时 30分")),
      `${weekView.events} 个时间块；${weekView.day.join(" | ")}`,
    );
    check(
      "周视图标题按北京时间周区间显示",
      weekView.title.includes(`${week.start.slice(0, 4)}年`) &&
        weekView.title.includes(`${Number(week.start.slice(5, 7))}月${Number(week.start.slice(8, 10))}日`) &&
        weekView.title.includes(`${Number(week.end.slice(5, 7))}月${Number(week.end.slice(8, 10))}日`),
      weekView.title,
    );

    // 7. PNG 导出（画布 + 下载）
    const lightPng = await clickAndCaptureDownload(".week-export .button-primary", "导出图片");
    const pngName = lightPng.name;
    const pngBytes = lightPng.bytes;
    const pngHeader = pngBytes.subarray(0, 8).toString("latin1");
    check(
      "周记录 PNG 导出为真实图片文件",
      pngName === `Time_${week.start}_${week.end}.png` &&
        pngHeader.startsWith("\u0089PNG\r\n\u001a\n") && pngBytes.length > 5000,
      `${pngName}，${pngBytes.length} 字节`,
    );

    // 8. 主题选择与刷新后保持
    await clickByText(".app-nav-button", "设置");
    await waitFor("!!document.querySelector('.settings-page')", "设置页渲染");
    await clickByText(".theme-option", "暗色");
    const darkApplied = await evaluate(
      "document.documentElement.dataset.theme === 'dark' && localStorage.getItem('timeweb-theme') === 'dark'",
    );
    await session.client.send("Page.reload", {}, session.sessionId);
    await waitFor("!!document.querySelector('.settings-page')", "刷新后设置页恢复");
    const darkAfterReload = await evaluate(
      "document.documentElement.dataset.theme === 'dark' && localStorage.getItem('timeweb-theme') === 'dark'",
    );
    check("暗色主题即时生效且刷新后保持", darkApplied && darkAfterReload);

    /*
     * 导出必须与主题无关。
     * 原来配色是从 CSS 变量读的，暗色下导出的是另一套颜色，同一次导出结果不同。
     * 这里在暗色主题下再导一次，和亮色那次逐字节比对。
     */
    await clickByText(".app-nav-button", "周视图");
    await waitFor("!!document.querySelector('.week-export')", "暗色下回到周视图");
    const darkPng = await clickAndCaptureDownload(".week-export .button-primary", "导出图片");
    const darkPngBytes = darkPng.bytes;
    check(
      "导出图片与主题无关，两次结果一致",
      darkPngBytes.equals(pngBytes),
      darkPngBytes.equals(pngBytes)
        ? `两次都是 ${darkPngBytes.length} 字节，字节完全相同`
        : `亮色 ${pngBytes.length} 字节 vs 暗色 ${darkPngBytes.length} 字节，内容不同`,
    );

    await clickByText(".app-nav-button", "设置");
    await waitFor("!!document.querySelector('.settings-page')", "回到设置页");

    // 概览是异步读出来的，先等它出现内容再断言，避免读到加载中的占位文案
    const overviewSelector = "#storage-title ~ p.folder-message:not(.status-error)";
    await waitFor(
      `/已完成 \\d+ 条/.test(document.querySelector('${overviewSelector}')?.textContent ?? '')`,
      "本地数据概览加载完成",
    );
    const overview = await evaluate(`document.querySelector('${overviewSelector}')?.textContent.trim()`);
    check("设置页展示本地数据概览", /已完成 1 条/.test(overview ?? ""), overview);
    check(
      "设置页导航同步地址栏 hash",
      await evaluate("location.hash === '#settings'"),
      await evaluate("location.hash"),
    );

    // 8.5 设置页的操作按钮：每一组并排一行、等宽、共同铺满整行
    const buttonRows = await measureButtonRows();
    const badRows = buttonRows.filter((row) => !buttonRowLooksRight(row));
    check(
      "设置页操作按钮并排一行、等宽、同一样式",
      buttonRows.length >= 2 && badRows.length === 0,
      buttonRows
        .map((row) => `${row.labels.join("/")} ${row.widths.join("+")}px 同行=${row.sameLine} 等宽=${row.equalWidth} 铺满=${row.fillsRow} 样式=${row.variants.join(",")}`)
        .join("；"),
    );

    // 9. JSON 备份导出
    const backupFile = await clickAndCaptureDownload(".backup-actions .button", "导出备份");
    const backupName = backupFile.name;
    const backup = JSON.parse(backupFile.bytes.toString("utf8"));
    check(
      "JSON 备份包含格式标识、版本与全部记录",
      /^TimeBackup_2026\d{4}_\d{4}\.json$/.test(backupName) &&
        backup.format === "time-web-backup" &&
        backup.version === 2 &&
        backup.entryCount === 1 &&
        backup.entries.length === 1 &&
        backup.entries[0].content === "浏览器实测记录" &&
        typeof backup.entries[0].id === "string" &&
        typeof backup.entries[0].updatedAt === "number",
      `${backupName}，${backup.entryCount} 条，编号 ${String(backup.entries[0]?.id).slice(0, 8)}…`,
    );

    // 10. 清空记录：确认框同样用项目样式居中，而不是浏览器默认的 confirm
    await clickByText(".backup-actions .button", "清空记录");
    await waitFor("!!document.querySelector('.delete-dialog[open]')", "出现清空确认框");
    const wipeDialog = await measureDialog();
    check(
      "清空确认框使用项目样式并居中",
      dialogLooksRight(wipeDialog),
      `留白 ${wipeDialog.gaps}，遮罩 ${wipeDialog.backdrop}`,
    );
    await clickByText(".delete-dialog .button-danger-quiet", "清空记录");
    await waitFor("/已完成 0 条/.test(document.body.textContent)", "清空后概览归零");
    check(
      "清空记录后本地数据归零",
      /已完成 0 条/.test(await evaluate("document.querySelector('#storage-title').parentElement.querySelector('.folder-message').textContent")),
    );

    // 11. 从备份恢复
    // 无头浏览器不允许程序化选择本地文件：先把导出的备份挂到假 Worker 的测试路由上，
    // 页面取回后构造真实的 File 对象并派发 change，随后的读取、格式校验、
    // 确认弹窗与整体替换都由应用自己完成。
    const backupText = await readFile(join(DOWNLOAD_DIR, backupName), "utf8");
    testFiles.set(backupName, backupText);
    await waitFor("!!document.querySelector('input[type=file]')", "备份文件输入框存在");
    await evaluate(`(() => {
      const input = document.querySelector('input[type=file]');
      window.__filePickerOpened = 0;
      input.addEventListener('click', () => {
        window.__filePickerOpened += 1;
      });
      return true;
    })()`);
    // 这里用 click() 而不是坐标点击：它只是触发隐藏的文件输入框，
    // 不需要用户手势，坐标点击反而容易被布局滚动影响。
    await clickByText(".backup-actions .button-secondary", "从文件恢复");
    await sleep(300);
    const pickerProbe = await evaluate(`(() => {
      const button = document.querySelector('.backup-actions .button-secondary');
      const box = button.getBoundingClientRect();
      const atCenter = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        opened: window.__filePickerOpened,
        rect: [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)],
        centerElement: atCenter ? atCenter.tagName + '.' + atCenter.className : null,
        sameButton: atCenter === button,
      };
    })()`);
    check(
      "「从文件恢复」按钮唤起文件选择框",
      pickerProbe.opened >= 1,
      `触发 ${pickerProbe.opened} 次，按钮矩形 ${pickerProbe.rect.join(",")}，中心元素 ${pickerProbe.centerElement}，命中按钮 ${pickerProbe.sameButton}`,
    );
    const restoredVia = "应用导入流程（File 对象取自导出的备份）";
    await session.client.send("Page.setBypassCSP", { enabled: true }, session.sessionId);
    await evaluate(`(async () => {
      const response = await fetch(${JSON.stringify(`${mock.endpoint}/api/test-download/${encodeURIComponent(backupName)}`)});
      const text = await response.text();
      const input = document.querySelector('input[type=file]');
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], ${JSON.stringify(backupName)}, { type: 'application/json' }));
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
      descriptor.set.call(input, transfer.files);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return input.files.length;
    })()`);
    await dumpState("备份文件已附加");
    await waitFor("!!document.querySelector('.delete-dialog[open]')", "出现恢复确认框");
    const restoreDialog = await measureDialog();
    check(
      "恢复确认框使用项目样式并居中",
      dialogLooksRight(restoreDialog),
      `留白 ${restoreDialog.gaps}，遮罩 ${restoreDialog.backdrop}`,
    );
    await clickByText(".delete-dialog .button-primary", "确定恢复");
    await waitFor("/已完成 1 条/.test(document.querySelector('#storage-title').parentElement.textContent)", "恢复后本地数据回到 1 条");
    const restored = await evaluate(`(() => {
      const card = document.querySelector('#backup-title').parentElement;
      return {
        message: card.querySelector('.folder-message:not(.status-error)')?.textContent.trim() ?? '',
        error: card.querySelector('.folder-message.status-error')?.textContent.trim() ?? '',
      };
    })()`);
    check(
      "从备份文件恢复记录并给出结果提示",
      /已从 TimeBackup_.*恢复 1 条记录/.test(restored.message) && restored.error === "",
      `${restored.message}（${restoredVia}）`,
    );

    // 12. 恢复后的数据可用
    await clickByText(".app-nav-button", "记录");
    await waitFor("document.querySelector('#history-title .count')?.textContent === '1'", "恢复后历史回到 1 条");
    const afterRestore = await evaluate(`(() => {
      const card = document.querySelector('.history-scroll .record-card');
      return {
        content: card?.querySelector('.history-content')?.textContent.trim(),
        title: card?.querySelector('.history-time')?.textContent.trim(),
      };
    })()`);
    check(
      "恢复后的记录内容与时间可正常显示",
      afterRestore.content === "浏览器实测记录" && afterRestore.title?.includes(`${recordDate} 09:00 → ${recordDate} 10:30`),
      `${afterRestore.title} / ${afterRestore.content}`,
    );

    // 13. 刷新后数据仍在
    await session.client.send("Page.reload", {}, session.sessionId);
    await waitFor("document.querySelector('#history-title .count')?.textContent === '1'", "刷新后历史仍为 1 条");
    check("刷新页面后记录持久保留", await evaluate("document.querySelector('#history-title .count').textContent === '1'"));

    // 13.5 导出后不再提醒备份（导出已刷新时间戳，刷新页面后提醒应当消失）
    check(
      "导出备份后刷新页面不再提醒备份",
      (await evaluate("!!document.querySelector('dialog[open]')")) === false,
      await evaluate("document.querySelector('dialog[open]')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 30) ?? '（无提醒弹窗）'"),
    );

    // 14. 配置云端同步并把本地记录推送到假 Worker
    // 构建时内置了真实服务地址，这里先把配置写成假 Worker 再刷新，
    // 免得实测打到线上；同时验证「地址非空时不显示地址输入框」。
    await evaluate(
      `localStorage.setItem('timeweb-sync', JSON.stringify({ endpoint: ${JSON.stringify(mock.endpoint)}, code: '' }))`,
    );
    await session.client.send("Page.reload", {}, session.sessionId);
    await waitFor("!!document.querySelector('.punch-panel')", "刷新后记录页渲染完成");
    await clickByText(".app-nav-button", "设置");
    await waitFor("!!document.querySelector('#cloud-title')", "云端同步卡片渲染");
    const syncFields = await evaluate(`(() => {
      const card = document.querySelector('#cloud-title').parentElement;
      return [...card.querySelectorAll('input')].map((input) => input.previousElementSibling?.textContent.trim() ?? input.type);
    })()`);
    check(
      "内置同步服务地址后不再显示地址输入框",
      syncFields.length === 1 && syncFields[0] === "同步码",
      `字段：${syncFields.join("/")}`,
    );
    await evaluate(`(() => {
      const setValue = (target, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(target, value);
        target.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const card = document.querySelector('#cloud-title').parentElement;
      const inputs = [...card.querySelectorAll('input')];
      const byLabel = (label) => inputs.find((input) => input.previousElementSibling?.textContent.trim() === label);
      const codeInput = byLabel('同步码') ?? inputs[inputs.length - 1];
      setValue(codeInput, ${JSON.stringify(mock.code)});
      return true;
    })()`);
    await clickByText("#cloud-title ~ .backup-actions .button", "保存配置");
    await clickByText("#cloud-title ~ .backup-actions .button", "立即同步");
    await waitFor("/已同步/.test(document.querySelector('#cloud-title').parentElement.textContent)", "同步完成");
    const uploaded = [...mock.rows.values()];
    check(
      "本地记录被推送到云端",
      uploaded.length === 1 && uploaded[0].content === "浏览器实测记录" &&
        uploaded[0].state === "completed" && uploaded[0].updatedAt > 0,
      `${uploaded.length} 条，内容「${uploaded[0]?.content ?? ""}」`,
    );
    const storedSync = await evaluate("localStorage.getItem('timeweb-sync')");
    check(
      "同步配置保存在本机",
      typeof storedSync === "string" &&
        storedSync.includes(mock.endpoint) &&
        storedSync.includes(mock.code),
      `已保存=${storedSync !== null}`,
    );

    // 15. 清空浏览器本地数据后从云端恢复
    await evaluate(`(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('time-web');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('entries', 'readwrite');
        transaction.objectStore('entries').clear();
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      return true;
    })()`);
    const emptied = await evaluate(`(async () => {
      const db = await new Promise((resolve) => {
        const request = indexedDB.open('time-web');
        request.onsuccess = () => resolve(request.result);
      });
      return new Promise((resolve) => {
        const request = db.transaction('entries', 'readonly').objectStore('entries').count();
        request.onsuccess = () => resolve(request.result);
      });
    })()`);
    check("清空浏览器本地数据后本地为空", emptied === 0, `剩余 ${emptied} 条`);

    // 重新打开页面：启动时的自动同步应把记录从云端拉回。
    await session.client.send("Page.reload", {}, session.sessionId);
    await sleep(2500);
    const afterReload = await evaluate(`(async () => {
      const db = await new Promise((resolve) => {
        const request = indexedDB.open('time-web');
        request.onsuccess = () => resolve(request.result);
      });
      const count = await new Promise((resolve) => {
        const request = db.transaction('entries', 'readonly').objectStore('entries').count();
        request.onsuccess = () => resolve(request.result);
      });
      return {
        count,
        hash: location.hash,
        view: document.querySelector('.app-nav-button.active')?.textContent ?? null,
        historyPanel: !!document.querySelector('#history-title'),
        history: document.querySelector('#history-title .count')?.textContent ?? null,
        pending: document.querySelector('#pending-title .count')?.textContent ?? null,
        card: document.querySelector('#cloud-title')?.parentElement?.textContent.replace(/\\s+/g, ' ').slice(0, 90) ?? null,
      };
    })()`);
    check(
      "清空本地后重新打开页面即从云端拉回记录",
      afterReload.count === 1,
      `IndexedDB ${afterReload.count} 条，当前页面 ${afterReload.view}`,
    );
    await clickByText(".app-nav-button", "记录");
    await waitFor("document.querySelector('#history-title .count')?.textContent === '1'", "启动同步后记录被拉回");
    const pulledBack = await evaluate(`(() => {
      const card = document.querySelector('.history-scroll .record-card');
      return {
        content: card?.querySelector('.history-content')?.textContent.trim(),
        title: card?.querySelector('.history-time')?.textContent.trim(),
      };
    })()`);
    check(
      "浏览器数据被清空后能自动从云端恢复记录",
      pulledBack.content === "浏览器实测记录" &&
        pulledBack.title?.includes(`${recordDate} 09:00 → ${recordDate} 10:30`),
      `${pulledBack.title} / ${pulledBack.content}`,
    );

    // 16. 移动端：窄屏下不横向溢出、点击目标够大、按钮换行等宽
    await runMobileChecks();
  } finally {
    session?.client.close();
    child.kill();
    server?.kill();
    await mock.close();
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }

  const failed = results.filter((result) => !result.passed);
  console.log(`\n=== 浏览器实测：${results.length - failed.length}/${results.length} 项通过 ===`);
  if (failed.length > 0) {
    console.log(failed.map((result) => `- ${result.name}`).join("\n"));
    process.exitCode = 1;
  }
  await writeFile(join(tmpdir(), "timeweb-browser-check.json"), JSON.stringify({ url: URL_UNDER_TEST, results }, null, 2)).catch(() => {});
}

/**
 * 移动端检查：逐个视口遍历三个页面，页面级横向溢出与过小的点击目标都会被抓出来。
 * 用 CDP 的 setDeviceMetricsOverride 模拟，而不是改窗口大小——窗口最小宽度
 * 达不到 360px，仅靠 --window-size 测不出窄屏问题。
 */
async function setViewport(width, height) {
  await session.client.send(
    "Emulation.setDeviceMetricsOverride",
    { width, height, deviceScaleFactor: 1, mobile: true },
    session.sessionId,
  );
  await sleep(150);
}

/** 页面级横向溢出，以及溢出视口右边界的具体元素（含父链宽度，便于定位是谁撑开的）。 */
function overflowProbe() {
  return `(() => {
    const doc = document.documentElement;
    const width = window.innerWidth;
    const offenders = [];
    for (const node of document.querySelectorAll('body *')) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right > width + 1 || rect.left < -1) {
        const tag = node.tagName.toLowerCase();
        const cls = typeof node.className === 'string' ? node.className.split(' ')[0] : '';
        const chain = [];
        for (let parent = node.parentElement; parent && chain.length < 3; parent = parent.parentElement) {
          const pcls = typeof parent.className === 'string' ? parent.className.split(' ')[0] : '';
          chain.push(parent.tagName.toLowerCase() + (pcls ? '.' + pcls : '') + '=' + Math.round(parent.getBoundingClientRect().width));
        }
        offenders.push(tag + (cls ? '.' + cls : '') + ' w=' + Math.round(rect.width) +
          ' [' + Math.round(rect.left) + '..' + Math.round(rect.right) + '] ← ' + chain.join(' < '));
      }
    }
    return {
      innerWidth: width,
      scrollWidth: doc.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      horizontallyScrollable: doc.scrollWidth > width + 1,
      offenders: offenders.slice(0, 4),
    };
  })()`;
}

/** 点击目标尺寸：返回小于给定边长的可见按钮。 */
function smallTargetProbe(minSize) {
  return `(() => {
    const small = [];
    for (const node of document.querySelectorAll('button, input[type=text], input[type=url], select, a[href]')) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (rect.height < ${minSize} || rect.width < 24) {
        const label = (node.getAttribute('aria-label') || node.textContent || node.type || '').trim().slice(0, 12);
        small.push(label + ' ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
      }
    }
    return small;
  })()`;
}

async function runMobileChecks() {
  const viewports = [
    { name: "iPhone SE", width: 375, height: 667 },
    { name: "iPhone 14", width: 390, height: 844 },
    { name: "安卓常见", width: 360, height: 800 },
  ];
  const pages = [
    { name: "记录", nav: "记录" },
    { name: "周视图", nav: "周视图" },
    { name: "设置", nav: "设置" },
  ];

  for (const viewport of viewports) {
    await setViewport(viewport.width, viewport.height);
    for (const page of pages) {
      await clickByText(".app-nav-button", page.nav);
      await sleep(250);
      const overflow = await evaluate(overflowProbe());
      // 关键：和「设定的视口宽度」比，而不是和 scrollWidth 自己比。
      // 设置页曾经把文档撑到 424px，拿 scrollWidth 比会误报通过。
      check(
        `移动端 ${viewport.width}px · ${page.name} 页不横向溢出`,
        overflow.scrollWidth <= viewport.width + 1,
        `scrollWidth ${overflow.scrollWidth} / 视口 ${viewport.width}` +
          (overflow.offenders.length > 0 ? `；越界元素 ${overflow.offenders.join("；")}` : ""),
      );
    }
  }

  // 触摸目标：回到 360px 最窄视口逐个量
  await setViewport(360, 800);
  for (const page of pages) {
    await clickByText(".app-nav-button", page.nav);
    await sleep(250);
    const small = await evaluate(smallTargetProbe(32));
    check(
      `移动端 360px · ${page.name} 页点击目标不小于 32px`,
      small.length === 0,
      small.length === 0 ? "全部达标" : `过小：${small.slice(0, 4).join("、")}`,
    );
  }

  // 设置页：内置了服务地址，用户端只该看到同步码一个输入框
  const syncFields = await evaluate(`(() => {
    const card = document.querySelector('#cloud-title')?.parentElement;
    if (!card) return null;
    return [...card.querySelectorAll('input')].map((input) => input.previousElementSibling?.textContent.trim() ?? input.type);
  })()`);
  check(
    "内置同步服务地址后设置页只显示同步码",
    Array.isArray(syncFields) && syncFields.length === 1 && syncFields[0] === "同步码",
    `字段：${(syncFields ?? []).join("/")}`,
  );

  // 窄屏按钮：换行成每行两个，每行内部仍等宽铺满
  const narrowRows = await measureButtonRows();
  const narrowOk =
    narrowRows.length >= 2 &&
    narrowRows.every(
      (row) =>
        row.maxPerLine <= 2 &&
        row.lines.every((line) => line.equalWidth && line.spansToEdges && line.fillsRow),
    );
  check(
    "移动端设置页按钮换行成每行两个且等宽铺满",
    narrowOk,
    narrowRows
      .map((row) => row.lines.map((line) => `${line.labels.join("/")} ${line.widths.join("+")}px`).join(" | "))
      .join("；"),
  );

  // 记录页的历史卡片曾经被 nowrap 的时间文本撑出容器（317px 的卡片算成 404px），
  // 这里额外确认卡片内部的盒子确实贴合容器宽度，而不只是页面整体没滚动。
  await clickByText(".app-nav-button", "记录");
  await sleep(250);
  const cardFit = await evaluate(`(() => {
    const scroller = document.querySelector('.history-scroll');
    const card = document.querySelector('.record-card');
    if (!scroller || !card) return { ok: true, note: '没有历史卡片，跳过' };
    return {
      ok: scroller.scrollWidth <= scroller.clientWidth + 1 && card.scrollWidth <= card.clientWidth + 1,
      note: 'history-scroll ' + scroller.clientWidth + '/' + scroller.scrollWidth +
        '，record-card ' + card.clientWidth + '/' + card.scrollWidth,
    };
  })()`);
  check("移动端历史卡片贴合容器不撑开", cardFit.ok, cardFit.note);

  /*
   * 手机上一列只有 40 多像素，时间块里的文字会被压成竖排单字。
   * 窄屏应当只保留分类颜色，文字不显示；颜色靠左边框体现，必须还在。
   */
  await clickByText(".app-nav-button", "周视图");
  await sleep(250);
  const blockInMobile = await evaluate(`(() => {
    const block = document.querySelector('.timeline-event');
    if (!block) return { ok: false, note: '没有时间块' };
    const span = block.querySelector('span');
    const hidden = !span || getComputedStyle(span).display === 'none';
    const borderColor = getComputedStyle(block).borderLeftColor;
    const sized = block.getBoundingClientRect().height > 0 && block.getBoundingClientRect().width > 0;
    return {
      ok: hidden && sized && borderColor !== 'rgba(0, 0, 0, 0)',
      note: '文字隐藏=' + hidden + '，颜色=' + borderColor + '，尺寸=' +
        Math.round(block.getBoundingClientRect().width) + 'x' + Math.round(block.getBoundingClientRect().height),
    };
  })()`);
  check("移动端周视图时间块只留颜色不显示文字", blockInMobile.ok, blockInMobile.note);

  await setViewport(1280, 900);
}

await main();
