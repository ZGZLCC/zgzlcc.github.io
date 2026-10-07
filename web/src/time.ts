const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function toBeijingInput(timestampMs: number): string {
  return new Date(timestampMs + BEIJING_OFFSET_MS).toISOString().slice(0, 16);
}

export function fromBeijingInput(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("请输入完整的北京时间");

  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, 0, 0);
  if (
    year < 1 || year > 9999 || date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day ||
    hour > 23 || minute > 59
  ) {
    throw new Error("日期或时间无效");
  }
  return date.getTime() - BEIJING_OFFSET_MS;
}

export function formatBeijingTime(timestampMs: number): string {
  return toBeijingInput(timestampMs).replace("T", " ");
}

export function formatDurationMinutes(milliseconds: number): string {
  const totalMinutes = Math.floor(milliseconds / 60_000);
  return `${Math.floor(totalMinutes / 60)}时 ${totalMinutes % 60}分`;
}

export function beijingToday(): string {
  return toBeijingInput(Date.now()).slice(0, 10);
}

export function shiftDate(date: string, amount: number): string {
  const utcMidnight = fromBeijingInput(`${date}T00:00`) + BEIJING_OFFSET_MS;
  return new Date(utcMidnight + amount * DAY_MS).toISOString().slice(0, 10);
}

/** 日期标题，例如 `10月6日`；不带星期。 */
export function formatDateHeading(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}月${day}日`;
}

/** 完整日期标题，例如 `2026年10月6日`。 */
export function formatDateLabel(date: string): string {
  return `${date.slice(0, 4)}年${formatDateHeading(date)}`;
}

export function formatWeekRange(startDate: string, endDate: string): string {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  if (startYear === endYear) {
    return `${startYear}年${startMonth}月${startDay}日 – ${endMonth}月${endDay}日`;
  }
  return `${startYear}年${startMonth}月${startDay}日 – ${endYear}年${endMonth}月${endDay}日`;
}
