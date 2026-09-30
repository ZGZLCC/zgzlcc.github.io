import { api } from '../api'
import type { ArticleDetail, FrontmatterData } from '../types'
import { navigate } from '../router'
import { el, encodePath, escapeHtml } from '../dom'
import { toast } from '../ui'
import { insertPhotosAtLine } from '../insert-photos'

interface EditorState {
  path: string
  lang: string
  detail: ArticleDetail
  data: FrontmatterData
  body: string
  snapshot: string
  dirty: boolean
  saving: boolean
  previewTimer: number
  previewSeq: number
}

interface AppRoot extends HTMLElement {
  __cleanup?: () => void
}

export async function renderEditor(root: HTMLElement, path: string) {
  let detail: ArticleDetail
  try {
    detail = await api.get(path)
  } catch (e) {
    root.append(el('div', { class: 'cms-error' }, [escapeHtml((e as Error).message)]))
    return
  }

  const initialLang = 'zh-cn'
  const file = detail.files[initialLang] || { content: '', data: emptyData(detail.path) }

  const state: EditorState = {
    path: detail.path,
    lang: initialLang,
    detail,
    data: { ...file.data },
    body: file.content,
    snapshot: '',
    dirty: false,
    saving: false,
    previewTimer: 0,
    previewSeq: 0,
  }
  state.snapshot = makeSnapshot(state)

  buildShell(root, state)
  syncForm(state)
  schedulePreview(state, true)
}

function emptyData(path: string): FrontmatterData {
  const today = new Date().toISOString().slice(0, 10)
  return {
    title: path.split('/').pop() || '未命名',
    pubDate: today,
    description: '',
    image: '',
    draft: true,
    slugId: path,
    pinTop: 0,
  }
}

function makeSnapshot(state: EditorState) {
  return JSON.stringify({ data: state.data, body: state.body })
}

// ---------------- 快速插入工具栏 ----------------

interface InsertTool {
  label: string
  title: string
  // 包裹选中文本：[前缀, 后缀]；无选中时光标落在中间
  wrap?: [string, string]
  // 插入模板：{sel} 替换为选中文本，{cur} 为无选中时的光标落点
  template?: string
}

