# Cloudflare 云端同步部署步骤

网站版不需要后端也能用。只有想让记录在换浏览器、换设备后仍然拿得回来，或者**给别人发同步码**时，才需要按本文开一次 Cloudflare 免费后端。全程零费用，不需要信用卡。

用到的只有两个免费服务：

| 服务 | 免费额度 | 本应用的实际消耗 |
| --- | --- | --- |
| Workers 请求 | 10 万次/天 | 每次保存或同步算 1 次，每个用户每天几十次 |
| KV 读取 | 10 万次/天 | 每次同步读 1～2 个键 |
| KV 写入 | 1000 次/天 | 每次同步写 2 个键 |
| KV 存储 | 1 GB | 一万条记录约几百 KB |

**写入次数是主要瓶颈**：1000 次/天按每次同步写 2 个键算，大约支持每天 500 次同步，够几个到十几个用户用。人再多就要换 D1（额度大得多）。

## 一、工作原理

一个**同步码**对应一份独立数据，码只能由你创建：

```
codes/time_xxxx     → 这份码是否存在、发给谁、是否被停用
entries/time_xxxx   → 这份码下的全部记录
```

- 你持有 **ADMIN_TOKEN**，能创建、查看、停用与启用同步码
- 用户只拿到一个**同步码**，用它读写自己那份数据
- 码是数据分区标识，**不是密钥**：用户打开浏览器开发者工具就能看到自己的码。所以码不能拿来当权限边界，安全靠"码足够长猜不到 + 只有你能创建 + 可以随时停用或启用"

## 二、创建 KV 命名空间

在 `web/worker` 目录下执行：

```bash
cd web/worker
npx wrangler login                          # 浏览器里点授权，只需一次
npx wrangler kv namespace create TIME_SYNC --binding TIME_SYNC --update-config
```

`--binding TIME_SYNC --update-config` 会自动把命名空间 id 写进 `wrangler.toml`，不用手工复制。执行完确认一下文件里 `id` 已经不是 `REPLACE_WITH_KV_NAMESPACE_ID`。

## 三、设置管理口令

这是**唯一**需要你保管好的密钥，它决定谁能创建同步码。

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
npx wrangler secret put ADMIN_TOKEN
# 提示 Enter a secret value 时粘贴上一步的输出
```

口令不会进入代码或仓库，请存进密码管理器。**不要把它发给任何人**，也不要在聊天里贴出来。

> 注意命令形式：`secret put` 后面跟的是**名字**（`ADMIN_TOKEN`），值在交互提示里粘贴。写成 `secret put <值>` 会创建出一个名字是那串值的密钥。

## 四、部署

```bash
npx wrangler deploy
```

输出形如 `https://time-sync.<你的子域>.workers.dev` 的地址。如果提示需要先注册 `workers.dev` 子域，按提示注册即可（子域注册后不可更改）。

## 五、创建第一个同步码（你自己用）

同步码用交互式管理脚本打理，像根目录的 `manage` 一样：双击或直接运行 `web\worker\sync.cmd` 会进入菜单。

```powershell
cd web\worker
.\sync.cmd
```

```
Time 同步服务管理

  1 查看同步码      2 创建同步码     3 查看某个码     4 修改备注
  5 停用同步码      6 启用同步码     7 彻底删除
  8 设置管理口令    9 安装依赖与命名空间
 10 部署 Worker    11 本地调试      12 查看状态       0 退出

  停用只是切断同步，数据一条不动，随时可以启用回来；
  彻底删除会连数据一起删掉，需要二次确认。

输入数字:
```

**第一次用先选 `8` 把管理口令存下来**（只存在 `web\worker\.admin-token`，该文件已被 `.gitignore` 忽略），然后选 `1` 看列表、选 `2` 创建。

也可以带参数直接执行，便于放进脚本：

```powershell
.\sync.cmd status               # 看服务地址、命名空间、口令、代理与连通性
.\sync.cmd list                 # 列出同步码
.\sync.cmd create 我自己         # 创建
.\sync.cmd show time_xxx        # 详情
.\sync.cmd rename time_xxx 李四  # 改备注
.\sync.cmd revoke time_xxx      # 停用
.\sync.cmd restore time_xxx     # 启用
.\sync.cmd purge time_xxx       # 彻底删除（会再问一次确认）
```

### 停用与删除的区别

| 操作 | 对方还能同步吗 | 数据 | 能否恢复 |
| --- | --- | --- | --- |
| **停用** `revoke` | 不能，码立即失效 | **一条不动** | 能，`restore` 启用后照旧使用 |
| **彻底删除** `purge` | 不能，码不存在 | **全部删除** | 不能 |

停用适合这些场景：暂时不想让对方继续写、怀疑码外泄、想先掐断再排查。启用后对方的记录、创建时间、备注全都还在，用原来的码继续同步即可。**停用不会重置任何东西。**

删除只用在确定不再需要这份数据时，需要 `--yes` 二次确认。

`list` 的输出：

