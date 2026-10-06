param(
    [ValidateSet(
        'list', 'create', 'show', 'rename', 'revoke', 'restore', 'purge',
        'status', 'install', 'deploy', 'local', 'token',
        # 接受短名，方便直接敲 `.\sync.cmd new 张三`
        'new', 'set', 'enable', 'disable', 'delete', 'ls', 'rm'
    )][string]$Action,
    # 接住任意多个位置参数，这样 `purge change --yes` 里的 --yes 也不会被丢掉
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
)

$ErrorActionPreference = 'Stop'

# node 输出的是 UTF-8 字节，Windows PowerShell 默认按控制台代码页（简中是 GBK）解码，
# 中文会变成「鏈嶅姟鍦板潃」这类乱码。这里同时统一输入输出编码。
try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
} catch {
    # 某些宿主不允许改编码，此时最多是外部程序的中文显示异常，不影响功能
}

$root = $PSScriptRoot
$config = Join-Path $root 'wrangler.toml'
$tokenFile = Join-Path $root '.admin-token'
$cli = Join-Path $root 'admin.mjs'
$localWrangler = Join-Path $root 'node_modules\.bin\wrangler.cmd'
$defaultUrl = 'https://time-sync.zgzlcc.workers.dev'

function Get-Endpoint {
    if ($env:TIME_SYNC_URL) { return $env:TIME_SYNC_URL.TrimEnd('/') }
    return $defaultUrl
}

# 口令来源优先级：环境变量 > 本地 .admin-token 文件。文件里只放一行口令。
function Get-AdminToken {
    if ($env:TIME_SYNC_ADMIN) { return $env:TIME_SYNC_ADMIN.Trim() }
    if (Test-Path $tokenFile) { return (Get-Content $tokenFile -Raw).Trim() }
    return ''
}

function Save-AdminToken([string]$token) {
    Set-Content -LiteralPath $tokenFile -Value $token -Encoding ascii -NoNewline
    Write-Host '已保存到 web\worker\.admin-token（该文件已被 .gitignore 忽略，不会提交）。'
}

function Get-NamespaceId {
    $match = Select-String -LiteralPath $config -Pattern '^\s*id\s*=\s*"([^"]+)"' | Select-Object -First 1
    if (!$match) { return '' }
    return $match.Matches[0].Groups[1].Value
}

# 把本机保存的口令与服务地址注入环境变量，供 admin.mjs 读取。
# 凡是调用 admin.mjs 的地方都必须先过这一步，否则它会以为自己没配口令——
# 状态检查曾经漏了这一步，于是出现「列表说连上了、状态说口令未配置」的矛盾。
function Use-AdminEnvironment {
    $token = Get-AdminToken
    if ($token) { $env:TIME_SYNC_ADMIN = $token }
    $env:TIME_SYNC_URL = Get-Endpoint
}

# 调用 admin.mjs。它自己会走系统代理，所以连通性与列表使用同一条路径。
#
# 全部显示都走 Write-Host（信息流），返回值只表示成功与否。原因是 PowerShell 中
# 一旦用变量接收函数返回值（$ok = Run-SyncManager ...），函数内部所有裸字符串
# 表达式都会被捕获进变量而不再打印——那是它最容易踩的坑。
function Invoke-Admin([string[]]$cliArgs) {
    Use-AdminEnvironment
    Push-Location $root
    try {
        & node $cli @cliArgs | Write-Host
        return ($LASTEXITCODE -eq 0)
    } finally { Pop-Location }
}

function Resolve-Wrangler {
    if (Test-Path $localWrangler) { return $localWrangler }
    return 'npx'
}

function Invoke-Wrangler([string[]]$cliArgs) {
    $wrangler = Resolve-Wrangler
    Push-Location $root
    try {
        if ($wrangler -eq 'npx') {
            & npx wrangler @cliArgs | Write-Host
        } else {
            & $wrangler @cliArgs | Write-Host
        }
        return ($LASTEXITCODE -eq 0)
    } finally { Pop-Location }
}