function buildToolbar(getMd: () => HTMLTextAreaElement | null): HTMLElement {
  const headingSelect = el('select', { class: 'input tool-select', title: '标题级别', 'aria-label': '标题级别' },
    Array.from({ length: 6 }, (_, i) => el('option', { value: String(i + 1) }, [`H${i + 1}`])))
  headingSelect.value = '2'
  const noteSelect = el('select', { class: 'input tool-select', title: '提示块类型', 'aria-label': '提示块类型' }, [
    el('option', { value: 'note' }, ['note']),
    el('option', { value: 'tip' }, ['tip']),
    el('option', { value: 'important' }, ['important']),
    el('option', { value: 'caution' }, ['caution']),
    el('option', { value: 'warning' }, ['warning']),
  ])
  const collageSelect = el('select', { class: 'input tool-select', title: '手动拼图每行张数', 'aria-label': '手动拼图每行张数' }, [
    el('option', { value: '2' }, ['2 张/行']),
    el('option', { value: '3' }, ['3 张/行']),
    el('option', { value: '4' }, ['4 张/行']),
  ])
  const btn = (t: InsertTool) =>
    el('button', { class: 'tool-btn', title: t.title, onclick: () => applyTool(getMd(), t) }, [t.label])
  const sep = () => el('span', { class: 'tool-sep' })

  return el('div', { class: 'editor-toolbar' }, [
    headingSelect,
    el('button', { class: 'tool-btn', title: '插入 H1–H6 标题', onclick: () =>
      applyTool(getMd(), { template: `\n\n${'#'.repeat(Number(headingSelect.value))} {sel}{cur}{ph:标题}\n\n` }),
    }, ['标题']),
    btn({ label: '加粗', title: '加粗 **文字**', wrap: ['**', '**'] }),
    btn({ label: '斜体', title: '斜体 *文字*', wrap: ['*', '*'] }),
    btn({ label: '粗斜', title: '粗斜体 ***文字***', wrap: ['***', '***'] }),
    btn({ label: '删除线', title: '删除线 ~~文字~~', wrap: ['~~', '~~'] }),
    btn({ label: '代码', title: '行内代码 `code`', wrap: ['`', '`'] }),
    btn({ label: '链接', title: '链接 [文字](https://…)', template: '[{sel}]({cur}https://)' }),
    btn({ label: '链接标题', title: '带悬停提示的链接 [文字](https://… "标题")', template: '[{sel}]({cur}https:// "标题")' }),
    btn({ label: '新窗口链接', title: '新标签页打开 [文字](https://…){target="_blank"}', template: '[{sel}]({cur}https://){target="_blank"}' }),
    btn({ label: '图片', title: '图片 ![描述](./图片.png)', template: '![{sel}]({cur}./图片.png)' }),
    btn({ label: '图注图片', title: '带图注的图片 ![描述](./图片.png "图注")', template: '![{sel}]({cur}./图片.png "图注")' }),
    btn({ label: '块引用', title: 'Markdown 块引用 > 内容', template: '\n\n> {sel}{cur}{ph:内容}\n\n' }),
    btn({ label: '嵌套引用', title: 'Markdown 嵌套块引用 > > 内容', template: '\n\n> > {sel}{cur}{ph:内容}\n\n' }),
    btn({ label: '居中引用', title: '居中引用 ::quote[内容]', wrap: ['::quote[', ']'] }),
    sep(),
    btn({ label: '无序列表', title: 'Markdown 无序列表', template: '\n\n- {sel}{cur}{ph:项目}\n\n' }),
    btn({ label: '有序列表', title: 'Markdown 有序列表', template: '\n\n1. {sel}{cur}{ph:项目}\n\n' }),
    btn({ label: '任务清单', title: 'Markdown 任务清单', template: '\n\n- [ ] {sel}{cur}{ph:任务}\n\n' }),
    btn({ label: '表格', title: 'Markdown 表格；对齐行分别示例左、中、右对齐，竖线可写 &#124;', template: '\n\n| {sel}{cur}{ph:列 1} | 列 2 | 列 3 |\n| :--- | :---: | ---: |\n| 内容 | 内容 | 内容 |\n\n' }),
    btn({ label: '换行', title: 'Markdown 换行：行尾两个空格', template: '{sel}  \n{cur}' }),
    btn({ label: '分隔线', title: 'Markdown 水平线 ---', template: '{sel}\n\n---\n\n{cur}' }),
    sep(),
    btn({ label: '代码块', title: '代码块 ```lang', wrap: ['```\n', '\n```'] }),
    btn({ label: '增强代码', title: 'Expressive Code：标题、行号等参数可在首行修改', template: '\n\n```js title="文件.js" showLineNumbers\n{sel}{cur}{ph:代码}\n```\n\n' }),
    btn({ label: 'Typst', title: 'Typst 代码块 ```typst', wrap: ['```typst\n', '\n```'] }),
    sep(),
    btn({ label: '公式', title: '行内公式 $…$', wrap: ['$', '$'] }),
    btn({ label: '块公式', title: '块公式 $$…$$', wrap: ['$$\n', '\n$$'] }),
    sep(),
    noteSelect,
    el('button', {
      class: 'tool-btn',
      title: '提示块 :::note{name="提示"} 内容 :::（上方下拉选择类型）',
      onclick: () => applyTool(getMd(), { template: `:::${noteSelect.value}{name="提示"}\n{sel}{cur}{ph:内容}\n:::` }),
    }, ['提示块']),
    btn({ label: 'GitHub', title: 'GitHub 仓库卡片 ::github{repo="owner/repo"}', template: '::github{repo="{cur}owner/repo"}' }),
    btn({ label: '音乐', title: '网易云音乐卡片 ::music{id="歌曲ID"}', template: '::music{id="{cur}歌曲ID"}' }),
    sep(),
    collageSelect,
    el('button', { class: 'tool-btn', title: '将选中的图片排成每行 2–4 张；未选中时插入图片模板', onclick: () => {
      const md = getMd()
      if (!md) return
      const count = Number(collageSelect.value)
      const selected = md.selectionStart !== md.selectionEnd
      const photos = Array.from({ length: count }, (_, i) =>
        `![照片 ${i + 1}](${i === 0 ? '{cur}' : ''}./照片${i + 1}.jpg)`).join('\n\n')
      applyTool(md, { template: `\n\n:::collage{columns=${count}}\n${selected ? '{sel}' : photos}\n:::\n\n` })
    } }, ['手动拼图']),
    sep(),
    btn({ label: '注音', title: '注音 {中文}(pinyin)', template: '{{sel}中文}({cur}pinyin)' }),
    btn({ label: '模糊', title: '模糊内容（hover 显示）!!文字!!', wrap: ['!!', '!!'] }),
    btn({ label: '彩虹', title: '彩虹文字 ==文字==', wrap: ['==', '=='] }),
    btn({ label: '下划线', title: '下划线 ++文字++', wrap: ['++', '++'] }),
  ])
}

