-- Time 云端同步表结构。
-- 每条记录一行；删除以 deleted_at 墓碑保留，让多设备之间的删除也能同步。
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  start_ms INTEGER,
  end_ms INTEGER,
  start_date TEXT,
  end_date TEXT,
  content TEXT NOT NULL DEFAULT '',
  tag TEXT,
  state TEXT NOT NULL DEFAULT 'draft',
  updated_at INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_entries_updated_at ON entries (updated_at);

-- 单行元数据：记录最近一次写入的修订号（毫秒时间戳），供客户端判断是否需要传输。
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
