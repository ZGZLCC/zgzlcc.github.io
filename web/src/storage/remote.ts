import { AppError } from "../core/errors";
import { parseEntries } from "../core/entry-validation";
import type { TimeEntry } from "../core/entries";
import { messageOf } from "../core/errors";
import type { RemoteClient } from "./remote-settings";
import { unreachableHint } from "./network-hint";

interface EntriesResponse {
  revision?: unknown;
  entries?: unknown;
}

/** 通过 HTTP 访问 Cloudflare Worker；所有失败都转成可展示的中文提示。 */
export class HttpRemoteClient implements RemoteClient {
  private readonly base: string;
  private readonly send: typeof fetch;

  constructor(endpoint: string, private readonly code: string, fetchImpl?: typeof fetch) {
    this.base = endpoint.trim().replace(/\/+$/, "");
    // 必须用箭头函数包一层：直接保存 fetch 后以实例方法调用会丢失 this，浏览器会抛 Illegal invocation。
    this.send = (...args) => (fetchImpl ?? globalThis.fetch)(...args);
  }

  private headers(): HeadersInit {
    return { "X-Time-Code": this.code.trim() };
  }

  private async request(init: RequestInit, action: string, suffix = ""): Promise<EntriesResponse> {
    let response: Response;
    try {
      response = await this.send(`${this.base}/api/entries${suffix}`, { ...init, headers: this.headers() });
    } catch (error) {
      throw new AppError("storage", unreachableHint(this.base));
    }
    if (response.status === 400) {
      throw new AppError("storage", "同步码格式无效，请确认完整复制了管理员给你的码");
    }
    if (response.status === 401) {
      throw new AppError("storage", "这个同步码不存在或已被吊销，请向管理员索取新的码");
    }
    if (!response.ok) {
      throw new AppError("storage", `云端返回 ${response.status}，${action}失败`);
    }
    try {
      return (await response.json()) as EntriesResponse;
    } catch {
      throw new AppError("storage", "云端返回的内容无法解析，请确认地址指向 Time 同步服务");
    }
  }

  private parse(payload: EntriesResponse): TimeEntry[] {
    try {
      return parseEntries(payload.entries ?? []);
    } catch (error) {
      throw new AppError("storage", messageOf(error, "云端记录格式无效"));
    }
  }

  async revision(): Promise<number> {
    const payload = await this.request({ method: "GET" }, "读取云端修订号");
    const revision = payload.revision;
    return typeof revision === "number" && Number.isFinite(revision) ? revision : 0;
  }

  async pull(): Promise<TimeEntry[]> {
    return this.parse(await this.request({ method: "GET" }, "读取云端记录"));
  }

  /**
   * 写入云端。
   *
   * `replace` 为真时带 `?replace=1`，云端不做逐条合并、直接以这份内容为准，
   * 用于「用本地覆盖云端」。默认是合并（「立即同步」用）。
   */
  async push(entries: TimeEntry[], replace = false): Promise<TimeEntry[]> {
    const payload = await this.request(
      {
        method: "POST",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      },
      "写入云端记录",
      replace ? "?replace=1" : "",
    );
    return this.parse(payload);
  }
}