// 在光标处插入 / 包裹选中文本，随后触发 input 事件更新状态与预览
function applyTool(md: HTMLTextAreaElement | null, tool: { wrap?: [string, string]; template?: string }) {
  if (!md) return
  if (!tool.wrap && !tool.template) return
  const start = md.selectionStart
  const end = md.selectionEnd
  const sel = md.value.slice(start, end)

  let text: string
  let caret: number // 插入后光标相对插入文本的偏移
  if (tool.wrap) {
    const [before, after] = tool.wrap
    text = before + sel + after
    caret = sel.length ? text.length : before.length
  } else {
    const t = tool.template as string
    const hasSel = sel.length > 0
    const useSel = t.includes('{sel}')
    // {ph:占位词} 仅在无选中时保留，避免与选中内容叠加；{cur} 用哨兵标记后定位光标
    const sentinel = '\u0000'
    const withCur = t.replace('{sel}', hasSel ? sel : '').replace('{cur}', sentinel)
    const resolved = withCur.replace(/\{ph:([^}]*)\}/g, hasSel ? '' : '$1')
    const curIdx = resolved.indexOf(sentinel)
    text = resolved.replace(sentinel, '')
    caret = hasSel && useSel ? text.length : Math.max(0, curIdx)
  }

  md.setRangeText(text, start, end, 'end')
  md.setSelectionRange(start + caret, start + caret)
  md.focus()
  md.dispatchEvent(new Event('input', { bubbles: true }))
}

// ---------------- 界面骨架 ----------------

