// upload.mjs — 相册照片导入 API
import { Hono } from 'hono'
import { open, stat, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { safeRel, blogPath } from './store.mjs'
import sharp from 'sharp'

const upload = new Hono()

const MAX_ORIGINAL_SIZE = 100 * 1024 * 1024
const WEB_EDGE = 2560
const HOME_DIR = fileURLToPath(new URL('../../public/home/', import.meta.url))
const HOME_MOBILE_DIR = fileURLToPath(new URL('../../public/home-mobile/', import.meta.url))
const HOME_DIRS = new Map([['home', HOME_DIR], ['home-mobile', HOME_MOBILE_DIR]])
const INPUT_ERRORS = ['单张原图需小于 100 MB', '仅支持单帧 JPG、PNG、WebP、AVIF 或 HEIC 照片', '照片无法处理或格式不受支持']

function uploadError(c, error) {
  const message = error?.message || '上传失败'
  return c.json({ error: message }, message === '同名照片过多' ? 409 : INPUT_ERRORS.includes(message) ? 400 : 500)
}

async function preparePhoto(file) {
  if (!file.size || file.size > MAX_ORIGINAL_SIZE) {
    throw new Error('单张原图需小于 100 MB')
  }
  try {
    const source = Buffer.from(await file.arrayBuffer())
    const metadata = await sharp(source).metadata()
    if (!['jpeg', 'png', 'webp', 'avif', 'heif'].includes(metadata.format) || !metadata.width || !metadata.height || (metadata.pages || 1) > 1) {
      throw new Error('仅支持单帧 JPG、PNG、WebP、AVIF 或 HEIC 照片')
    }
    return await sharp(source)
      .autoOrient()
      .resize(WEB_EDGE, WEB_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
  } catch (error) {
    throw new Error(error.message.startsWith('仅支持') ? error.message : '照片无法处理或格式不受支持')
  }
}

async function savePhoto(file, output, dir, prefix) {
  const stem = basename(file.name, extname(file.name))
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^\.+/, '') || 'photo'
  for (let n = 1; n < 10000; n++) {
    const name = `${stem}${n === 1 ? '' : `-${n}`}.webp`
    const destination = join(dir, name)
    let handle
    try {
      handle = await open(destination, 'wx')
    } catch (error) {
      if (error.code === 'EEXIST') continue
      throw error
    }
    try {
      await handle.writeFile(output)
      return { name, url: `${prefix}${name}` }
    } catch (error) {
      await handle.close()
      await rm(destination, { force: true })
      throw error
    } finally {
      await handle.close().catch(() => {})
    }
  }
  throw new Error('同名照片过多')
}

// POST /api/upload  (multipart: file + path)
upload.post('/', async (c) => {
  // 前端每次只发送一张，避免同时把多张原图放进内存。
  const form = await c.req.parseBody().catch(() => null)
  const file = form?.file
  const rel = safeRel(String(form?.path || ''))
  if (typeof File === 'undefined' || !(file instanceof File) || !rel) {
    return c.json({ error: '请选择照片和相册' }, 400)
  }
  const dir = blogPath(rel)
  const album = await stat(join(dir, 'zh-cn.md')).catch(() => null)
  if (!album?.isFile()) return c.json({ error: '相册不存在' }, 404)
  try {
    return c.json(await savePhoto(file, await preparePhoto(file), dir, './'))
  } catch (error) {
    return uploadError(c, error)
  }
})

// 首页照片与相册使用同一套等比例缩放和 EXIF 方向处理。
upload.post('/:album', async (c) => {
  const album = c.req.param('album')
  const dir = HOME_DIRS.get(album)
  if (!dir) return c.notFound()
  const form = await c.req.parseBody().catch(() => null)
  const file = form?.file
  if (typeof File === 'undefined' || !(file instanceof File)) {
    return c.json({ error: '请选择首页照片' }, 400)
  }
  try {
    const output = await preparePhoto(file)
    const preview = await sharp(output).resize(64, 64, { fit: 'inside' }).webp({ quality: 45 }).toBuffer()
    await mkdir(dir, { recursive: true })
    const saved = await savePhoto(file, output, dir, `/${album}/`)
    try {
      await mkdir(join(dir, 'preview'), { recursive: true })
      await writeFile(join(dir, 'preview', saved.name), preview)
    } catch (error) {
      await rm(join(dir, 'preview', saved.name), { force: true })
      await rm(join(dir, saved.name), { force: true })
      throw error
    }
    return c.json(saved)
  } catch (error) {
    return uploadError(c, error)
  }
})

// CMS 运行在独立的 Vite 根目录，通过此路由预览博客 public 中的首页照片。
upload.get('/:album/:name', async (c) => {
  const dir = HOME_DIRS.get(c.req.param('album'))
  if (!dir) return c.notFound()
  const name = c.req.param('name')
  if (!/^[\p{L}\p{N}_][\p{L}\p{N}._-]*\.webp$/u.test(name)) return c.notFound()
  const photo = await readFile(join(dir, name)).catch(() => null)
  if (!photo) return c.notFound()
  return c.body(photo, 200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' })
})

export { upload }
