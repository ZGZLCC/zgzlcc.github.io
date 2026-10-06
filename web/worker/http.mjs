/**
 * HTTP 请求与代理支持。
 *
 * Node 的 fetch 不读 Windows 的“Internet 选项”代理设置，只认环境变量，
 * 所以在开了系统代理的机器上直连会被 DNS 污染挡住。这里自己解析代理并建立隧道，
 * 让命令行工具与 PowerShell、wrangler 的表现保持一致。
 */
import { execFileSync } from "node:child_process";
import { request as httpsRequest } from "node:https";
import { connect as netConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";

/** 依次尝试：显式指定 > HTTPS_PROXY > ALL_PROXY > Windows 系统代理。 */
export function detectProxy() {
  const fromEnv = [
    process.env.TIME_SYNC_PROXY,
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.ALL_PROXY,
    process.env.all_proxy,
  ].find((value) => value && value.trim() !== "");
  if (fromEnv) return { url: fromEnv.trim(), source: "环境变量" };

  const windows = readWindowsProxy();
  if (windows) return { url: windows, source: "Windows 系统代理" };
  return { url: "", source: "无" };
}

/** 读注册表里的系统代理；只取一个地址，够本工具使用。 */
function readWindowsProxy() {
  if (process.platform !== "win32") return "";
  try {
    const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
    const output = execFileSync("reg", ["query", key], { encoding: "utf8", windowsHide: true });
    if (!/ProxyEnable\s+REG_DWORD\s+0x1/i.test(output)) return "";
    const match = /ProxyServer\s+REG_SZ\s+(\S+)/i.exec(output);
    return match ? normalise(match[1]) : "";
  } catch {
    return "";
  }
}

/** ProxyServer 可能是 host:port，也可能是 http=host:port;https=host:port。 */
function normalise(server) {
  const single = server.split(";").find((part) => !part.includes("=")) ?? "";
  const chosen = (single || /https=([^;]+)/i.exec(server)?.[1] || "").trim();
  if (chosen === "") return "";
  return chosen.includes("://") ? chosen : `http://${chosen}`;
}

function needsProxy(hostname, proxyUrl) {
  if (!proxyUrl) return false;
  return !["127.0.0.1", "localhost", "::1"].includes(hostname);
}

/** 通过代理建立到目标主机的 TLS 隧道。 */
function tunnel(target, proxy) {
  return new Promise((resolve, reject) => {
    const proxyUrl = new URL(proxy);
    const proxyPort = Number(proxyUrl.port || (proxyUrl.protocol === "https:" ? 443 : 80));
    const socket = netConnect({ host: proxyUrl.hostname, port: proxyPort });
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(15_000, () => fail(new Error(`连接代理 ${proxyUrl.host} 超时`)));
    socket.once("error", (error) => fail(new Error(`代理连接失败：${error.message}`)));

    socket.once("connect", () => {
      const credentials = proxyUrl.username
        ? "Proxy-Authorization: Basic " +
          Buffer.from(
            `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`,
          ).toString("base64") +
          "\r\n"
        : "";
      socket.write(
        `CONNECT ${target.host}:${target.port} HTTP/1.1\r\nHost: ${target.host}:${target.port}\r\n${credentials}Connection: keep-alive\r\n\r\n`,
      );
    });

    let response = "";
    const onData = (chunk) => {
      response += chunk.toString("latin1");
      if (!response.includes("\r\n\r\n")) return;
      socket.off("data", onData);
      socket.setTimeout(0);
      const status = Number(/HTTP\/1\.[01] (\d+)/.exec(response)?.[1] ?? 0);
      if (status !== 200) {
        fail(new Error(`代理拒绝了 CONNECT（HTTP ${status || "未知"}）`));
        return;
      }
      settled = true;
      resolve(socket);
    };
    socket.on("data", onData);
  });
}

/** 发一次请求，返回 { status, body }；有代理时先建隧道再在其上做 TLS。 */
export async function sendRequest({ url, method = "GET", headers = {}, body, proxy = "" }) {
  const target = new URL(url);
  const host = target.hostname;
  const port = Number(target.port || 443);

  const options = {
    method,
    host,
    port,
    path: `${target.pathname}${target.search}`,
    headers: { Host: host, ...headers },
  };

  return new Promise((resolve, reject) => {
    const onResponse = (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        text += chunk;
      });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: text }));
    };

    const handleError = (error) => {
      const code = error?.cause?.code ?? error?.code ?? "";
      reject(new Error(code ? `${error.message}（${code}）` : error.message));
    };

    if (!needsProxy(host, proxy)) {
      const request = httpsRequest(options, onResponse);
      request.on("error", handleError);
      if (body !== undefined) request.write(body);
      request.end();
      return;
    }

    tunnel({ host, port }, proxy)
      .then((socket) => {
        const request = httpsRequest(
          { ...options, createConnection: () => tlsConnect({ socket, servername: host }) },
          onResponse,
        );
        request.on("error", handleError);
        if (body !== undefined) request.write(body);
        request.end();
      })
      .catch(reject);
  });
}
