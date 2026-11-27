// build-static.js — 把零依赖的财富自由计算器 wealth/ 原样复制到 dist/wealth/，发布在 /wealth 子目录。
// Time 网站版已迁到独立仓库 Time 的 web/，由该仓库的 Actions 单独发布，不再参与本站构建。
import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ROOT } from './lib.js'

// wealth/ 是纯静态站，没有构建步骤，只需要按白名单拷走会被部署的文件
const WEALTH_DIR = join(ROOT, 'wealth')
const WEALTH_TARGET = join(ROOT, 'dist', 'wealth')
const WEALTH_ENTRIES = ['index.html', 'icon.svg', 'src']

async function copyWealth() {
  const source = await stat(WEALTH_DIR).catch(() => null)
  if (!source?.isDirectory()) {
    console.error(`[wealth] 未找到 ${WEALTH_DIR}`)
    process.exit(1)
  }

  await rm(WEALTH_TARGET, { recursive: true, force: true })
  await mkdir(WEALTH_TARGET, { recursive: true })
  for (const entry of WEALTH_ENTRIES) {
    const from = join(WEALTH_DIR, entry)
    const found = await stat(from).catch(() => null)
    if (!found) {
      console.error(`[wealth] 缺少 ${from}`)
      process.exit(1)
    }
    await cp(from, join(WEALTH_TARGET, entry), { recursive: true })
  }
  console.log('[wealth] 已复制到 dist/wealth/')
}

await copyWealth()
