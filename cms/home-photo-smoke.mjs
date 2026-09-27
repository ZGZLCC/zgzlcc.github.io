import assert from 'node:assert/strict'
import { readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { upload } from './server/upload.mjs'
import { applyOps, parseConfig, readConfig } from './server/config-file.mjs'
import { pickHomePhoto } from '../src/utils/homePhoto.ts'

const homeDir = fileURLToPath(new URL('../public/home/', import.meta.url))
const mobileDir = fileURLToPath(new URL('../public/home-mobile/', import.meta.url))
const stem = `__cms_home_smoke_${process.pid}__`
const names = [`${stem}.webp`, `${stem}-2.webp`]
for (const name of names) {
  assert.equal(await stat(join(homeDir, name)).then(() => true).catch(() => false), false)
  assert.equal(await stat(join(mobileDir, name)).then(() => true).catch(() => false), false)
}

try {
  const original = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#6688aa' } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer()
  const send = async (album = 'home') => {
    const form = new FormData()
    form.append('file', new File([original], `${stem}.jpg`, { type: 'image/jpeg' }))
    const response = await upload.request(`/${album}`, { method: 'POST', body: form })
    assert.equal(response.status, 200)
    return response.json()
  }
  const first = await send()
  const second = await send()
  const mobilePhoto = await send('home-mobile')
  assert.equal(first.url, `/home/${names[0]}`)
  assert.equal(second.url, `/home/${names[1]}`)
  assert.equal(mobilePhoto.url, `/home-mobile/${names[0]}`)
  const output = await readFile(join(homeDir, names[0]))
  const info = await sharp(output).metadata()
  assert.deepEqual([info.width, info.height, info.orientation], [1707, 2560, undefined])
  const preview = await upload.request(`/home/${names[0]}`)
  assert.equal(preview.status, 200)
  assert.equal(Buffer.from(await preview.arrayBuffer()).equals(output), true)
  const mobileOutput = await readFile(join(mobileDir, names[0]))
  const mobilePreview = await upload.request(`/home-mobile/${names[0]}`)
  assert.equal(mobilePreview.status, 200)
  assert.equal(Buffer.from(await mobilePreview.arrayBuffer()).equals(mobileOutput), true)
  assert.equal((await upload.request('/home/../config.ts')).status, 404)
  assert.equal((await upload.request('/home-mobile/../config.ts')).status, 404)

  const config = await readConfig()
  const originals = parseConfig(config.source).siteConfig
  const updated = applyOps(config.source, [{ path: ['siteConfig', 'homePhotos'], append: [first.url, second.url] }])
  assert.deepEqual(parseConfig(updated.source).siteConfig.homePhotos, [...originals.homePhotos, first.url, second.url])
  const removed = applyOps(updated.source, [{ path: ['siteConfig', 'homePhotos', originals.homePhotos.length + 1], remove: true }])
  assert.deepEqual(parseConfig(removed.source).siteConfig.homePhotos, [...originals.homePhotos, first.url])
  const mobile = applyOps(config.source, [{ path: ['siteConfig', 'homePhotosMobile'], append: [mobilePhoto.url] }])
  assert.deepEqual(parseConfig(mobile.source).siteConfig.homePhotosMobile, [...originals.homePhotosMobile, mobilePhoto.url])
  assert.equal(pickHomePhoto(['desktop-a', 'desktop-b'], ['mobile-a', 'mobile-b'], true, 'mobile-a'), 'mobile-b')
  assert.equal(pickHomePhoto(['desktop-a', 'desktop-b'], [], false, 'desktop-a'), 'desktop-b')
  assert.equal(pickHomePhoto(['desktop-a'], [], true, ''), 'desktop-a')
  console.log('PASS: homepage photos keep proportions and direction, save both lists, and avoid adjacent repeats')
} finally {
  for (const name of names) await rm(join(homeDir, name), { force: true })
  await rm(join(mobileDir, names[0]), { force: true })
}
