/**
 * 将HSL颜色转换为RGB颜色
 * @param h 色相 (0-360)
 * @param s 饱和度 (0-1)
 * @param l 亮度 (0-1)
 * @returns RGB颜色值数组 [r, g, b]
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = h % 360;
  if (h < 0) h += 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

/**
 * 将hue值转换为RGB颜色字符串
 * @param hue 色相值 (0-360)
 * @returns RGB颜色字符串
 */
export function hueToRgb(hue: number): string {
  const [r, g, b] = hslToRgb(hue, 0.7, 0.5); // 使用固定饱和度和亮度
  return `rgb(${r}, ${g}, ${b})`;
}