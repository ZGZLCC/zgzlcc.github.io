// 与博客 src/content.config.ts 的 schema 对应
export interface FrontmatterData {
  title: string
  pubDate: string
  description: string
  image: string
  draft: boolean
  slugId: string
  pinTop: number
  [key: string]: unknown
}

export interface ArticleSummary {
  path: string
  title: string
  description: string
  pubDate: string
  draft: boolean
  pinTop: number
}

export interface ArticleDetail {
  path: string
  files: Record<string, { content: string; data: FrontmatterData }>
}

export interface Stats {
  total: number
  published: number
  drafts: number
  pinned: number
  recent: ArticleSummary[]
}

// ---- 站点配置（src/config.ts）----
// 配置是深层嵌套的自由结构，前端按路径读写，因此这里用宽松的索引类型
export type ConfigValues = Record<string, any>

export interface ConfigDoc {
  path: string
  source: string
  values: ConfigValues
  changed?: boolean
}

export interface FriendLinkItem {
  name: string
  avatar: string
  url: string
  description: string
}
