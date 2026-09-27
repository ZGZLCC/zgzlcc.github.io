import { api } from '../api'
import type { ArticleSummary, Stats } from '../types'
import { el, encodePath, escapeHtml } from '../dom'
import { pageHeader } from './header'
import { openNewModal } from './new-article'

const fmt = new Intl.NumberFormat('zh-CN')

export async function renderOverview(root: HTMLElement) {
  const main = el('main', { class: 'cms-main' }, [
    el('div', { class: 'cms-empty' }, ['加载统计中…']),
  ])
  root.append(
    pageHeader(
      'overview',
      el('button', { class: 'btn btn-primary', id: 'btn-new', onclick: () => openNewModal(root) }, [
        '＋ 新建相册',
      ]),
    ),
    main,
  )

  try {
    const stats = await api.stats()
    main.innerHTML = '' // 移除「加载统计中…」占位符
    renderStats(main, stats)
  } catch (e) {
    main.innerHTML = ''
    main.append(el('div', { class: 'cms-error' }, [escapeHtml((e as Error).message)]))
  }
}

function renderStats(main: HTMLElement, s: Stats) {
  const card = (label: string, value: string, sub = '') =>
    el('div', { class: 'stat-card' }, [
      el('div', { class: 'stat-label' }, [label]),
      el('div', { class: 'stat-value' }, [value]),
      sub ? el('div', { class: 'stat-sub' }, [sub]) : null,
    ])

  const publishPct = s.total ? Math.round((s.published / s.total) * 100) : 0

  main.append(
    el('div', { class: 'stat-grid' }, [
      card('相册总数', fmt.format(s.total)),
      card('已发布', fmt.format(s.published), `占全部 ${publishPct}%`),
      card('草稿', fmt.format(s.drafts)),
      card('置顶', fmt.format(s.pinned)),
    ]),
    recentPanel(s),
  )
}

// ---------------- 最近文章 ----------------

function recentPanel(s: Stats) {
  const list =
    s.recent.length === 0
      ? el('div', { class: 'panel-empty' }, ['暂无相册，点击右上角「新建相册」开始创作'])
      : el('div', { class: 'recent-list' }, s.recent.map((a) => recentItem(a)))
  return el('div', { class: 'panel' }, [
    el('h2', { class: 'panel-title' }, ['最近相册']),
    list,
    s.recent.length > 0 ? el('a', { class: 'recent-more', href: '#/list' }, ['查看全部相册 →']) : null,
  ])
}

function recentItem(a: ArticleSummary) {
  const badges: (HTMLElement | string)[] = []
  if (a.draft) badges.push(el('span', { class: 'badge badge-draft' }, ['草稿']))
  if (a.pinTop) badges.push(el('span', { class: 'badge badge-pin' }, ['置顶']))
  return el('a', { class: 'recent-item', href: `#/edit/${encodePath(a.path)}` }, [
    el('div', { class: 'recent-main' }, [
      el('div', { class: 'recent-title' }, [a.title || a.path]),
      el('div', { class: 'recent-meta' }, [
        el('span', {}, [a.pubDate || '—']),
        el('span', { class: 'recent-path' }, [a.path]),
      ]),
    ]),
    el('div', { class: 'recent-badges' }, badges),
  ])
}
