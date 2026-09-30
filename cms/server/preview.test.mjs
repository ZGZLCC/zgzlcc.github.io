import assert from 'node:assert/strict'
import { test } from 'node:test'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkDirective from 'remark-directive'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { parseDirectiveNode } from '../../src/plugins/remark-directive-rehype.ts'
import { customFigurePlugin } from '../../src/plugins/rehype-figure-plugin.ts'
import { rehypeImageCollage } from '../../src/plugins/rehype-image-collage.ts'
import { preview } from './preview.mjs'

test('CMS preview renders new-tab links', async () => {
  const response = await preview.request('http://localhost/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      data: { title: 'Link check' },
      body: '[Open](https://example.com){target="_blank"}\n\n[Normal](/about/)',
    }),
  })
  const html = await response.text()

  assert.equal(response.status, 200)
  assert.match(html, /target="_blank"/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.equal((html.match(/class="newtab-icon"/g) ?? []).length, 1)
  assert.doesNotMatch(html, /\{target="_blank"\}/)
  assert.match(html, /href="\/about\/"/)
})

test('manual collage works with automatic collage disabled', async () => {
  const render = async (body, enable = false) => String(await unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(parseDirectiveNode)
    .use(remarkRehype)
    .use(customFigurePlugin)
    .use(rehypeImageCollage, { enable, remote: { enable: false } })
    .use(rehypeStringify)
    .process(body))

  for (const columns of [2, 3, 4]) {
    const photos = Array.from({ length: columns }, (_, i) => `![${i}](./${i}.jpg "图注${i}")`).join('\n\n')
    const html = await render(`:::collage{columns=${columns}}\n${photos}\n:::`)
    assert.match(html, new RegExp(`--cols: ${columns}`))
    assert.equal((html.match(/class="collage-item"/g) ?? []).length, columns)
    assert.equal((html.match(/<figcaption/g) ?? []).length, columns)
  }

  assert.doesNotMatch(await render('![1](./1.jpg)\n\n![2](./2.jpg)'), /image-collage/)
  assert.match(await render('![1](./1.jpg)\n\n![2](./2.jpg)', true), /image-collage/)
  assert.match(await render(':::collage{columns=5}\n![1](./1.jpg)\n\n![2](./2.jpg)\n:::'), /<collage/)
})

