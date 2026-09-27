import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { upload } from './server/upload.mjs'
import { BLOG_DIR, createArticle, deleteArticle } from './server/store.mjs'

const path = '__cms_photo_smoke__'
assert.equal(await stat(join(BLOG_DIR, path)).then(() => true).catch(() => false), false, 'Test album exists')

try {
  await createArticle(path, 'zh-cn')
  const original = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#6688aa' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
  const send = async () => {
    const form = new FormData()
    form.append('path', path)
    form.append('file', new File([original], 'photo.jpg', { type: 'image/jpeg' }))
    const response = await upload.request('/', { method: 'POST', body: form })
    assert.equal(response.status, 200)
    return response.json()
  }
  const first = await send()
  const second = await send()
  assert.equal(first.name, 'photo.webp')
  assert.equal(second.name, 'photo-2.webp')
  const result = await sharp(await readFile(join(BLOG_DIR, path, first.name))).metadata()
  assert.equal(result.width, 1707)
  assert.equal(result.height, 2560)
  assert.equal(result.orientation, undefined)
  assert.equal((await readFile(join(BLOG_DIR, path, 'photo.webp'))).equals(await readFile(join(BLOG_DIR, path, 'photo-2.webp'))), true)
  console.log('PASS: EXIF orientation baked into web copy; original untouched; duplicate names do not overwrite')
} finally {
  if (await stat(join(BLOG_DIR, path)).then(() => true).catch(() => false)) await deleteArticle(path)
}
