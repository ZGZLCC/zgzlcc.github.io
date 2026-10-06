// build-web.js — 构建 Time 网站版并把产物复制到 dist/time/，供站点发布在 /time 子目录
import { spawnSync } from 'node:child_process'
import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ROOT } from './lib.js'

const WEB_DIR = join(ROOT, 'web')
const SOURCE = join(WEB_DIR, 'dist')
const TARGET = join(ROOT, 'dist', 'time')

const isWindows = process.platform === 'win32'
const npmArgs = ['--prefix', 'web', 'run', 'build']

console.log('[web] 构建 Time 网站版…')
// Windows 上 npm 是 npm.cmd，需要经 cmd.exe 调用；用固定参数，不引入 shell 拼接
const build = isWindows
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm', ...npmArgs], { cwd: ROOT, stdio: 'inherit' })
  : spawnSync('npm', npmArgs, { cwd: ROOT, stdio: 'inherit' })
if (build.status !== 0) {
  console.error('[web] 构建失败，未复制任何文件')
  process.exit(build.status ?? 1)
}

const built = await stat(SOURCE).catch(() => null)
if (!built?.isDirectory()) {
  console.error(`[web] 未找到构建产物 ${SOURCE}`)
  process.exit(1)
}

// 先清掉上一次的副本，避免旧资源文件残留
await rm(TARGET, { recursive: true, force: true })
await mkdir(TARGET, { recursive: true })
await cp(SOURCE, TARGET, { recursive: true })

console.log('[web] 已复制到 dist/time/')