```
共 2 个同步码（启用中 2 个，已停用 0 个）：

  1. time_b7xK2mQ9wZ4nR8tY6uP3sL5vC1aD0eFg
     备注：张三
     创建：2026-10-06 14:20    状态：有效
     记录：128 条    最近同步：2026-10-06 18:03
```

**查看、改备注、停用/启用、删除都既接受同步码，也接受备注**，按备注记比抄那串长码方便：

```powershell
.\sync.cmd show 张三        # 等价于 show time_b7xK2mQ...
```

备注重名时会全部列出，并提示改用同步码指定。全新的码从没同步过，显示为 `记录：0 条    最近同步：从未同步`，这是正常的。

创建后会打印一个 `time_...` 的码，把它填进网页设置页的「同步码」，点「保存配置」→「上传本地记录」，云端就有一份了。

发码时建议一起说明两件事：

1. 把码粘贴到设置页的「同步码」，再点「保存配置」
2. **请定期在设置页导出 JSON 备份**——云端只是第二份副本，无法替代自己手里的备份

### 也可以直接用命令行工具

`admin.mjs` 是同一套功能的非交互版本，适合写进其他脚本：

```powershell
$env:TIME_SYNC_ADMIN = "你的ADMIN_TOKEN"
node admin.mjs status
node admin.mjs list
node admin.mjs create 张三
node admin.mjs rename time_xxx 李四
node admin.mjs revoke time_xxx      # 停用
node admin.mjs restore time_xxx     # 启用
node admin.mjs purge time_xxx --yes # 彻底删除
```

### 代理

`admin.mjs` **自己会走代理**，不需要额外设置。查找顺序是：

1. `TIME_SYNC_PROXY` 环境变量
2. `HTTPS_PROXY` / `ALL_PROXY` 环境变量
3. Windows「Internet 选项」里的系统代理（读注册表）
4. 都没有就直连

之所以要自己做这件事：Node 的 `fetch` **不读** Windows 系统代理设置，只认环境变量。而 PowerShell 的 `Invoke-WebRequest` 和 `wrangler` 会走系统代理。如果不管，就会出现「状态显示能连、列表却说连不上」这种自相矛盾的情况——两台工具走了两条网络路径。

`.\sync.cmd status` 会把探测到的代理和来源一并打印出来，便于确认走对了：

```
服务地址：https://time-sync.zgzlcc.workers.dev
管理口令：已配置
代理：http://127.0.0.1:7897（Windows 系统代理）
连通性：服务可访问，鉴权生效
```

## 七、本地调试

不部署也能验证 Worker：菜单里选 `10`，或直接执行：

```powershell
cd web\worker
.\sync.cmd local                # 等价于 npx wrangler dev
```

用 `.\sync.cmd install`（菜单 `8`）会自动安装依赖并在需要时创建 KV 命名空间。

## 八、需要知道的四件事

1. **你在替别人保管数据。** 发码之后，别人的时间记录存在你的 Cloudflare 账号里。账号出问题、误删命名空间、超额停服，都会影响到他们。所以务必提醒对方自己也导出备份。
2. **免费额度是全局共享的。** KV 每天 1000 次写入由所有用户共用，某个用户用量异常会拖慢所有人。应用已加单码 2 万条记录上限和 2 MB 单次请求上限，但挡不住“很多人一起用”。
3. **停用与删除是两件事。** `revoke` 只让码失效，数据一条不动，`restore` 就能原样启用回来；只有 `purge` 才会删除数据且无法恢复。绝大多数情况你要的是停用。
4. **码等于读写权限。** 拿到码就能改那份数据，没有只读码。给别人看但不能改的需求要另做功能；只想临时掐断就用停用。

## 九、可选：限定允许访问的站点

默认放行这些来源：

- `https://zgzlcc.github.io` —— 线上站点
- `http://localhost:4321`、`http://localhost:4322`（含 `127.0.0.1`）—— 相册站点的本地预览端口
- `http://127.0.0.1:5180`、`http://127.0.0.1:5181`（含 `localhost`）—— 网站版自身的开发与预览端口

换域名时在 `wrangler.toml` 里加：

```toml
[vars]
ALLOWED_ORIGINS = "https://zgzlcc.github.io,https://你的新域名"
```

**一旦显式配置，上面的默认列表就整体失效**，本地调试地址也要一并写上。改完重新 `npx wrangler deploy`。

## 十、国内直连的限制

`*.workers.dev` 的域名解析在国内被污染（A 记录指向 Verizon 网段、AAAA 记录指向 Meta 网段），Cloudflare 的 IPv4 网段也不可达。因此**不挂代理时国内无法使用同步，这与配置是否正确无关**。

这直接影响"发给别人"这件事：**国内的朋友拿到码也用不了**，除非他们自己有代理。要真正可用，需要把 Worker 绑到自己的域名上（域名要花钱，且境内可达性仍需实测）。

此时本地记录、统计、导出、备份全部正常，只是不同步。
