import assert from 'node:assert/strict'
import { readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import sharp from 'sharp'
import { upload } from './server/upload.mjs'
import { applyOps, parseConfig, readConfig } from './server/config-file.mjs'

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
  const previewOutput = await readFile(join(homeDir, 'preview', names[0]))
  const info = await sharp(output).metadata()
  assert.deepEqual([info.width, info.height, info.orientation], [1707, 2560, undefined])
  const previewInfo = await sharp(previewOutput).metadata()
  assert.equal(previewInfo.format, 'webp')
  assert.ok(Math.max(previewInfo.width, previewInfo.height) <= 64)
  assert.ok(previewOutput.length < output.length)
  const preview = await upload.request(`/home/${names[0]}`)
  assert.equal(preview.status, 200)
  assert.equal(Buffer.from(await preview.arrayBuffer()).equals(output), true)
  const mobileOutput = await readFile(join(mobileDir, names[0]))
  assert.ok((await readFile(join(mobileDir, 'preview', names[0]))).length < mobileOutput.length)
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
  const cover = await readFile(new URL('../src/components/HomeCover.astro', import.meta.url), 'utf8')
  const earlyScript = /<script is:inline data-astro-rerun>([\s\S]*?)<\/script>/.exec(cover)?.[1]
  assert.ok(earlyScript)
  for (const [isMobile, expected] of [[true, '/home-mobile/b.webp'], [false, '/home/a.webp']]) {
    const main = { src: '' }
    const blur = { src: '', addEventListener() {} }
    const hero = {
      id: 'home-cover',
      dataset: { photos: '["/home/a.webp","/home/b.webp"]', mobilePhotos: '["/home-mobile/a.webp","/home-mobile/b.webp"]' },
      querySelector: (selector) => selector === '.home-photo' ? main : blur,
    }
    const storage = { value: isMobile ? '/home-mobile/a.webp' : '/home/b.webp' }
    runInNewContext(earlyScript, {
      document: { currentScript: { parentElement: hero } },
      matchMedia: () => ({ matches: isMobile }),
      localStorage: { getItem: () => storage.value, setItem: (_, value) => { storage.value = value } },
    })
    assert.equal(main.src, expected)
    assert.equal(blur.src, expected.replace(/\/([^/]+)$/, '/preview/$1'))
    assert.equal(hero.dataset.photo, expected)
    assert.equal(storage.value, expected)
  }
  console.log('PASS: homepage photos preserve proportions, create tiny previews, and start the next photo early')
} finally {
  for (const name of names) {
    await rm(join(homeDir, name), { force: true })
    await rm(join(homeDir, 'preview', name), { force: true })
  }
  await rm(join(mobileDir, names[0]), { force: true })
  await rm(join(mobileDir, 'preview', names[0]), { force: true })
}
