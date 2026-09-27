import assert from 'node:assert/strict'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { BLOG_DIR, createArticle, deleteArticle, readArticle, saveArticle } from './server/store.mjs'

const source = '__cms_store_smoke__'
const target = '__cms_store_smoke_moved__'
for (const name of [source, target]) {
  assert.equal(await stat(join(BLOG_DIR, name)).then(() => true).catch(() => false), false, `Test path exists: ${name}`)
}

try {
  assert.deepEqual(await createArticle(source, 'zh-cn'), { path: source })
  const photo = join(BLOG_DIR, source, 'photo.jpg')
  await writeFile(photo, 'photo bytes')
  const article = await readArticle(source)
  assert.ok(article?.files['zh-cn'])
  const result = await saveArticle(source, 'zh-cn', {
    data: { ...article.files['zh-cn'].data, slugId: target, category: ['obsolete'] },
    body: '![Photo](./photo.jpg)',
  })
  assert.deepEqual(result, { path: target, moved: true })
  assert.equal(await readFile(join(BLOG_DIR, target, 'photo.jpg'), 'utf8'), 'photo bytes')
  const saved = await readFile(join(BLOG_DIR, target, 'zh-cn.md'), 'utf8')
  assert.match(saved, /!\[Photo\]\(\.\/photo\.jpg\)/)
  assert.doesNotMatch(saved, /category:/)
  console.log('PASS: changing an album path preserves photos and removes categories')
} finally {
  for (const name of [source, target]) {
    if (await stat(join(BLOG_DIR, name)).then(() => true).catch(() => false)) await deleteArticle(name)
  }
}
