import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import katex from "katex";
import { SiluRow, SwiGlu } from "../src/templates/architecture-blocks";

for (const [divisor, compact] of [
  [1, false],
  [4, false],
  [1, true],
  [4, true],
] as const)
  it(`SiLU 保留 ${divisor} 倍分母、原值支路、sigmoid 支路和完整结果 · 紧凑=${compact}`, () => {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
      <SiluRow
        input="g_{48,e_{10},t}"
        output="a_{48,e_{10},t}"
        size={640}
        divisor={divisor}
        compact={compact}
      />,
    );
    expect(root.querySelector("[data-object-link-count='6']")).not.toBeNull();
    for (const id of [
      "silu-input",
      "silu-identity",
      "silu-sigmoid",
      "silu-multiply",
      "silu-element",
      "silu-output",
    ])
      expect(root.querySelectorAll(`[data-trace-object="${id}"]`)).toHaveLength(
        1,
      );
    expect(
      root.querySelector('[data-trace-object="silu-multiply"] .data-box'),
    ).toBeNull();
    const formulas = [...root.querySelectorAll("span[aria-label]")].map(
      (el) => el.getAttribute("aria-label")!,
    );
    expect(formulas).toContain("\\sigma(z)=\\frac{1}{1+e^{-z}}");
    expect(formulas).toContain("a=z\\cdot\\sigma(z)");
    expect(formulas).toContain(
      divisor === 1
        ? "z:= (g_{48,e_{10},t})_d"
        : "z:= \\frac{(g_{48,e_{10},t})_d}{4}",
    );
    for (const d of [1, 2, 640])
      expect(formulas).toContain(`a_{48,e_{10},t,${d}}`);
    for (const tex of formulas)
      expect(() =>
        katex.renderToString(tex, { throwOnError: true }),
      ).not.toThrow();
  });

it("共享 SwiGLU 把 gate 投影接到 SiLU，up 保持独立", () => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <SwiGlu
      input="x_{4,t}"
      output="f_{4,t}"
      hidden={2560}
      intermediate={640}
      scope="4,e_{10}"
    />,
  );
  expect(root.querySelectorAll("[data-silu-row]")).toHaveLength(1);
  for (const id of [
    "gate-out",
    "silu-input",
    "activated",
    "up-out",
    "multiply-a",
    "multiply-u",
    "product",
    "down-in",
  ])
    expect(root.querySelectorAll(`[data-trace-object="${id}"]`)).toHaveLength(
      1,
    );
  const color = (id: string) =>
    root.querySelector<HTMLElement>(`[data-trace-object="${id}"] .scalar`)!
      .style.borderColor;
  expect(color("gate-out")).toBe(color("silu-input"));
  expect(color("up-out")).toBe(color("multiply-u"));
  expect(color("activated")).toBe(color("multiply-a"));
  expect(color("product")).toBe(color("down-in"));
  expect(color("gate-out")).not.toBe(color("up-out"));
});
