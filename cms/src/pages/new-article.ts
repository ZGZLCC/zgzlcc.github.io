import { api } from '../api'
import { navigate } from '../router'
import { el, encodePath } from '../dom'
import { toast } from '../ui'

// 新建文章弹窗（列表页 / 概览页共用）
export function openNewModal(root: HTMLElement) {
  const pathInput = el('input', {
    class: 'input',
    placeholder: '如 summer-trip',
  })
  const generatedHint = el('small', { class: 'modal-hint' }, [
    '路径也是网址的一部分，如 summer-trip 对应 /blog/summer-trip/；留空将按日期生成，如 ',
    el('code', {}, [autoPath()]),
  ])

  const overlay = el('div', { class: 'modal-overlay' }, [
    el('div', { class: 'modal' }, [
      el('h2', { class: 'modal-title' }, ['新建相册']),
      el('label', { class: 'modal-field' }, ['相册路径（可留空）', pathInput, generatedHint]),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn', onclick: () => overlay.remove() }, ['取消']),
        el('button', { class: 'btn btn-primary', id: 'modal-submit', onclick: submit }, ['创建']),
      ]),
    ]),
  ])
  root.append(overlay)
  pathInput.focus()

  async function submit() {
    // 路径留空时自动生成 yyyy/yyyy-mm-dd（按年份分目录，日期为文件名）
    let path = pathInput.value.trim()
    if (!path) path = autoPath()
    try {
      const res = await api.create({ path })
      toast(`已创建 ${res.path}`)
      overlay.remove()
      navigate(`#/edit/${encodePath(res.path)}`)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }
}

// 生成 yyyy/yyyy-mm-dd 路径
export function autoPath(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}/${y}-${m}-${d}`
}
