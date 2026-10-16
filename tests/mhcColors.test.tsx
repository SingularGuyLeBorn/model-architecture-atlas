import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  MhcGate,
  MhcSinkhorn,
  MhcProjection,
  SigmoidDefinition,
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
  "%s 的 s、b、a 区分颜色，四个门控元素用等式计算",
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
      ]);
      const equations = root.querySelector("[data-mhc-gate-equations]")!;
      const formulas = [...equations.querySelectorAll("[aria-label]")].map(
        (node) => node.getAttribute("aria-label"),
      );
      expect(formulas).toContain(`v^{${kind}}_${j}=\\sigma(a^{${kind}}_${j})`);
      expect(formulas).toContain(
        kind === "p"
          ? `p_${j}=v^p_${j}+\\epsilon_{HC}`
          : `q_${j}=2\\cdot v^q_${j}`,
      );
      expect(formulas.some((tex) => tex?.includes("arrow"))).toBe(false);
    }
    expect(new Set(Object.values(MHC_AFFINE_TONES)).size).toBe(3);
  },
);

it("C 的偏置矩阵、结果矩阵与展开行继承各自语义色", () => {
  const root = render(createElement(MhcSinkhorn, { children: null }));
  expect(backgrounds(root, "s_3")).toEqual([color(MHC_AFFINE_TONES.scale)]);
  expect(backgrounds(root, "B^C")).toEqual(["transparent"]);
  expect(backgrounds(root, "A^C")).toEqual(["transparent"]);
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

it("Sinkhorn 的指数、分母、行结果和首轮矩阵区分，前后引用同色", () => {
  const root = render(createElement(MhcSinkhorn, { children: null }));
  expect(backgrounds(root, "e_{11}")).toEqual([color("green")]);
  expect(backgrounds(root, "d_1=e_{11}+e_{12}+e_{13}+e_{14}")).toEqual([
    color("amber"),
  ]);
  expect(backgrounds(root, "T_{11}")).toEqual([color("cyan"), color("cyan")]);
  expect(backgrounds(root, "d^{col}_1")).toEqual(Array(4).fill(color("amber")));
  expect(backgrounds(root, "C^{(1)}_{11}")).toEqual([color("blue")]);
  expect(backgrounds(root, "c^{(1)}_{11}")).toEqual([color("blue")]);
});

it("图例保留语义色，sigmoid 使用单个定义且没有算术箭头链", () => {
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
  const sigmoid = render(<SigmoidDefinition />);
  expect(
    [...sigmoid.querySelectorAll("[aria-label]")].map((node) =>
      node.getAttribute("aria-label"),
    ),
  ).toEqual(["\\sigma(a)=\\frac{1}{1+e^{-a}}"]);
  expect(sigmoid.querySelector("[data-sigmoid-steps]")).toBeNull();
  expect(sigmoid.querySelector(".katex-error")).toBeNull();
});
