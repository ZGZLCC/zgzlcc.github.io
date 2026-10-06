import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

/**
 * Node 直接运行 TypeScript 源码时需要显式扩展名，
 * 这里为无扩展名的相对导入依次补上 `.ts` 与 `/index.ts`，
 * 使 src 源码保持与 Vite 一致的写法。
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (_needsExtension(specifier)) {
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        try {
          if (existsSync(fileURLToPath(new URL(candidate, context.parentURL)))) {
            return nextResolve(candidate, context);
          }
        } catch {
          // 非文件类地址交给默认解析流程处理。
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

function _needsExtension(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}
