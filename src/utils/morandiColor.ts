/**
 * 莫兰迪色调色工具
 */

// 莫兰迪色调色板
const morandiGradient = [
  { pos: 0, color: [184, 196, 204] },   // 灰蓝
  { pos: 0.2, color: [212, 202, 198] }, // 灰粉
  { pos: 0.4, color: [200, 212, 195] }, // 灰绿
  { pos: 0.6, color: [212, 200, 195] }, // 灰棕
  { pos: 0.8, color: [195, 200, 212] }, // 灰紫
  { pos: 1, color: [195, 212, 207] }    // 灰青绿
];

/**
 * 根据数值获取莫兰迪色值
 * @param number 数值范围 0-360
 * @returns RGB颜色字符串
 */
export function getMorandiColor(number: number): string {
  // 确保数值在有效范围内
  const clamped = Math.max(0, Math.min(360, number));
  // 归一化到 0-1 范围
  const normalized = clamped / 360;
  
  // 查找对应的渐变点
  for (let i = 0; i < morandiGradient.length - 1; i++) {
    const point1 = morandiGradient[i];
    const point2 = morandiGradient[i + 1];
    
    if (normalized >= point1.pos && normalized <= point2.pos) {
      const ratio = (normalized - point1.pos) / (point2.pos - point1.pos);
      
      const r = Math.round(point1.color[0] + (point2.color[0] - point1.color[0]) * ratio);
      const g = Math.round(point1.color[1] + (point2.color[1] - point1.color[1]) * ratio);
      const b = Math.round(point1.color[2] + (point2.color[2] - point1.color[2]) * ratio);
      
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  
  // 默认返回第一个颜色
  return `rgb(${morandiGradient[0].color.join(', ')})`;
}

/**
 * 根据数值获取莫兰迪色值的RGB数组
 * @param number 数值范围 0-360
 * @returns RGB颜色数组 [r, g, b]
 */
export function getMorandiColorArray(number: number): [number, number, number] {
  // 确保数值在有效范围内
  const clamped = Math.max(0, Math.min(360, number));
  // 归一化到 0-1 范围
  const normalized = clamped / 360;
  
  // 查找对应的渐变点
  for (let i = 0; i < morandiGradient.length - 1; i++) {
    const point1 = morandiGradient[i];
    const point2 = morandiGradient[i + 1];
    
    if (normalized >= point1.pos && normalized <= point2.pos) {
      const ratio = (normalized - point1.pos) / (point2.pos - point1.pos);
      
      const r = Math.round(point1.color[0] + (point2.color[0] - point1.color[0]) * ratio);
      const g = Math.round(point1.color[1] + (point2.color[1] - point1.color[1]) * ratio);
      const b = Math.round(point1.color[2] + (point2.color[2] - point1.color[2]) * ratio);
      
      return [r, g, b];
    }
  }
  
  // 默认返回第一个颜色
  return [...morandiGradient[0].color] as [number, number, number];
}