# 项目结构与代码功能

本文记录网站版仓库当前已存在的目录和代码职责。应用支持北京时间手动记录、四类标签、快速打卡、草稿补全、按周查看时间轴与选中日期／本周／累计分类时长、按日期跳转记录历史、JSON 备份导出与恢复、三态主题，以及可选的 Cloudflare Worker 云端同步；数据以浏览器 IndexedDB 为主，未配置云端时完全本地运行。

## 当前目录结构

```text
web/
├─ .gitignore
├─ README.md
├─ index.html
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ vite.config.mjs
├─ public/
│  └─ icon.svg
├─ scripts/
│  ├─ browser-check.mjs
│  ├─ core.test.mjs
│  ├─ day-range.test.mjs
│  ├─ dist.test.mjs
│  ├─ mock-worker.mjs
│  ├─ offline.test.mjs
│  ├─ sync.test.mjs
│  ├─ time.test.mjs
│  ├─ ts-resolve.mjs
│  └─ worker.test.mjs
├─ docs/
│  ├─ AGENTS.md
│  ├─ DESIGN-webflow.md
│  ├─ cloudflare-setup.md
│  ├─ implementation-plan.md
│  └─ project-structure.md
├─ worker/
│  ├─ admin.mjs
│  ├─ http.mjs
│  ├─ package.json
│  ├─ sync.cmd
│  ├─ sync.ps1
│  ├─ tsconfig.json
│  ├─ wrangler.toml
│  └─ src/
│     ├─ entries.ts
│     ├─ env.d.ts
│     ├─ http.ts
│     └─ index.ts
└─ src/
   ├─ App.vue
   ├─ api.ts
   ├─ day-range.ts
   ├─ main.ts
   ├─ style.css
   ├─ tags.ts
   ├─ theme.css
   ├─ theme.ts
   ├─ time.ts
   ├─ web.css
   ├─ components/
   │  ├─ BackupReminder.vue
   │  ├─ DateJump.vue
   │  └─ date-jump.css
   ├─ core/
   │  ├─ date.ts
   │  ├─ entries.ts
   │  ├─ entry-validation.ts
   │  ├─ errors.ts
   │  ├─ overlap.ts
   │  ├─ sync.ts
   │  ├─ timestamp.ts
   │  ├─ totals.ts
   │  └─ week.ts
   ├─ features/
   │  ├─ records/
   │  │  ├─ RecordForm.vue
   │  │  ├─ RecordList.vue
   │  │  ├─ RecordsPage.vue
   │  │  ├─ records-layout.css
   │  │  └─ records.css
   │  ├─ settings/
   │  │  ├─ CloudSyncCard.vue
   │  │  ├─ SettingsPage.vue
   │  │  └─ settings.css
   │  └─ week/
   │     ├─ DayStats.vue
   │     ├─ WeekExport.vue
   │     ├─ WeekGrid.vue
   │     ├─ WeekPage.vue
   │     ├─ WeekStats.vue
   │     ├─ week-grid.css
   │     ├─ week-image.ts
   │     └─ week.css
   └─ storage/
      ├─ backup-reminder.ts
      ├─ events.ts
      ├─ idb.ts
      ├─ index.ts
      ├─ indexeddb.ts
      ├─ mutex.ts
      ├─ network-hint.ts
      ├─ remote-settings.ts
      ├─ remote.ts
      ├─ repository.ts
      ├─ sync.ts
      └─ transfer.ts
```

## 目录与文件职责

### 项目根目录与文档

