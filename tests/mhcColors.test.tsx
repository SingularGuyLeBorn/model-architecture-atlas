import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  MhcGate,
  MhcSinkhorn,
  MhcProjection,
  SigmoidSteps,
  MHC_AFFINE_TONES,
} from "../src/components/MhcCoefficientStages";
import {
  tonePalette,
  type DiagramTone,
} from "../src/components/diagram-primitives";

function render(element: Parameters<typeof renderToStaticMarkup>[0]) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(element);
  return root;
}
function backgrounds(root: HTMLElement, tex: string) {
  return [...root.querySelectorAll<HTMLElement>("[aria-label]")]
    .filter((node) => node.getAttribute("aria-label") === tex)
    .map((node) => {
      let box: HTMLElement | null = node;
      while (box && !box.style.background) box = box.parentElement;
      return box?.style.background;
    });
}
function color(tone: DiagramTone) {
  const box = document.createElement("div");
  box.style.background = tonePalette(tone).background;
  return box.style.background;
}

it.each(["p", "q"] as const)(
  "%s 的 s、b、a 区分颜色，a 的消费端沿用结果色",
  (kind) => {
    const root = render(createElement(MhcGate, { kind, children: null }));
    const offset = kind === "p" ? 0 : 4;
    for (const j of [1, 2, 3, 4]) {
      expect(backgrounds(root, `s_${kind === "p" ? 1 : 2}`)).toContain(
        color(MHC_AFFINE_TONES.scale),
      );
      expect(backgrounds(root, `b_{${offset + j}}`)).toEqual([
        color(MHC_AFFINE_TONES.bias),
      ]);
      expect(backgrounds(root, `a^{${kind}}_${j}`)).toEqual([
        color(MHC_AFFINE_TONES.result),
        color(MHC_AFFINE_TONES.result),
      ]);
    }
    expect(new Set(Object.values(MHC_AFFINE_TONES)).size).toBe(3);
  },
);

it("C 的偏置矩阵、结果矩阵与展开行继承各自语义色", () => {
  const root = render(createElement(MhcSinkhorn, { children: null }));
  expect(backgrounds(root, "s_3")).toEqual([color(MHC_AFFINE_TONES.scale)]);
  expect(backgrounds(root, "B^C")).toEqual([color(MHC_AFFINE_TONES.bias)]);
  expect(backgrounds(root, "A^C")).toEqual([color(MHC_AFFINE_TONES.result)]);
  for (let k = 1; k <= 4; k++)
    for (let j = 1; j <= 4; j++) {
      expect(backgrounds(root, `b_{${8 + 4 * (k - 1) + j}}`)).toEqual([
        color(MHC_AFFINE_TONES.bias),
      ]);
      const values = backgrounds(root, `a^C_{${k}${j}}`);
      expect(values.length).toBe(k === 1 ? 2 : 1);
      expect(values.every((v) => v === color(MHC_AFFINE_TONES.result))).toBe(
        true,
      );
    }
});

it("图例与 sigmoid 输入沿用 mHC 结果色，SiLU 的 z 不被改色", () => {
  const legend = render(
    createElement(MhcProjection, { layer: 15, sub: "A" }),
  ).querySelector<HTMLElement>("[data-mhc-affine-legend]")!;
  for (const [role, symbol] of [
    ["scale", "s"],
    ["bias", "b"],
    ["result", "a"],
  ] as const)
    expect(backgrounds(legend, symbol)).toEqual([
      color(MHC_AFFINE_TONES[role]),
    ]);
  const sigmoid = render(<SigmoidSteps inputTone={MHC_AFFINE_TONES.result} />);
  expect(backgrounds(sigmoid, "a")).toEqual([color(MHC_AFFINE_TONES.result)]);
  const silu = render(<SigmoidSteps input="z" vertical />);
  expect(backgrounds(silu, "z")).toEqual([color("amber")]);
});
