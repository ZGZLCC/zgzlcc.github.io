// store.mjs — 博客文章文件（src/content/blog/**/*.md）的统一读写层
import matter from 'gray-matter'
import { readdir, readFile, writeFile, mkdir, rm, stat, rename } from 'node:fs/promises'
import { join, dirname, basename, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// 博客内容根目录：cms/server/ -> ../../src/content/blog/
export const BLOG_DIR = fileURLToPath(new URL('../../src/content/blog/', import.meta.url))

export const LANGS = ['zh-cn']

// 并发读取上限：文章较多时，逐个 await 读取会明显拖慢一次扫描
const READ_CONCURRENCY = 32

// ---------- 解析结果缓存 ----------
// 之前每次请求都会重新遍历目录、读取并解析所有 markdown，
// 文章一多就非常慢。这里以 (mtimeMs, size) 作为缓存键：文件没变直接复用解析结果，
// 只有文件真正变化（CMS 保存、外部编辑、git 切换）时才重新读取。
// 保存/删除路径同时会主动失效缓存，双保险。
const parseCache = new Map() // absPath -> { key, data }

// 用 mtime + 文件大小作为缓存键；文件不存在返回 null
async function fileKey(file) {
  const st = await stat(file).catch(() => null)
  if (!st?.isFile()) return null
  return `${st.mtimeMs}:${st.size}`
}

// 读取并解析单个 markdown（带缓存）
async function loadParsed(file) {
  const key = await fileKey(file)
  if (!key) return null
  const cached = parseCache.get(file)
  if (cached && cached.key === key) return cached
  const raw = await readFile(file, 'utf-8').catch(() => null)
  if (raw === null) return null
  const parsed = matter(raw)
  const entry = { key, data: parsed.data }
  parseCache.set(file, entry)
  return entry
}

// 有界并发 map，返回值顺序与输入一致
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

// 手动失效缓存（写入 / 删除路径使用）
function forget(file) {
  parseCache.delete(file)
}

function forgetUnder(dir) {
  const prefix = dir.endsWith(sep) ? dir : dir + sep
  for (const key of [...parseCache.keys()]) {
    if (key.startsWith(prefix)) parseCache.delete(key)
  }
}

// 校验相对路径（防止目录穿越）
export function safeRel(rel) {
  if (!rel || typeof rel !== 'string') return null
  const normalized = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..') || normalized.includes('\0')) return null
  return normalized
}

export function blogPath(rel) {
  return join(BLOG_DIR, ...rel.split('/'))
}

// 递归收集目录下所有文件；子目录并发读取，但拼接顺序与串行 DFS 完全一致
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const jobs = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) jobs.push(walk(full))
    else if (entry.isFile()) jobs.push(Promise.resolve([full]))
  }
  const out = []
  for (const job of jobs) out.push(...(await job))
  return out
}

