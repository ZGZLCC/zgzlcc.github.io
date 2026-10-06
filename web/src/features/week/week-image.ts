import type { WeekView } from "../../api";
import { TAGS } from "../../tags";
import { formatBeijingTime, formatDateHeading, formatDurationMinutes, formatWeekRange } from "../../time";

const width = 1680;
const left = 88;
const top = 264;
const hourHeight = 56;
const dayWidth = (width - left - 24) / 7;

/**
 * 导出配色写死在这里，不读页面上的 CSS 变量。
 *
 * 原来用 getComputedStyle 取 --export-tag-*，深色主题下取到的是另一套颜色，
 * 于是「同一次导出」在亮色和暗色下结果不同。导出图有自己的固定浅色底，
 * 配色跟着主题变没有意义，改成常量后才能保证任何时候导出都一模一样。
 */
const EXPORT_COLORS: Record<string, string> = {
  work: "#2563eb",
  leisure: "#c2410c",
  sleep: "#7c3aed",
  other: "#475569",
};

const exportColor = (tag: string) => EXPORT_COLORS[tag] ?? EXPORT_COLORS.other;

function drawStats(context: CanvasRenderingContext2D, week: WeekView) {
  context.fillStyle = "#626262";
  context.font = '16px "Microsoft YaHei", "Segoe UI", sans-serif';
  context.fillText("本周分类时长", 24, 106);
  const cardWidth = (width - 84) / 4;
  TAGS.forEach((tag, index) => {
    const x = 24 + index * (cardWidth + 12);
    const color = exportColor(tag.value);
    context.strokeStyle = "#dedede";
    context.strokeRect(x + 0.5, 120.5, cardWidth, 64);
    context.fillStyle = color;
    context.fillRect(x, 120, 4, 65);
    context.font = '14px "Microsoft YaHei", "Segoe UI", sans-serif';
    context.fillText(tag.label, x + 16, 144);
    context.fillStyle = "#080808";
    context.font = '600 22px "Microsoft YaHei", "Segoe UI", sans-serif';
    context.fillText(formatDurationMinutes(week.totals[`${tag.value}Ms`]), x + 16, 173);
  });
}

function drawGrid(context: CanvasRenderingContext2D, week: WeekView) {
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, top + 24 * hourHeight + 24);
  context.fillStyle = "#080808";
  context.font = '600 28px "Microsoft YaHei", "Segoe UI", sans-serif';
  context.fillText(`每周记录  ${formatWeekRange(week.days[0].date, week.days[6].date)}`, 24, 46);
  context.fillStyle = "#626262";
  context.font = '16px "Microsoft YaHei", "Segoe UI", sans-serif';
  context.fillText("北京时间 · 每日安排", 24, 78);
  drawStats(context, week);

  context.strokeStyle = "#dedede";
  context.lineWidth = 1;
  for (let hour = 0; hour <= 24; hour++) {
    const y = top + hour * hourHeight + 0.5;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(width - 24, y);
    context.stroke();
    context.fillStyle = "#626262";
    context.font = '12px "Segoe UI", sans-serif';
    context.fillText(`${String(hour).padStart(2, "0")}:00`, 24, y + 4);
  }
  for (let index = 0; index <= 7; index++) {
    const x = left + index * dayWidth + 0.5;
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, top + 24 * hourHeight);
    context.stroke();
  }
  context.fillStyle = "#080808";
  context.font = '600 16px "Microsoft YaHei", "Segoe UI", sans-serif';
  // 不传 maxWidth：传给 fillText 会触发水平压缩，字被挤扁；宁可让它被裁剪
  week.days.forEach((day, index) => {
    context.fillText(formatDateHeading(day.date), left + index * dayWidth + 10, top - 14);
  });
}

function drawEvents(context: CanvasRenderingContext2D, week: WeekView) {
  const entries = new Map(week.entries.map((entry) => [entry.id, entry]));
  week.days.forEach((day, index) => {
    const x = left + index * dayWidth;
    for (const segment of day.segments) {
      const entry = entries.get(segment.entryId);
      const color = exportColor(entry?.tag ?? "other");
      const y = top + ((segment.startMs - day.startMs) / 3_600_000) * hourHeight;
      const height = Math.max(4, ((segment.endMs - segment.startMs) / 3_600_000) * hourHeight);
      context.globalAlpha = 0.12;
      context.fillStyle = color;
      context.fillRect(x + 3, y + 1, dayWidth - 6, height - 2);
      context.globalAlpha = 1;
      context.fillRect(x + 3, y + 1, 4, height - 2);
      context.save();
      context.beginPath();
      context.rect(x + 9, y + 1, dayWidth - 15, height - 2);
      context.clip();
      context.fillStyle = "#080808";
      if (height >= 22) {
        context.font = '14px "Microsoft YaHei", "Segoe UI", sans-serif';
        // 同上：靠裁剪而不是压缩来限制宽度
        context.fillText(entry?.content ?? "记录", x + 13, y + 18);
      }
      if (height >= 42) {
        context.fillStyle = "#626262";
        context.font = '12px "Microsoft YaHei", "Segoe UI", sans-serif';
        const time = `${formatBeijingTime(segment.startMs).slice(11)}–${formatBeijingTime(segment.endMs).slice(11)}`;
        context.fillText(time, x + 13, y + 36);
      }
      context.restore();
    }
  });
}

/** 用 Canvas 绘制七天时间表与本周四类时长，导出固定浅色配色便于阅读。 */
export async function renderWeekImage(week: WeekView): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = top + 24 * hourHeight + 24;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建导出图片");
  drawGrid(context, week);
  drawEvents(context, week);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((image) => image ? resolve(image) : reject(new Error("无法生成导出图片")), "image/png");
  });
}

/** 文件名沿用桌面版口径：`Time_起始日期_结束日期.png`。 */
export function weekImageFileName(week: WeekView): string {
  return `Time_${week.days[0].date}_${week.days[6].date}.png`;
}

/** 生成图片与文件名；浏览器下载无法自动避让同名文件，由浏览器追加序号。 */
export async function renderWeekImageFile(week: WeekView): Promise<{ blob: Blob; fileName: string }> {
  return { blob: await renderWeekImage(week), fileName: weekImageFileName(week) };
}
