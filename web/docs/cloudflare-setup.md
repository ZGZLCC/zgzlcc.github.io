# Cloudflare 云端同步部署步骤

网站版不需要后端也能用；只有想让记录在换浏览器、换设备后仍然拿得回来时，才需要按本文开一次 Cloudflare 的免费后端。全程零费用，不需要信用卡。

用到的服务只有两个，都在 Cloudflare Workers 免费额度内：

| 服务 | 免费额度 | 本应用的实际消耗 |
| --- | --- | --- |
| Workers 请求 | 10 万次/天 | 每次保存或同步算 1 次，个人使用每天几十次 |
| D1 行写入 | 10 万行/天 | 每次同步写入变更的记录 |
| D1 行读取 | 500 万行/天 | 每次拉取读取全部记录 |
| D1 存储 | 5 GB | 十年记录约 1～2 MB |

## 一、准备工作

1. 注册 Cloudflare 账号：<https://dash.cloudflare.com/sign-up>，免费版即可，不需要绑定支付方式。
2. 本机已安装 Node.js（与应用相同的要求）。

## 二、创建 D1 数据库

在 `web/worker` 目录下执行：

```bash
cd web/worker
npx wrangler login                     # 浏览器里点授权，只需一次
npx wrangler d1 create time-sync       # 创建数据库
```

命令会输出一段包含 `database_id` 的配置。把 `worker/wrangler.toml` 里的
`database_id` 换成这个真实 id。

**三个名字不要混淆：**

| 配置项 | 作用 | 本项目用的值 |
| --- | --- | --- |
| `binding` | 代码里访问它的变量名，即 `env.xxx` | `time_sync` |
| `database_name` | 数据库在 Cloudflare 上的名字 | `time-sync` |
| `database_id` | 数据库的真实 ID | 创建时输出的 UUID |

只有 `binding` 必须与代码一致：Cloudflare 会把数据库名里的 `-` 换成 `_` 作为默认绑定名，
所以 `time-sync` 的默认绑定名就是 `time_sync`。本项目的 `wrangler.toml` 与
`worker/src/http.ts` 已按这个名字对齐；若改成别的名字，这两处必须一起改。

## 三、建表

```bash
npx wrangler d1 execute time-sync --remote --file=schema.sql
```

## 四、设置访问口令

口令就是前端设置页要填的那串字符，相当于这个后端的唯一钥匙。自己生成一串足够长的随机字符，例如：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

把输出原样存进 Worker：

```bash
npx wrangler secret put SYNC_TOKEN
coESKmt81npS2Kmv5WG89kOq3EYNw8cyf3i8FSxiUa8
# 粘贴上一步生成的口令，回车
```

口令不会进入代码或仓库；换成新口令后，前端设置页里也要同步更新。

## 五、部署 Worker

```bash
npx wrangler deploy
```

部署成功后会输出形如 `https://time-sync.<你的账号>.workers.dev` 的地址，这就是前端要填的 Worker 地址。

## 六、在应用里配置

打开网站版的设置页，在「云端同步」卡片里填写：

- **Worker 地址**：上一步输出的地址
- **访问口令**：第四步设置的口令

先点「保存配置」，再点「上传本地记录」把浏览器里已有的记录推上云端。之后每次保存都会自动同步；换设备时填入同一份地址与口令，打开页面就会自动拉回全部记录。

## 七、验证是否接通

```bash
# 不带口令应当返回 401
curl https://time-sync.<你的账号>.workers.dev/api/entries

# 带上口令应当返回记录列表
curl -H "X-Time-Token: 你的口令" https://time-sync.<你的账号>.workers.dev/api/entries
```

## 八、需要知道的三件事

1. **口令等于访问权。** 拿到口令的人就能读写你的记录，它保存在浏览器 localStorage 里，不是加密。请勿把口令写进代码、截图或公开仓库。
2. **免费额度不会过期但会按天重置。** 额度在每天 00:00 UTC 重置；个人使用远远用不完。Cloudflare 明确说明 Workers 免费版会一直保留 D1 的试用能力。
3. **云端不是唯一副本。** 记录同时保存在浏览器本地，云端是第二份副本；建议仍然定期在设置页导出 JSON 备份，它是完全不依赖任何服务商的最后一道保险。应用会在距上次导出超过 7 天时提醒，设置页也会显示上次导出时间。

## 八点五、国内直连的限制

`*.workers.dev` 的域名解析在国内被污染：实测 A 记录指向 Verizon 地址段（`128.242.240.157`）、AAAA 记录指向 Meta 地址段（`2a03:2880::`），Cloudflare 的 IPv4 网段也不可达（`104.16` / `172.64` / `188.114` 全部连接超时）。因此**不挂代理时同步一定失败，这与配置是否正确无关**。

表现是设置页显示「同步失败」并给出上述说明。此时记录、统计、导出、备份全部正常，只是不同步；本地记录不受任何影响，恢复可用网络后会自动重试。

要摆脱这个限制只有两条路：挂代理使用，或者把后端换到国内服务商（并接受实名认证与备案要求）。

## 九、常见问题

**同步一直失败，或者 Worker 返回 500 并提到 `undefined`。**
先确认 D1 绑定名与代码一致：`wrangler.toml` 的 `binding` 必须是 `time_sync`，
`worker/src/http.ts` 里的字段名也必须是 `time_sync`。绑定名不匹配时 Worker 能部署成功，
但一请求就会因为拿不到数据库而报错。

另外确认 `SYNC_TOKEN` 已设置：没设置时所有请求都会返回 401。

**改了 `wrangler.toml` 但没生效。**
配置改动需要重新执行 `npx wrangler deploy` 才会上线。

**该用 CLI 还是 Dashboard 管绑定？**
两者选一个就好。用 `wrangler deploy` 部署时以 `wrangler.toml` 为准；
在 Dashboard 的 Worker → 设置 → 绑定里手动加数据库时，变量名也填 `time_sync`，
不要一边改 Dashboard 一边改 `wrangler.toml`，否则下次部署可能把手工改动覆盖掉。

## 十、本地调试

不部署也能验证 Worker：

```bash
cd web/worker
npx wrangler dev                        # 本地起一个 Worker，自动使用本地 D1
npx wrangler d1 execute time-sync --local --file=schema.sql
```

## 十一、可选：限定允许访问的站点

默认放行这些来源：

- `https://zgzlcc.github.io` —— 线上站点
- `http://localhost:4321`、`http://localhost:4322`（含 `127.0.0.1`）—— 相册站点的本地预览端口，用于整站联调
- `http://127.0.0.1:5180`、`http://127.0.0.1:5181`（含 `localhost`）—— 网站版自身的开发与预览端口

如果以后换域名，在 `wrangler.toml` 里加：

```toml
[vars]
ALLOWED_ORIGINS = "https://zgzlcc.github.io,https://你的新域名"
```

**一旦显式配置 `ALLOWED_ORIGINS`，上面的默认列表就整体失效**，只放行写进去的那几个，本地调试地址也要一并写上。改完重新执行 `npx wrangler deploy`。
