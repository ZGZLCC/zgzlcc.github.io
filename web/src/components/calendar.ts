/**
 * 自绘日期选择器用到的纯日历计算。
 *
 * 日期一律按 `YYYY-MM-DD` 字符串处理，只用 `Date.UTC` 做星期与加减法，
 * 不碰本地时区，避免时区把日期挪一天。
 */
const DAY_MS = 86_400_000;

/** 周一开头，与项目里「一周从周一开始」的口径一致。 */
export const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export interface DayCell {
  date: string;
  day: number;
  /** 属于当前月份，还是补齐前后的日子。 */
  currentMonth: boolean;
}

function toMs(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NaN;
}

const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function isDate(date: string): boolean {
  const ms = toMs(date);
  // 反查一次，挡掉 2026-02-30 这种会被 Date 自动进位的非法日期
  return !Number.isNaN(ms) && toDate(ms) === date;
}

export const addDays = (date: string, amount: number) => toDate(toMs(date) + amount * DAY_MS);

/** 加减月份，日号夹到目标月合法范围（1月31日 + 1 月 → 2月28/29日）。 */
export function addMonths(date: string, amount: number): string {
  const source = new Date(toMs(date));
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth() + amount;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toDate(Date.UTC(year, month, Math.min(source.getUTCDate(), last)));
}

/** 固定 6 行 42 格，切换月份时高度不跳。 */
export function monthGrid(month: string): { label: string; cells: DayCell[] } {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = Date.UTC(year, monthNumber - 1, 1);
  const offset = (new Date(first).getUTCDay() + 6) % 7;
  const cells: DayCell[] = [];
  for (let index = 0; index < 42; index += 1) {
    const ms = first + (index - offset) * DAY_MS;
    const value = new Date(ms);
    cells.push({
      date: toDate(ms),
      day: value.getUTCDate(),
      currentMonth: value.getUTCMonth() === monthNumber - 1,
    });
  }
  return { label: `${year}年${monthNumber}月`, cells };
}
