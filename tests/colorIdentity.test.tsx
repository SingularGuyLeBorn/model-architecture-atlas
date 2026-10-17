import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  COLORS,
  selectionPalette,
  tonePalette,
  VectorStrip,
  type DiagramTone,
} from "../src/components/diagram-primitives";

const luminance = (hex: string) =>
  [1, 3, 5]
    .map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);

it("全部身份色的选区只加深填充，不更换描边或数据身份，公式对比度仍可读", () => {
  for (const key of Object.keys(COLORS).filter((k) => k.endsWith("Soft"))) {
    const tone = key.slice(0, -4) as DiagramTone;
    const normal = tonePalette(tone),
      selected = selectionPalette(tone);
    expect(selected.color).toBe(normal.color);
    expect(selected.background).not.toBe(normal.background);
    expect(luminance(selected.background)).toBeLessThan(
      luminance(normal.background),
    );
    expect(
      (luminance(selected.background) + 0.05) / (luminance(COLORS.ink) + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
      <VectorStrip
        name="v"
        length="512"
        elementTex={(d) => `v_{${d}}`}
        tone={tone}
        selected
      />,
    );
    expect(
      root.querySelector("[data-vector-selected]")?.getAttribute("data-tone"),
    ).toBe(tone);
    expect(root.querySelectorAll("[data-vector-cell]")).toHaveLength(3);
  }
});
