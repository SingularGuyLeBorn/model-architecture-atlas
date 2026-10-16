import { describe, expect, it } from "vitest";
import {
  DATA_WIRE_WIDTH,
  frameColor,
} from "../src/components/diagram-appearance";
import { COLORS } from "../src/components/diagram-primitives";

describe("边框与数据导线的视觉层级", () => {
  it.each([
    "green",
    "blue",
    "amber",
    "violet",
    "rose",
    "plum",
    "cyan",
    "indigo",
  ] as const)("%s 框线只提高亮度，不改变语义色的通道次序", (tone) => {
    const source = COLORS[tone];
    const result = frameColor(source);
    const channels = (hex: string) =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const original = channels(source),
      softened = channels(result);
    expect(softened.every((v, i) => v > original[i])).toBe(true);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        expect(Math.sign(softened[i] - softened[j])).toBe(
          Math.sign(original[i] - original[j]),
        );
    expect(frameColor(source)).toBe(result);
  });
  it("导线宽于常用框线，选中导线仍能继续强调", () => {
    expect(DATA_WIRE_WIDTH).toBeGreaterThan(2);
    expect(DATA_WIRE_WIDTH).toBeLessThan(3.4);
    expect(frameColor("currentColor")).toBe("currentColor");
  });
});