function buildShell(root: HTMLElement, state: EditorState) {
  const shell: HTMLDivElement = el('div', { class: 'editor-shell' }, [
    el('header', { class: 'cms-header' }, [
      el('div', { class: 'cms-header-inner editor-header' }, [
        el('button', { class: 'btn', onclick: () => navigate('#/list') }, ['← 相册列表']),
        el('div', { class: 'editor-actions' }, [
          el('span', { class: 'dirty-badge', id: 'dirty-badge', hidden: true }, ['● 未保存']),
          el('button', { class: 'btn', id: 'btn-open-blog', title: '在博客中打开当前文章（新标签页）', onclick: () => openInBlog(state) }, ['打开博客']),
          el('button', { class: 'btn', id: 'btn-open-folder', title: '查看并复制当前相册的文件夹路径', onclick: () => openFolder(state) }, ['文件夹路径']),
          el('button', { class: 'btn', id: 'btn-import-photos', title: '选择多张原图，等比例缩小后导入相册', onclick: () => pickPhotos(state) }, ['导入照片']),
          el('button', { class: 'btn', onclick: () => togglePreview() }, ['预览开/关']),
          el('button', { class: 'btn btn-danger', onclick: () => doDelete(state) }, ['删除']),
          el('button', { class: 'btn btn-primary', id: 'btn-save', onclick: () => doSave(state) }, [
            '保存 (Ctrl+S)',
          ]),
        ]),
      ]),
    ]),
    el('main', { class: 'editor-main', id: 'editor-main' }, [
      el('section', { class: 'editor-left' }, [
        el('div', { class: 'form-panel collapsed', id: 'form-panel' }, [
          el('button', {
            class: 'form-toggle',
            id: 'form-toggle',
            title: '展开/收起相册配置',
            onclick: toggleFormPanel,
          }, [
            el('span', { class: 'form-toggle-icon' }, ['⚙']),
            el('span', { class: 'form-toggle-text' }, ['相册配置']),
            el('span', { class: 'form-toggle-arrow' }, ['▾']),
          ]),
          el('div', { class: 'form-grid' }, [
          el('label', { class: 'form-field wide' }, [
            '标题',
            el('input', { class: 'input', id: 'f-title' }),
          ]),
          el('label', { class: 'form-field' }, [
            '日期',
            el('input', { class: 'input', id: 'f-pubdate', type: 'date' }),
          ]),
          el('label', { class: 'form-field' }, [
            'slugId',
            el('input', { class: 'input mono', id: 'f-slugid', placeholder: '文章标识，如 momo/xxx（不影响文件夹位置）' }),
          ]),
          el('label', { class: 'form-field wide' }, [
            '封面图（推荐横屏 3:2，其他比例也会完整显示）',
            el('div', { class: 'form-inline' }, [
              el('input', { class: 'input', id: 'f-image', placeholder: './cover.jpg' }),
              el('button', { class: 'btn btn-sm', id: 'btn-upload', onclick: () => pickFile(state) }, [
                '选择并处理',
              ]),
            ]),
          ]),
          el('label', { class: 'form-field wide' }, [
            '描述',
            el('input', { class: 'input', id: 'f-description' }),
          ]),
          el('label', { class: 'form-check' }, [
            el('input', { type: 'checkbox', id: 'f-draft' }),
            ' 草稿',
          ]),
          el('label', { class: 'form-check' }, [
            el('input', { type: 'checkbox', id: 'f-pintop' }),
            ' 置顶',
          ]),
          ]),
        ]),
        el('div', { class: 'import-results', id: 'import-results', hidden: true }),
        buildToolbar(() => shell.querySelector('#md-editor') as HTMLTextAreaElement | null),
        el('textarea', {
          class: 'md-editor',
          id: 'md-editor',
          spellcheck: false,
          placeholder: '在这里编写 Markdown 正文…\n\n支持博客自定义语法：:::collage{columns=2} 手动拼图、:::note{...}、$公式$、```typst、::github{}、{注音}(かたかな)、!!折叠!!、==彩虹==、++下划线++',
        }),
      ]),
      el('section', { class: 'editor-right', id: 'editor-right' }, [
        el('div', { class: 'preview-bar' }, [
          el('span', { class: 'preview-title' }, ['实时预览']),
          el('span', { class: 'preview-status', id: 'preview-status' }),
        ]),
        el('iframe', {
          class: 'preview-frame',
          id: 'preview-frame',
          sandbox: 'allow-scripts',
          title: '相册预览',
        }),
      ]),
    ]),
  ])
  root.append(shell)

  // 表单 / 编辑器绑定
  bindForm(shell, state)

  // 编辑区与预览区同步滚动
  const offScrollSync = setupScrollSync()

  // Ctrl+S 保存
  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      doSave(state)
    }
  }
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (state.dirty) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  document.addEventListener('keydown', onKey)
  window.addEventListener('beforeunload', onBeforeUnload)

  ;(root as AppRoot).__cleanup = () => {
    document.removeEventListener('keydown', onKey)
    window.removeEventListener('beforeunload', onBeforeUnload)
    offScrollSync()
  }
}

