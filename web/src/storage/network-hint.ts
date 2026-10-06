/**
 * 网络不可达时的可操作提示。
 * 单独放在无依赖模块里：`remote.ts` 会间接引入 vue，Node 直接测试不方便。
 */

/** `*.workers.dev` 在国内被 DNS 污染，直连一定失败，这里说明原因而不是抛「fetch failed」。 */
export function unreachableHint(endpoint: string): string {
  const target = endpoint.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const blockedDomain = target.endsWith(".workers.dev");
  const reason = blockedDomain
    ? "当前网络无法连到 *.workers.dev：国内对它的域名解析被污染，直连必然失败，与配置无关"
    : `当前网络连不上 ${target}`;
  return `${reason}。本地记录不受影响，可改用可靠网络或代理后再同步；没有网络时建议用「导出备份」保存一份 JSON。`;
}