function Show-Status {
    $id = Get-NamespaceId
    if ($id -and $id -ne 'REPLACE_WITH_KV_NAMESPACE_ID') {
        Write-Host "KV 命名空间：$id"
    } else {
        Write-Host 'KV 命名空间：尚未绑定（先执行「8 安装依赖与命名空间」）'
    }
    if (Test-Path $localWrangler) {
        Write-Host 'wrangler：已安装在 worker\node_modules'
    } else {
        Write-Host 'wrangler：未安装，将使用 npx（首次较慢）'
    }
    # 地址、口令、代理与连通性交给 admin.mjs 输出，避免两边判断口径不同
    Use-AdminEnvironment
    Push-Location $root
    try {
        & node $cli status | Write-Host
    } finally { Pop-Location }
}

function Show-Codes {
    if (!(Get-AdminToken)) {
        Write-Host '还没有配置管理口令，无法列出同步码。先在菜单里选「7 设置管理口令」。'
        return $false
    }
    return (Invoke-Admin @('list'))
}

function Show-Code([string]$code) {
    if (!$code) { $code = Read-Host '同步码（time_ 开头），或创建时填的备注' }
    return (Invoke-Admin @('show', $code))
}

function New-Code([string]$label) {
    if (!$label) { $label = Read-Host '备注（发给谁，便于以后辨认，可留空）' }
    return (Invoke-Admin @('create', $label))
}

function Rename-Code([string]$code, [string]$label) {
    if (!$code) { $code = Read-Host '要改备注的同步码，或它当前的备注' }
    if (!$code) { Write-Host '未输入内容，已取消。'; return $false }
    if (!$label) { $label = Read-Host '新的备注' }
    return (Invoke-Admin @('rename', $code, $label))
}

# 停用 / 启用共用同一段交互：目标既可以是同步码，也可以是备注。
# $target 为空时才提示输入，这样 `.\sync.cmd revoke 1` 也能一次跑完。
function Set-CodeEnabled([bool]$enable, [string]$target) {
    $code = $target
    if (!$code) { $code = Read-Host '目标同步码，或它的备注' }
    if (!$code) { Write-Host '未输入内容，已取消。'; return $false }
    if ($enable) { return (Invoke-Admin @('restore', $code)) }
    return (Invoke-Admin @('revoke', $code))
}

# 彻底删除。带 --yes 直接执行；否则先打印预览再问一次。
function Remove-Code([string]$target, [bool]$confirmed) {
    $code = $target
    if (!$code) { $code = Read-Host '目标同步码，或它的备注' }
    if (!$code) { Write-Host '未输入内容，已取消。'; return $false }
    if ($confirmed) { return (Invoke-Admin @('purge', $code, '--yes')) }
    # 预览的返回值不代表失败，所以不看它的结果
    Invoke-Admin @('purge', $code) | Out-Null
    $answer = Read-Host '确认永久删除请输入 yes'
    if ($answer -ne 'yes') { Write-Host '已取消。'; return $true }
    return (Invoke-Admin @('purge', $code, '--yes'))
}

function Set-TokenInteractively {
    $token = Read-Host '粘贴 ADMIN_TOKEN'
    if (!$token) { Write-Host '未输入口令，未做修改。'; return $false }
    Save-AdminToken $token.Trim()
    return $true
}

function Install-Dependencies {
    Write-Host '正在安装 worker 依赖（wrangler）…'
    Push-Location $root
    try {
        & npm install --no-audit --no-fund | Write-Host
        if ($LASTEXITCODE -ne 0) { Write-Host 'npm install 失败，请检查网络后重试。'; return $false }
        Write-Host '依赖安装完成。'
        return $true
    } finally { Pop-Location }
}

function Install-Namespace {
    $id = Get-NamespaceId
    if ($id -and $id -ne 'REPLACE_WITH_KV_NAMESPACE_ID') {
        Write-Host "KV 命名空间已绑定：$id"
        return $true
    }
    Write-Host '还没有 KV 命名空间，正在创建…'
    Invoke-Wrangler @('kv', 'namespace', 'create', 'TIME_SYNC', '--binding', 'TIME_SYNC', '--update-config') | Out-Null
    $id = Get-NamespaceId
    if ($id -and $id -ne 'REPLACE_WITH_KV_NAMESPACE_ID') {
        Write-Host "KV 命名空间已绑定：$id"
        return $true
    }
    Write-Host '没有写入 id。可能命名空间已存在，用以下命令查出 id 后填进 wrangler.toml：'
    Write-Host '  npx wrangler kv namespace list'
    return $false
}