// 折叠 / 展开文章配置表单
function toggleFormPanel() {
  const panel = document.querySelector('#form-panel')
  const arrow = document.querySelector('#form-toggle-arrow')
  if (!panel) return
  panel.classList.toggle('collapsed')
  if (arrow) arrow.textContent = panel.classList.contains('collapsed') ? '▾' : '▴'
}

// 编辑区（textarea）与预览（iframe）按滚动比例双向同步
// 跨源 iframe 只能通过 postMessage 通信：iframe 内部脚本见 preview.mjs
function setupScrollSync(): () => void {
  const textarea = document.querySelector('#md-editor') as HTMLTextAreaElement | null
  const frame = document.querySelector('#preview-frame') as HTMLIFrameElement | null
  if (!textarea || !frame) return () => {}

  const textareaMax = () => textarea.scrollHeight - textarea.clientHeight
  let suppress = false

  const onTextareaScroll = () => {
    if (suppress) return
    const max = textareaMax()
    if (max <= 0) return
    frame.contentWindow?.postMessage(
      { type: 'cms-scroll-to', ratio: textarea.scrollTop / max },
      '*',
    )
  }

  const onMessage = (e: MessageEvent) => {
    const d = e.data
    if (!d || d.type !== 'cms-preview-scroll' || typeof d.ratio !== 'number') return
    const max = textareaMax()
    if (max <= 0) return
    suppress = true
    textarea.scrollTop = Math.round(d.ratio * max)
    // 短暂抑制回环：比例一致后 scroll 事件自然停止
    setTimeout(() => {
      suppress = false
    }, 80)
  }

  textarea.addEventListener('scroll', onTextareaScroll, { passive: true })
  window.addEventListener('message', onMessage)

  return () => {
    textarea.removeEventListener('scroll', onTextareaScroll)
    window.removeEventListener('message', onMessage)
  }
}

// ---------------- 事件绑定 ----------------

function bindForm(shell: HTMLElement, state: EditorState) {
  const on = (id: string, evt: string, fn: (e: Event) => void) => {
    shell.querySelector(`#${id}`)?.addEventListener(evt, fn)
  }
  const textInputs: [string, (v: string) => void][] = [
    ['f-title', (v) => { state.data.title = v; markDirty(state) }],
    ['f-pubdate', (v) => { state.data.pubDate = v; markDirty(state) }],
    ['f-slugid', (v) => { state.data.slugId = v; markDirty(state) }],
    ['f-image', (v) => { state.data.image = v; markDirty(state) }],
    ['f-description', (v) => { state.data.description = v; markDirty(state) }],
  ]
  for (const [id, fn] of textInputs) {
    on(id, 'input', (e) => fn((e.target as HTMLInputElement).value))
  }
  on('f-draft', 'change', (e) => {
    state.data.draft = (e.target as HTMLInputElement).checked
    markDirty(state)
  })
  on('f-pintop', 'change', (e) => {
    state.data.pinTop = (e.target as HTMLInputElement).checked ? 1 : 0
    markDirty(state)
  })
  const md = shell.querySelector('#md-editor') as HTMLTextAreaElement
  md.addEventListener('input', () => {
    state.body = md.value
    markDirty(state)
  })
}