| 路径 | 当前职责 |
| --- | --- |
| `README.md` | 简述 1.0.0 已验证功能、运行与构建方式及数据说明。 |
| `index.html` | 页面入口；加载界面前按已保存主题或系统外观确定亮暗，并引入站点图标。 |
| `package.json` | npm 命令：开发服务器、预览、类型检查、纯函数检查、产物检查、浏览器实测、验证与生产构建。 |
| `package-lock.json` | 锁定 npm 依赖。 |
| `tsconfig.json` | 严格检查 `src/` 中的 TypeScript 与 Vue 文件，启用 `noUnusedLocals` 与 `verbatimModuleSyntax`。 |
| `vite.config.mjs` | `base: "/time/"`（站点发布在子目录）、ES2022 构建目标、`dist` 输出，以及通过 `define` 注入同步服务地址 `__TIME_SYNC_ENDPOINT__`，让用户端只填同步码。 |
| `public/icon.svg` | 黑色圆环、蓝色时针的图标原稿，同时用于页面顶部标识与站点图标。 |
| `scripts/ts-resolve.mjs` | Node 运行 TypeScript 源码时补全无扩展名相对导入，使 `src` 保持与 Vite 一致的写法。 |
| `scripts/core.test.mjs` | 检查校验、重叠、周区间裁剪、分类汇总、记录编号、时间戳比较与备份字段解析。 |
| `scripts/sync.test.mjs` | 检查两端合并规则：谁胜出、删除墓碑不被复活、两端一致判定与墓碑清理。 |
| `scripts/offline.test.mjs` | 检查网络不可达时的说明文案（区分被污染的 workers.dev 与其他地址）与备份提醒的触发阈值、导出时间读写。 |
| `scripts/worker.test.mjs` | 用内存版 KV 检查管理接口鉴权、同步码格式与创建、索引清单的强一致列出与自愈、多码数据隔离、停用后拒绝与启用后数据一条不少、CORS 与合并写入。 |
| `scripts/mock-worker.mjs` | 浏览器实测用的假 Worker：实现相同接口与合并规则，并可提供测试用备份文件。 |
| `scripts/time.test.mjs` | 检查北京时间转换、日期边界、整分钟时长显示、闰日与跨年周跳转及标题格式。 |
| `scripts/day-range.test.mjs` | 检查北京时间单日区间、跨 UTC 日界的日期归属、跨午夜记录归属与空日期不过滤。 |
| `scripts/calendar.test.mjs` | 检查日期选择器的日历计算：周一起始、42 格连续、闰年与二月天数、非法日期、跨月跨年加减。 |
| `scripts/dist.test.mjs` | 检查构建产物存在、资源引用为相对路径、不含桌面版依赖且包含 IndexedDB 实现。 |
| `scripts/browser-check.mjs` | 用 CDP 驱动无头 Edge／Chrome 实测页面：自行启停静态服务与假 Worker，走完记录、周视图、导出、备份恢复与云端同步链路，并用视口模拟在 375／390／360 三种手机宽度下检查横向溢出、点击目标尺寸与按钮换行，逐项打印结果。 |
| `scripts/ensure-ps1-bom.mjs` | 给 PowerShell 脚本补 UTF-8 BOM 并调用 PowerShell 解析器做语法检查；Windows PowerShell 5.1 缺少 BOM 时会按系统代码页读取，中文注释会导致语法报错。 |
| `docs/AGENTS.md` | 本目录的开发、验证与文档维护规范。 |
| `docs/DESIGN-webflow.md` | 前端视觉规范，包括配色、字体、间距、圆角、组件与响应式规则。 |
| `docs/cloudflare-setup.md` | 云端同步的 Cloudflare 开通与部署步骤、口令处理与额度说明。 |
| `docs/implementation-plan.md` | 网站版技术方案、数据规则、云端同步设计与验收口径。 |
| `docs/project-structure.md` | 当前目录与职责说明；代码或文档变化时同步维护。 |

### `worker/` Cloudflare 同步后端

| 路径 | 当前职责 |
| --- | --- |
| `worker/src/index.ts` | Worker 入口：管理接口（创建、列出、查看、改备注、停用、启用、彻底删除同步码）与数据接口（按同步码分区读写 KV）、`index/codes` 清单维护、请求体与单码记录数上限、按 `updatedAt` 合并。 |
| `worker/admin.mjs` | 同步码管理命令行工具：状态检查、创建、列出、查看、改备注、停用、启用、彻底删除；查看与停用/启用/删除可用同步码或备注定位；口令取自 `TIME_SYNC_ADMIN` 环境变量或 `.admin-token` 文件。 |
| `worker/http.mjs` | 请求与代理支持：识别 `HTTPS_PROXY`／`ALL_PROXY`／Windows 系统代理，经 CONNECT 隧道发 HTTPS 请求。Node 的 fetch 不读系统代理，直连会被 `*.workers.dev` 的 DNS 污染挡住，所以自行处理。 |
| `worker/sync.ps1` | 交互式管理脚本：编号菜单与带参数两种用法，覆盖同步码管理（含停用／启用）、口令保存、依赖与命名空间安装、部署、本地调试与状态检查。显示统一走 `Write-Host`，返回值只表示成功与否。 |
| `worker/sync.cmd` | `sync.ps1` 的 Windows 入口；无参数时进入菜单，退出码 10 表示用户选择退出。 |
| `worker/src/entries.ts` | 记录的结构校验与按 `updatedAt` 合并两份快照。 |
| `worker/src/http.ts` | 运行环境类型（KV 绑定名 `TIME_SYNC`）、JSON 响应、CORS 来源白名单、管理口令定长比较与同步码读取。 |
| `worker/src/env.d.ts` | Worker 运行环境的最小类型声明，只声明实际用到的 KV 接口。 |
| `worker/wrangler.toml` | Worker 名称、入口、兼容日期与 KV 绑定；管理口令通过 `wrangler secret` 注入。 |
| `worker/package.json` | Worker 的本地调试与部署命令。 |
| `worker/tsconfig.json` | 单独检查 `worker/` 源码类型。 |

