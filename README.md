# 追光者的相册

用照片记录生活，用文字记载瞬间。

这个网站用来展示相机拍下的画面，让每段经历都能被重新翻阅。

## Time 时间记录（/time）

站点同时发布时间记录应用，地址为 <https://zgzlcc.github.io/time>。源码在 `web/`，是独立的 Vue 3 + Vite 项目，与相册站点互不影响。

- 本地开发：`cd web && npm install && npm run dev`，地址 <http://127.0.0.1:5180/time/>。
- 构建：`pnpm build` 在完成相册构建后自动构建并复制网站版产物到 `dist/time/`，由 `script/momo/build-web.js` 负责。
- 单独构建：`npm run build:web`。
- 依赖安装：网站版用 npm 管理依赖，CI 中由 `npm --prefix web ci` 安装，不走 pnpm workspace。
- 功能、验证方式与云端同步开通步骤见 `web/README.md` 与 `web/docs/`。