function syncForm(state: EditorState) {
  const set = (id: string, v: string | number | boolean) => {
    const node = document.querySelector(`#${id}`) as HTMLInputElement | null
    if (!node) return
    if (node.type === 'checkbox') node.checked = !!v
    else node.value = String(v ?? '')
  }
  set('f-title', state.data.title)
  set('f-pubdate', state.data.pubDate)
  set('f-slugid', state.data.slugId)
  set('f-image', state.data.image)
  set('f-description', state.data.description)
  set('f-draft', state.data.draft)
  set('f-pintop', !!state.data.pinTop)
  const md = document.querySelector('#md-editor') as HTMLTextAreaElement | null
  if (md) md.value = state.body
}

// ---------------- 实时预览 ----------------

function markDirty(state: EditorState) {
  state.dirty = makeSnapshot(state) !== state.snapshot
  const badge = document.querySelector('#dirty-badge') as HTMLElement | null
  if (badge) badge.hidden = !state.dirty
  schedulePreview(state)
}

function schedulePreview(state: EditorState, immediate = false) {
  clearTimeout(state.previewTimer)
  state.previewTimer = window.setTimeout(() => renderPreview(state), immediate ? 0 : 500)
}

async function renderPreview(state: EditorState) {
  const frame = document.querySelector('#preview-frame') as HTMLIFrameElement | null
  const status = document.querySelector('#preview-status') as HTMLElement | null
  if (!frame) return
  const seq = ++state.previewSeq
  if (status) status.textContent = '渲染中…'
  try {
    const doc = await api.preview({ data: state.data, body: state.body, base: state.path, lang: state.lang })
    if (seq !== state.previewSeq) return
    frame.srcdoc = doc
    if (status) status.textContent = '✓ 已更新'
  } catch (e) {
    if (seq !== state.previewSeq) return
    if (status) status.textContent = '✗ 渲染失败'
    frame.srcdoc =
      `<html><body style="font-family:system-ui;padding:24px;color:#dc2626">` +
      escapeHtml((e as Error).message) +
      '</body></html>'
  }
}

function togglePreview() {
  const main = document.querySelector('#editor-main')
  main?.classList.toggle('no-preview')
}

// ---------------- 保存 / 删除 / 上传 ----------------

async function doSave(state: EditorState) {
  if (state.saving) return
  state.saving = true
  const btn = document.querySelector('#btn-save') as HTMLButtonElement | null
  if (btn) btn.disabled = true
  try {
    const res = await api.save(state.path, state.lang, { data: state.data, body: state.body })
    state.path = res.path
    state.snapshot = makeSnapshot(state)
    state.dirty = false
    const badge = document.querySelector('#dirty-badge') as HTMLElement | null
    if (badge) badge.hidden = true
    toast('已保存')
    const current = decodeURIComponent(location.hash.replace(/^#\/edit\//, ''))
    if (res.path !== current) {
      navigate(`#/edit/${encodePath(res.path)}`)
    }
  } catch (e) {
    toast((e as Error).message, 'error')
  } finally {
    state.saving = false
    if (btn) btn.disabled = false
  }
}

async function doDelete(state: EditorState) {
  if (!window.confirm(`确定删除相册「${state.data.title || state.path}」？\n将删除整个相册文件夹及照片，不可恢复。`)) {
    return
  }
  try {
    await api.remove(state.path)
    toast('已删除')
    navigate('#/list')
  } catch (e) {
    toast((e as Error).message, 'error')
  }
}

// 打开博客中当前文章（新标签页）；博客地址默认 http://localhost:4321，
// 可用 localStorage 键 cms-blog-base 覆盖（例如博客端口不同时）
function blogOrigin(): string {
  try {
    return localStorage.getItem('cms-blog-base') || 'http://localhost:4321'
  } catch {
    return 'http://localhost:4321'
  }
}

function openInBlog(state: EditorState) {
  const url = `${blogOrigin()}/blog/${encodePath(state.path)}`
  window.open(url, '_blank', 'noopener')
}

// 显示当前相册的绝对路径，由用户复制到文件管理器地址栏。
async function openFolder(state: EditorState) {
  try {
    const { dir } = await api.reveal(state.path)
    document.querySelector('#folder-path-modal')?.remove()
    const pathInput = el('input', { class: 'input', value: dir, readOnly: true })
    const overlay = el('div', { class: 'modal-overlay', id: 'folder-path-modal' }, [
      el('div', { class: 'modal folder-path-modal' }, [
        el('h2', { class: 'modal-title' }, ['相册文件夹路径']),
        el('label', { class: 'modal-field' }, ['复制后粘贴到文件管理器地址栏', pathInput]),
        el('div', { class: 'modal-actions' }, [
          el('button', { class: 'btn', onclick: () => overlay.remove() }, ['关闭']),
          el('button', { class: 'btn btn-primary', onclick: async () => {
            pathInput.select()
            try {
              await navigator.clipboard.writeText(dir)
              toast('路径已复制')
              overlay.remove()
            } catch {
              toast('路径已选中，请按 Ctrl+C 复制')
            }
          } }, ['复制路径']),
        ]),
      ]),
    ])
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.remove()
    })
    document.body.append(overlay)
    pathInput.focus()
    pathInput.select()
  } catch (e) {
    toast((e as Error).message, 'error')
  }
}

