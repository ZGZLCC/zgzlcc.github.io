import type { SaveEntryInput, TimeEntry } from "../core/entries";

/**
 * 浏览器本地仓储。所有写操作在返回前完成持久化，
 * 与桌面版一致：只有写入成功才更新界面。
 */
export interface TimeRepository {
  /** 按开始时间倒序返回全部记录（含删除墓碑），供界面筛选、周视图与统计共用。 */
  listEntries(): Promise<TimeEntry[]>;
  /** 新建或更新一条记录；已完成记录会先做重叠校验。 */
  saveEntry(input: SaveEntryInput): Promise<TimeEntry>;
  /** 删除记录：保留删除墓碑，让其他设备也能同步到这次删除。 */
  deleteEntry(id: string): Promise<void>;
  /** 快速打卡：新增一条只含开始时间的待补全记录。 */
  startPunch(): Promise<TimeEntry>;
  /** 首次创建本地存储的时间戳；用于设置页展示。 */
  createdAt(): Promise<number | null>;
  /** 用备份内容整体替换本地数据。 */
  replaceAll(entries: TimeEntry[]): Promise<void>;
  /** 写入同步结果：仅新增或替换给定记录，不动其他内容。 */
  applyRemote(entries: TimeEntry[]): Promise<void>;
  /**
   * 真正删除超过保留期的删除墓碑（不只是过滤返回值）。
   *
   * 墓碑的用处是让离线很久的设备同步到"这条被删了"，所以不能立刻删；
   * 但也不能永久留着——以前这里只过滤不过滤存储，墓碑会无限累积。
   * 保留期由 core/sync 的 TOMBSTONE_TTL_MS 决定，两端保持一致。
   */
  purgeTombstones(now: number): Promise<number>;
  /** 清空全部记录并保留存储本身。 */
  wipe(): Promise<void>;
}
