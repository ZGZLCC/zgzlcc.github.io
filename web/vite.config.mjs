import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

/**
 * 同步服务地址在构建时注入，用户端只填同步码。
 *
 * 改地址有三种办法，优先级从高到低：
 *   1. 构建时设环境变量 VITE_TIME_SYNC_ENDPOINT
 *   2. 改下面的 defaultEndpoint
 *   3. 用户在设置页手填（构建地址为空时才会显示该输入框）
 *
 * 这不是密钥，只是服务地址。管理口令 ADMIN_TOKEN 只存在于 Cloudflare，
 * 永远不进前端代码。
 */
const defaultEndpoint = "https://time-sync.zgzlcc.workers.dev";

export default defineConfig({
  base: "/time/",
  plugins: [vue()],
  define: {
    __TIME_SYNC_ENDPOINT__: JSON.stringify(process.env.VITE_TIME_SYNC_ENDPOINT || defaultEndpoint),
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
  },
});
