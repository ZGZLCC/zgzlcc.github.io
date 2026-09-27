export function insertPhotosAtLine(body: string, cursor: number, photos: string[]) {
  const position = Math.max(0, Math.min(cursor, body.length))
  const line = position === 0 ? 0 : body.lastIndexOf('\n', position - 1) + 1
  const before = body.slice(0, line)
  const after = body.slice(line)
  const prefix = before && !before.endsWith('\n\n') ? '\n' : ''
  const suffix = after && !after.startsWith('\n') ? '\n\n' : '\n'
  const inserted = before + prefix + photos.join('\n\n') + suffix
  return { body: inserted + after, cursor: inserted.length }
}