export function dateStr(v) {
  if (!v) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

// 规范化 frontmatter 字段
export function normalizeData(data) {
  const d = { ...(data || {}) }
  delete d.category
  if (d.pubDate) d.pubDate = dateStr(d.pubDate)
  if (typeof d.draft !== 'boolean') d.draft = d.draft ? true : false
  if (typeof d.pinTop !== 'number') d.pinTop = Number(d.pinTop) || 0
  return d
}

// 单次遍历目录，把中文 Markdown 文件按相册路径分组
async function collectArticleFiles() {
  const byPath = new Map()
  const all = []
  for (const file of await walk(BLOG_DIR)) {
    if (extname(file) !== '.md') continue
    if (basename(file).startsWith('_')) continue
    const rel = file.slice(BLOG_DIR.length).replace(/\\/g, '/').replace(/^\//, '')
    const parts = rel.split('/')
    const lang = parts.pop().replace(/\.md$/, '')
    if (!LANGS.includes(lang)) continue
    const path = parts.join('/')
    let entry = byPath.get(path)
    if (!entry) byPath.set(path, (entry = { files: {} }))
    entry.files[lang] = file
    all.push(file)
  }
  // 清理已删除文件残留的缓存，避免长期占用内存
  if (parseCache.size) {
    const alive = new Set(all)
    for (const key of parseCache.keys()) if (!alive.has(key)) parseCache.delete(key)
  }
  return { byPath, all }
}

// 由 frontmatter 生成列表项
function toSummary(path, data) {
  const d = data || {}
  return {
    path,
    title: d.title || '',
    description: d.description || '',
    pubDate: dateStr(d.pubDate),
    draft: d.draft ?? false,
    pinTop: d.pinTop ?? 0,
  }
}

// 扫描所有相册，每个文件夹只读取 zh-cn.md
export async function scanArticles() {
  const { byPath } = await collectArticleFiles()
  const paths = [...byPath.keys()]
  const parsed = await mapLimit(paths, READ_CONCURRENCY, (path) => {
    const { files } = byPath.get(path)
    return loadParsed(files['zh-cn'])
  })
  return paths.map((path, i) => {
    return toSummary(path, parsed[i]?.data)
  })
}

// 读取相册
export async function readArticle(path) {
  const rel = safeRel(path)
  if (!rel) return null
  const dir = blogPath(rel)
  const loaded = await Promise.all(
    LANGS.map(async (lang) => {
      const raw = await readFile(join(dir, `${lang}.md`), 'utf-8').catch(() => null)
      if (raw === null) return null
      const { data, content } = matter(raw)
      return [lang, { content, data: normalizeData(data) }]
    }),
  )
  const files = Object.fromEntries(loaded.filter(Boolean))
  if (Object.keys(files).length === 0) return null
  return { path: rel, files }
}

// 保存文章；文件夹位置以路径为准，slugId 通常只是元数据（如评论 postSlug，形如 momo/xxx）
export async function saveArticle(path, lang, payload) {
  const rel = safeRel(path)
  if (!rel) return { error: '无效路径' }
  if (!LANGS.includes(lang)) return { error: `不支持的语言: ${lang}` }

  const data = normalizeData(payload.data || {})
  const newRel = safeRel(data.slugId || rel)
  if (!newRel) return { error: '无效的 slugId' }
  data.slugId = newRel

  // 读取当前文件已有的 slugId，用于判断是否真的发生了 slugId 修改
  const raw = await readFile(join(blogPath(rel), `${lang}.md`), 'utf-8').catch(() => null)
  const oldSlug = raw ? String(matter(raw).data?.slugId ?? '') : ''

  const writeOne = async (p, l, d, body) => {
    const file = join(blogPath(p), `${l}.md`)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, matter.stringify(body || '', d), 'utf-8')
    forget(file)
  }

  // 仅当 slugId 与当前文件夹路径一致（CMS 创建的文章，slugId == 路径）且确实被修改时，
  // 才整体移动文件夹；否则 slugId 只是元数据，绝不改变文件夹位置
  if (newRel !== rel && oldSlug === rel) {
    // 目标目录已存在且不是当前目录 -> 拒绝，避免覆盖
    const exists = await stat(blogPath(newRel)).then((s) => s.isDirectory()).catch(() => false)
    if (exists) return { error: `目标路径已存在: ${newRel}` }

    // 移动整个文件夹，保留相册里的所有照片。
    const oldDir = blogPath(rel)
    await mkdir(dirname(blogPath(newRel)), { recursive: true })
    await rename(oldDir, blogPath(newRel))
    forgetUnder(oldDir)
    await writeOne(newRel, lang, data, payload.body)
    return { path: newRel, moved: true }
  }

  await writeOne(rel, lang, data, payload.body)
  return { path: rel }
}

// 新建文章（创建文件夹 + 模板文件）
export async function createArticle(path, lang) {
  const rel = safeRel(path)
  if (!rel) return { error: '无效路径' }
  if (!LANGS.includes(lang)) return { error: `不支持的语言: ${lang}` }

  const dir = blogPath(rel)
  const exists = await stat(join(dir, `${lang}.md`)).then(() => true).catch(() => false)
  if (exists) return { error: '文章已存在' }

  const data = normalizeData({
    title: rel.split('/').pop(),
    pubDate: new Date().toISOString().slice(0, 10),
    description: '',
    image: '',
    draft: true,
    slugId: rel,
    pinTop: 0,
  })
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${lang}.md`)
  await writeFile(file, matter.stringify('', data), 'utf-8')
  forget(file)
  return { path: rel }
}

// 删除整篇文章（整个文件夹）
export async function deleteArticle(path) {
  const rel = safeRel(path)
  if (!rel) return { error: '无效路径' }
  const dir = blogPath(rel)
  const st = await stat(dir).then((s) => s).catch(() => null)
  if (!st?.isDirectory()) return { error: '文章不存在' }
  await rm(dir, { recursive: true, force: true })
  forgetUnder(dir)
  return { ok: true }
}

// 概览统计只需文章元数据。
export async function overviewStats() {
  const list = await scanArticles()
  let drafts = 0
  let pinned = 0

  for (const summary of list) {
    if (summary.draft) drafts++
    if (summary.pinTop) pinned++
  }

  const recent = [...list]
    .sort(
      (a, b) =>
        (b.pinTop - a.pinTop) ||
        (b.pubDate || '').localeCompare(a.pubDate || ''),
    )
    .slice(0, 8)

  return {
    total: list.length,
    published: list.length - drafts,
    drafts,
    pinned,
    recent,
  }
}
