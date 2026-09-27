// 返回相册文件夹路径，供编辑器弹窗复制。
import { Hono } from 'hono'
import { stat } from 'node:fs/promises'
import { safeRel, blogPath } from './store.mjs'

const reveal = new Hono()

reveal.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const rel = safeRel(body?.path)
  if (!rel) return c.json({ error: '无效路径' }, 400)

  const dir = blogPath(rel)
  const st = await stat(dir).catch(() => null)
  if (!st?.isDirectory()) return c.json({ error: '相册文件夹不存在' }, 404)
  return c.json({ dir })
})

export { reveal }