### `src/core/` 纯逻辑

| 路径 | 当前职责 |
| --- | --- |
| `src/core/errors.ts` | 定义业务错误类型与错误码，并把任意异常转成可展示的中文提示。 |
| `src/core/entries.ts` | 定义记录、保存请求类型与状态判定，提供标签白名单校验与"已删除"判定。 |
| `src/core/timestamp.ts` | 生成记录编号（UUID）、统一取当前时间，并判断哪一份副本更新。 |
| `src/core/date.ts` | 校验 `YYYY-MM-DD` 并换算北京时间日期起点与日期序号。 |
| `src/core/entry-validation.ts` | 内容去空白与 500 字限制、起止校验、日期与标签校验、草稿与已完成判定；解析备份或云端返回的记录。 |
| `src/core/overlap.ts` | 判断区间是否相交，并按开始时间找出第一条冲突的已完成记录（忽略草稿、已删除并排除自身）。 |
| `src/core/totals.ts` | 定义统计与周视图类型，按 `[start, end)` 裁剪已完成记录并累加四类时长。 |
| `src/core/week.ts` | 计算北京时间周一至下周一区间、单日区间，组装逐日片段与本周统计。 |
| `src/core/sync.ts` | 纯函数合并规则：按 `updatedAt` 取较新副本、算出需要推送与需要拉回的记录、判断是否已同步、清理过期删除墓碑。 |

### `src/storage/` 本地存储与云端同步

| 路径 | 当前职责 |
| --- | --- |
| `src/storage/repository.ts` | 定义仓储接口与记录编号生成入口，覆盖列表、保存、删除、打卡、整体替换与同步写入。 |
| `src/storage/idb.ts` | IndexedDB 连接与版本升级、创建时间读写、记录读取与排序。 |
| `src/storage/indexeddb.ts` | 仓储实现：保存时同流程做重叠校验、删除写入墓碑、`applyRemote` 只覆盖更旧的本地记录、`mirrorRemote` 用快照整体覆盖并把快照里没有的记录打上删除标记。 |
| `src/storage/mutex.ts` | 串行化同一标签页内的写操作，避免读—判—写互相穿插。 |
| `src/storage/remote-settings.ts` | 云端地址与口令的本地读写、云端交互接口与同步状态类型。 |
| `src/storage/remote.ts` | HTTP 客户端：带口令请求 Worker，把 401、非 2xx 与网络失败转成可读提示。 |
| `src/storage/sync.ts` | 同步引擎：防抖推送、启动静默同步、离线状态与失败重试；`sync` 双向合并，`push` 用本地覆盖云端，`pull` 用云端覆盖本地（后两者走 `mirrorRemote`，会为被替换掉的记录留下墓碑，删除才能传到其他设备）。 |
| `src/storage/events.ts` | 本地数据变化的事件广播；写入成功后通知各页面刷新，并标记变化是否来自云端写入。 |
| `src/storage/network-hint.ts` | 网络不可达时的可操作提示；单独成模块以便无依赖地测试。 |
| `src/storage/backup-reminder.ts` | 上次导出备份时间的读写、单项过期判定，以及“同步或导出是否已超过 7 天”的提醒判断。 |
| `src/storage/transfer.ts` | 组装备份内容、生成备份文件名并解析校验备份文件。 |
| `src/storage/index.ts` | 导出应用唯一的仓储实例、同步引擎与数据变化事件。 |