function Deploy-Worker {
    Write-Host '正在部署 Worker…'
    $deployed = Invoke-Wrangler @('deploy')
    if (!$deployed) { return $false }
    Write-Host ''
    Show-Status
    return $true
}

function Start-Local {
    Write-Host '启动本地 Worker（Ctrl+C 退出）。本地 KV 是模拟的，不会动线上数据。'
    Invoke-Wrangler @('dev') | Out-Null
    return $true
}

function Run-SyncManager([string]$operation, [string[]]$rest) {
    $first = if ($rest -and $rest.Count -ge 1) { $rest[0] } else { '' }
    $second = if ($rest -and $rest.Count -ge 2) { $rest[1] } else { '' }
    switch ($operation) {
        'list' { return (Show-Codes) }
        'create' { return (New-Code $first) }
        'show' { return (Show-Code $first) }
        'rename' { return (Rename-Code $first $second) }
        'revoke' { return (Set-CodeEnabled $false $first) }
        'restore' { return (Set-CodeEnabled $true $first) }
        'purge' { return (Remove-Code $first ($rest -contains '--yes')) }
        'status' { Show-Status; return $true }
        # 这里不能写成 ((Install-Dependencies) -and ...)：PowerShell 会把第一个函数的
        # 全部输出当作布尔值吃掉，安装过程的信息就看不到了。
        'install' {
            $installed = Install-Dependencies
            if (!$installed) { return $false }
            return (Install-Namespace)
        }
        'deploy' { return (Deploy-Worker) }
        'local' { return (Start-Local) }
        'token' { return (Set-TokenInteractively) }
        default { throw "未知操作：$operation" }
    }
}

function Show-Menu {
    Write-Host 'Time 同步服务管理'
    Write-Host ''
    Write-Host '  1 查看同步码      2 创建同步码     3 查看某个码     4 修改备注'
    Write-Host '  5 停用同步码      6 启用同步码     7 彻底删除'
    Write-Host '  8 设置管理口令    9 安装依赖与命名空间'
    Write-Host ' 10 部署 Worker    11 本地调试      12 查看状态       0 退出'
    Write-Host ''
    Write-Host '  停用只是切断同步，数据一条不动，随时可以启用回来；'
    Write-Host '  彻底删除会连数据一起删掉，需要二次确认。'
    Write-Host ''
}

# 短名映射，方便直接敲 `.\sync.cmd new 张三`
if ($Action) {
    $Action = switch ($Action) {
        'new' { 'create' } 'set' { 'rename' } 'ls' { 'list' }
        'enable' { 'restore' } 'disable' { 'revoke' }
        'delete' { 'purge' } 'rm' { 'purge' }
        default { $Action }
    }
}

# 带参数：执行一次就结束，失败时返回非零退出码，便于写进其他脚本。
# 必须先用变量接收返回值：写成 if (Run-SyncManager ...) 会把函数的所有输出
# 吸进条件判断里，界面上就什么都看不到了。
if ($Action) {
    $ok = Run-SyncManager $Action $Arguments
    if ($ok) { exit 0 } else { exit 1 }
}

# 无参数：菜单循环。任何失败都回到菜单，并保留下面的提示。
while ($true) {
    Show-Menu
    $choice = Read-Host '输入数字'
    $operation = switch ($choice) {
        '1' { 'list' } '2' { 'create' } '3' { 'show' } '4' { 'rename' }
        '5' { 'revoke' } '6' { 'restore' } '7' { 'purge' }
        '8' { 'token' } '9' { 'install' } '10' { 'deploy' }
        '11' { 'local' } '12' { 'status' } '0' { 'quit' } default { '' }
    }
    if ($operation -eq 'quit') { exit 10 }
    if ($operation -eq '') {
        Write-Host '无效选择。'
        Write-Host ''
        continue
    }
    Write-Host ''
    try {
        Run-SyncManager $operation '' | Out-Null
    } catch {
        Write-Host "操作未完成：$($_.Exception.Message)"
    }
    Write-Host ''
    Write-Host '按回车回到菜单…'
    Read-Host | Out-Null
}
