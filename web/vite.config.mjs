import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// 站点发布在 zgzlcc.github.io/time 子目录下，因此使用绝对 base：
// 无论本地预览还是线上，资源都从 /time/ 下取，避免深链接相对路径错位。
export default defineConfig({
  base: "/time/",
  plugins: [vue()],
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
  },
});
