import { AppError } from "./errors";

const DAY_MS = 86_400_000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 校验 `YYYY-MM-DD` 并按北京时间返回该日起点（UTC 毫秒）。 */
export function parseBeijingDate(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new AppError("validation", "日期格式无效，请使用 YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new AppError("validation", "日期无效");
  }
  return Date.UTC(year, month - 1, day) - BEIJING_OFFSET_MS;
}

/** 把北京时间日期字符串转为 UTC 毫秒对应的日期序号，便于做整数天运算。 */
export function dayNumber(value: string): number {
  return Math.floor((parseBeijingDate(value) + BEIJING_OFFSET_MS) / DAY_MS);
}

/** 由日期序号还原北京时间日期字符串 `YYYY-MM-DD`。 */
export function dateFromDayNumber(days: number): string {
  return new Date(days * DAY_MS).toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
