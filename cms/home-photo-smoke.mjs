import assert from 'node:assert/strict'
import { readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { upload } from './server/upload.mjs'
import { applyOps, parseConfig, readConfig } from './server/config-file.mjs'

const homeDir = fileURLToPath(new URL('../public/home/', import.meta.url))
const stem = `__cms_home_smoke_${process.pid}__`
const names = [`${stem}.webp`, `${stem}-2.webp`]
for (const name of names) {
  assert.equal(await stat(join(homeDir, name)).then(() => true).catch(() => false), false)
}

try {
  const original = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#6688aa' } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer()
  const send = async () => {
    const form = new FormData()
    form.append('file', new File([original], `${stem}.jpg`, { type: 'image/jpeg' }))
    const response = await upload.request('/home', { method: 'POST', body: form })
    assert.equal(response.status, 200)
    return response.json()
  }
  const first = await send()
  const second = await send()
  assert.equal(first.url, `/home/${names[0]}`)
  assert.equal(second.url, `/home/${names[1]}`)
  const output = await readFile(join(homeDir, names[0]))
  const info = await sharp(output).metadata()
  assert.deepEqual([info.width, info.height, info.orientation], [1707, 2560, undefined])
  const preview = await upload.request(`/home/${names[0]}`)
  assert.equal(preview.status, 200)
  assert.equal(Buffer.from(await preview.arrayBuffer()).equals(output), true)
  assert.equal((await upload.request('/home/../config.ts')).status, 404)

  const config = await readConfig()
  const updated = applyOps(config.source, [{ path: ['siteConfig', 'homePhotos'], append: [first.url, second.url] }])
  assert.deepEqual(parseConfig(updated.source).siteConfig.homePhotos, [first.url, second.url])
  const removed = applyOps(updated.source, [{ path: ['siteConfig', 'homePhotos', 1], remove: true }])
  assert.deepEqual(parseConfig(removed.source).siteConfig.homePhotos, [first.url])
  console.log('PASS: homepage photos keep proportions and EXIF direction, use unique names, and save as config paths')
} finally {
  for (const name of names) await rm(join(homeDir, name), { force: true })
}
