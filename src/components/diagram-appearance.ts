// [OM-FREEPLAY] 框线混入 38% 白色，保留对象色相；导线保留原色并加粗到 3px。
// 只改静态描边，不添加阴影、滤镜或额外路径，避免增加大画布的绘制负担。
export const DATA_WIRE_WIDTH = 3;

const frameColors = new Map<string, string>();

export function frameColor(color: string): string {
  const cached = frameColors.get(color);
  if (cached) return cached;
  if (!/^#[\da-f]{6}$/i.test(color)) return color;
  const softened = `#${[1, 3, 5]
    .map((start) => {
      const value = parseInt(color.slice(start, start + 2), 16);
      return Math.round(value * 0.62 + 255 * 0.38)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
  frameColors.set(color, softened);
  return softened;
}
