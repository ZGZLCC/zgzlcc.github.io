import assert from 'node:assert/strict'
import { insertPhotosAtLine } from './src/insert-photos.ts'

const photos = ['![2](./2.webp)', '![10](./10.webp)']
assert.equal(
  insertPhotosAtLine('第一行\n第二行\n第三行', 5, photos).body,
  '第一行\n\n![2](./2.webp)\n\n![10](./10.webp)\n\n第二行\n第三行',
)
assert.equal(insertPhotosAtLine('', 0, photos).body, photos.join('\n\n') + '\n')
assert.equal(insertPhotosAtLine('第一行\n', 4, photos).body, '第一行\n\n' + photos.join('\n\n') + '\n')
assert.equal(insertPhotosAtLine('第一行\n\n第二行', 4, photos).body, '第一行\n\n' + photos.join('\n\n') + '\n\n第二行')
console.log('PASS: photos insert at the selected line without replacing existing text')
