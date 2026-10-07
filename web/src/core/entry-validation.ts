import { AppError } from "./errors";
import type { EntryTag } from "../tags";
import type { SaveEntryInput, TimeEntry } from "./entries";
import { isEntryTag } from "./entries";
import { parseBeijingDate } from "./date";

export interface ValidatedEntry {
  id?: string;
  startMs: number | null;
  endMs: number | null;
  startDate: string | null;
  endDate: string | null;
  content: string;
  tag: EntryTag | null;
  state: "draft" | "completed";
}

function optionalDate(value: string | null, label: string): string | null {
  if (value === null || value === "") return null;
  try {
    parseBeijingDate(value);
  } catch {
    throw new AppError("validation", `${label}无效`);
  }
  return value;
}

/** 与桌面版 Rust 后端一致：内容去空白、限 500 字，完整则直接存为已完成。 */
export function validateEntry(input: SaveEntryInput): ValidatedEntry {
  if (input.id !== undefined && (typeof input.id !== "string" || input.id.trim() === "")) {
    throw new AppError("validation", "记录编号无效");
  }
  const content = input.content.trim();
  if (Array.from(content).length > 500) {
    throw new AppError("validation", "事情内容不得超过 500 个字符");
  }
  if (input.startMs !== null && input.endMs !== null && input.endMs <= input.startMs) {
    throw new AppError("validation", "结束时间必须晚于开始时间");
  }
  const startDate = optionalDate(input.startDate, "开始日期");
  const endDate = optionalDate(input.endDate, "结束日期");
  if (input.tag !== null && !isEntryTag(input.tag)) {
    throw new AppError("validation", "请选择有效标签");
  }
  const empty =
    input.startMs === null &&
    input.endMs === null &&
    startDate === null &&
    endDate === null &&
    content === "" &&
    input.tag === null;
  if (empty) {
    throw new AppError("validation", "请至少填写一项记录内容");
  }
  // 内容可以是空的：有起止时间和标签就算已是完整记录，
  // 只是「没写做了什么」而已，不该一直挂在待补全里。
  const completed = input.startMs !== null && input.endMs !== null && input.tag !== null;
  return {
    id: input.id,
    startMs: input.startMs,
    endMs: input.endMs,
    startDate,
    endDate,
    content,
    tag: input.tag,
    state: completed ? "completed" : "draft",
  };
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function optionalTime(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AppError("validation", `备份文件中的${field}无效`);
  }
  return value;
}

/**
 * 校验一条来自备份文件或云端的记录。
 * 缺少 `updatedAt` 的记录按 0 处理，同步时会被云端已有版本取代。
 */
export function parseEntry(raw: unknown): TimeEntry {
  if (typeof raw !== "object" || raw === null) {
    throw new AppError("validation", "备份文件中的记录格式无效");
  }
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || value.id.trim() === "") {
    throw new AppError("validation", "备份文件中的记录编号无效");
  }
  if (value.tag !== null && value.tag !== undefined && !isEntryTag(value.tag)) {
    throw new AppError("validation", "备份文件中存在无效标签");
  }
  if (value.state !== "completed" && value.state !== "draft") {
    throw new AppError("validation", "备份文件中存在无效状态");
  }
  const updatedAt = optionalTime(value.updatedAt, "修改时间");
  return {
    id: value.id,
    startMs: optionalTime(value.startMs, "开始时间"),
    endMs: optionalTime(value.endMs, "结束时间"),
    startDate: textOf(value.startDate),
    endDate: textOf(value.endDate),
    content: typeof value.content === "string" ? value.content : "",
    tag: isEntryTag(value.tag) ? value.tag : null,
    state: value.state,
    updatedAt: updatedAt ?? 0,
    deletedAt: optionalTime(value.deletedAt, "删除时间"),
  };
}

/** 云端与备份共用的整体校验：任一条不合法就整份拒绝，不导入半份数据。 */
export function parseEntries(raw: unknown): TimeEntry[] {
  if (!Array.isArray(raw)) {
    throw new AppError("validation", "记录列表格式无效");
  }
  return raw.map(parseEntry);
}