### `src/` 前端界面

| 路径 | 当前职责 |
| --- | --- |
| `src/main.ts` | 创建 Vue 应用，加载全局、页面、主题与网站版新增样式并挂载。 |
| `src/App.vue` | 应用根组件，提供记录、周视图、设置三个页面导航并同步地址栏 hash。 |
| `src/api.ts` | 组件调用的统一门面：组合纯函数与仓储，提供记录、统计、周视图、下载与文件读取；集中导出传输类型。 |
| `src/tags.ts` | 统一维护四类标签的值、中文名称和强调色。 |
| `src/time.ts` | 在北京时间输入／显示与 UTC 毫秒之间转换，并提供日期跳转、周标题、完整日期标题与整分钟时长格式化。 |
| `src/day-range.ts` | 计算北京时间某一天的起止毫秒、把毫秒转为北京时间日期、按日筛选记录。 |
| `src/style.css` | 全局字体、重置、页面布局、亮色设计变量和通用按钮样式。 |
| `src/theme.ts` | 读取与保存主题选择，跟踪系统外观变化并应用亮暗主题。 |
| `src/theme.css` | 暗色主题的画布、卡片、表单、边框、文字和标签设计变量。 |
| `src/web.css` | 网站版新增的操作按钮同行布局（窄屏换行成每行两个）、表单堆叠与导出提示样式。 |
| `src/components/BackupReminder.vue` | 居中的备份提醒弹窗：距上次同步或上次导出超过 7 天时弹出，可跳到设置页导出或忽略当天；未配置云端同步时只看导出时间。 |
| `src/components/DatePicker.vue` | 自绘日期选择：触发按钮显示 `YYYY-MM-DD`，弹出七列日历（周一开头、固定 6 行、今天带边框、选中加深加粗），底部只有“今天”按钮，不提供手输搜索。 |
| `src/components/DateTimeField.vue` | 一组「日期 + 时间」：日期用 `DatePicker`，时间用 `TimeWheel`，触发按钮显示 `HH:MM`（未设置时显示 `--:--`），可一键清空，打开时默认落在当前时刻。 |
| `src/components/TimeWheel.vue` | 滚动时间选择器：小时与分钟两列竖条，列表渲染三份并在滚到外侧时平移回中间，做出无限循环（59 后面是 0、23 后面是 0）；上下内边距等于一条选中带高度，让首末项也能滚到正中；支持方向键与点击。 |
| `src/components/calendar.ts` | 日历纯计算：月份网格、周一起始、加减天／月（日号夹到目标月）、非法日期拒绝。 |
| `src/components/date-time.css` | 日期选择与时间下拉的样式，沿用项目的边框、圆角与配色变量。 |
| `src/components/DateJump.vue` | 复用“跳转日期”输入与可选“全部”按钮，向父组件抛出日期选择与恢复全部事件。 |
| `src/components/date-jump.css` | 跳转日期标签、日期输入和恢复按钮的对齐与控件样式。 |
| `src/features/records/RecordsPage.vue` | 页面状态协调：读取记录、独立开始时间打卡、常驻手动表单、保存、居中删除确认、错误反馈、保存后触发同步，并在数据变化时重新读取。 |
| `src/features/records/RecordForm.vue` | 分开的日期与时间输入、同日默认、可缺字段草稿、标签按钮及编辑补全。 |
| `src/features/records/RecordList.vue` | 待补全记录以固定宽度占位符显示起止时间；历史默认显示全部已完成记录并带日期标题，最多完整显示五条，可按日期跳转筛选并恢复全部。 |
| `src/features/records/records.css` | 记录列表与表单样式、历史单行时间（窄屏隐藏日期前缀）、标签配色、焦点状态和响应式规则。 |
| `src/features/records/records-layout.css` | 记录页卡片与历史布局、滚动窗口、历史标题栏的跳转日期控件、全宽标签按钮和居中确认框。 |
| `src/features/week/WeekPage.vue` | 周导航与统计协调；切换周或跳转日期时重新读取该日统计；点击时间块后滚动并聚焦到记录详情。 |
| `src/features/week/WeekGrid.vue` | 随窗口宽度适配的七天 00:00–24:00 时间轴、跨日记录片段与图片导出入口。 |
| `src/features/week/DayStats.vue` | 展示选中日期（今天时标注“（今天）”）的四类标签时长，不显示合计。 |
| `src/features/week/WeekStats.vue` | 展示本周或累计的四类标签时长，精度到分钟。 |
| `src/features/week/WeekExport.vue` | 生成并下载周记录 PNG，显示导出结果或错误提示。 |
| `src/features/week/week-image.ts` | 用 Canvas 绘制七天时间表与本周四类时长；导出保持固定浅色配色并生成文件名。 |
| `src/features/week/week.css` | 周视图导航、统计、详情及通用区块样式。 |
| `src/features/week/week-grid.css` | 自适应七天网格、小时刻度与分类事件色带样式。 |
| `src/features/settings/CloudSyncCard.vue` | 云端同步卡片：填写同步码（未注入服务地址时同时显示地址），保存配置、立即同步、上传本地记录、从云端恢复，并显示同步状态与错误。 |
| `src/features/settings/SettingsPage.vue` | 四张整行设置卡片：云端同步、JSON 备份导出与恢复（含清空记录）、本地数据概览、持久化的系统／亮／暗主题切换。 |
| `src/features/settings/settings.css` | 设置卡片布局、全宽三按钮主题选择及窄窗口适配。 |