function pickFile(state: EditorState) {
  const input = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif' })
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const res = await api.upload(file, state.path)
      state.data.image = res.url
      syncForm(state)
      markDirty(state)
      toast(`已上传 ${res.name}，记得保存`)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  })
  input.click()
}

function pickPhotos(state: EditorState) {
  const editor = document.querySelector('#md-editor') as HTMLTextAreaElement | null
  const insertAt = editor?.selectionStart ?? state.body.length
  const input = el('input', { type: 'file', multiple: true, accept: 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif' })
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []).sort((a, b) =>
      a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }),
    )
    if (!files.length) return
    const button = document.querySelector('#btn-import-photos') as HTMLButtonElement | null
    const results = document.querySelector('#import-results') as HTMLDivElement | null
    const toolbar = document.querySelector('.editor-toolbar') as HTMLElement | null
    const wasReadOnly = editor?.readOnly ?? false
    const wasInert = toolbar?.inert ?? false
    if (button) button.disabled = true
    if (editor) editor.readOnly = true
    if (toolbar) toolbar.inert = true
    if (results) {
      results.hidden = false
      results.replaceChildren()
    }
    const lines: string[] = []
    let failed = 0
    let nextCursor: number | null = null
    try {
      for (const [index, file] of files.entries()) {
        if (button) button.textContent = `处理中 ${index + 1}/${files.length}`
        try {
          const photo = await api.upload(file, state.path)
          lines.push(`![${photo.name.replace(/\.webp$/i, '')}](${photo.url})`)
          results?.append(el('div', { class: 'import-result' }, [
            el('span', {}, [`✓ ${file.name} → ${photo.name}`]),
            el('button', { class: 'btn btn-sm', onclick: () => {
              state.data.image = photo.url
              syncForm(state)
              markDirty(state)
            } }, ['设为封面']),
          ]))
        } catch (error) {
          failed++
          results?.append(el('div', { class: 'import-result import-error' }, [
            `${file.name}：${(error as Error).message}`,
          ]))
        }
      }
      if (lines.length) {
        const inserted = insertPhotosAtLine(state.body, insertAt, lines)
        state.body = inserted.body
        nextCursor = inserted.cursor
        if (editor) editor.value = state.body
        markDirty(state)
      }
      toast(`已导入 ${lines.length} 张${failed ? `，失败 ${failed} 张` : ''}；记得保存`)
    } finally {
      if (editor) {
        editor.readOnly = wasReadOnly
        if (nextCursor !== null) {
          editor.focus()
          editor.setSelectionRange(nextCursor, nextCursor)
        }
      }
      if (toolbar) toolbar.inert = wasInert
      if (button) {
        button.disabled = false
        button.textContent = '导入照片'
      }
    }
  })
  input.click()
}