## 当前调用流程

1. `index.html` 应用持久化主题后加载 `src/main.ts`，入口创建 `App.vue` 并启动同步引擎；未配置云端时同步引擎不发任何请求。
2. 记录页通过 `listEntries` 与 `listPending` 从 IndexedDB 读取历史及待补全内容；保存、删除与打卡经 `api.ts` 调用仓储，写入成功后更新界面并触发一次防抖同步。
3. 保存已完成记录时，仓储在同一流程内先做重叠校验，冲突则返回可读提示并保留表单输入。
4. 删除记录写入删除墓碑而不直接抹掉行，让其他设备也能同步到这次删除。
5. 周视图调用 `getWeek`、`getDayTotals` 与 `getAllTotals`：三者都读取全部记录，再分别按周区间、单日区间与全区间用同一套裁剪规则汇总四类时长。
6. 时间块滚动并聚焦到表格上方的完整详情；编辑入口切换到记录页右侧表单。
7. 设置页导出 JSON 备份、选择文件恢复、清空记录，并配置云端地址与口令；导出会记录时间，导入与清空都会广播一次数据变化事件，记录页与设置页据此重新读取。
8. 云端同步按记录合并两端：修改时间更晚者胜出，删除墓碑同样参与比较；推送结果由 Worker 返回合并后的全量记录，前端据此写回本地。连不上云端时按网络环境说明原因，本地记录不受影响。
9. 周记录图片用 Canvas 生成 PNG 并以 `Time_起始日期_结束日期.png` 触发下载。

## 构建产物与当前范围

- `node_modules/`、`dist/`、`.npm-cache/` 与 `worker/node_modules/` 是依赖或构建产物，由 `.gitignore` 排除。
- `npm run build` 产出 `dist/index.html`、`dist/icon.svg`、`dist/assets/` 下的单个 JavaScript 与 CSS 文件；全部资源使用相对路径引用，可直接放在静态托管的根目录或子目录。
- 记录使用 UTC Unix 毫秒存储，界面按北京时间显示；待补全记录可保留日期或只含开始时间，且不计入任何统计。
- 记录编号为客户端生成的 UUID，多设备离线各自新增也不会撞号；每条记录带 `updatedAt` 与删除用的 `deletedAt`。
- 当前界面支持四类标签按钮、手动记录、快速打卡、草稿、历史编辑删除与按日期跳转、按周浏览并定位详情、选中日期／本周／累计分类时长、周记录 PNG 下载、JSON 备份导出与恢复、清空记录、备份到期提醒、三态主题，以及可选的云端同步。
- 未配置云端时数据只存在于当前浏览器；配置云端后记录同时保存在浏览器与自建 Worker 中，换设备填入同一份地址与口令即可拉回。`*.workers.dev` 在国内的域名解析被污染，直连会失败，此时同步不可用但不影响记录。仓库不包含托管平台的部署配置与 Worker 的实际账号信息。
