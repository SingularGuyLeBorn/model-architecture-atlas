import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildGraph, Expert } from "../src/compositions/DeepSeekV41Layer";

function expertElement(shared = false) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    createElement(Expert, { layer: 29, index: 31, score: ".86", shared }),
  );
  return root;
}

describe("专家内部矩阵乘法与 SiLU 数据流", () => {
  it.each([false, true])(
    "C 与下投影权重同排，乘号独立于两个矩阵（shared=%s）",
    (shared) => {
      const root = expertElement(shared);
      const projection = root.querySelector<HTMLElement>(
        "[data-expert-down-projection]",
      )!;
      expect(projection.style.display).toBe("grid");
      expect(projection.children).toHaveLength(3);
      expect(projection.children[0].getAttribute("data-expert-matrix")).toMatch(
        /^C_\{29,/,
      );
      expect(
        projection.children[1]
          .querySelector("[aria-label]")
          ?.getAttribute("aria-label"),
      ).toBe("\\times");
      expect(
        projection.children[2]
          .querySelector("[data-expert-matrix]")
          ?.getAttribute("data-expert-matrix"),
      ).toContain("\\mathrm{down}");
      expect(projection.querySelector("svg")).toBeNull();
      const result = projection.nextElementSibling!;
      expect(result.hasAttribute("data-expert-down-result")).toBe(true);
      expect(
        result.children[0].getAttribute("aria-label") ??
          result.children[0]
            .querySelector("[aria-label]")
            ?.getAttribute("aria-label"),
      ).toBe("=");
      expect(result.children[1].getAttribute("data-expert-matrix")).toContain(
        "(Y_{29})",
      );
      expect(result.querySelector("svg")).toBeNull();
      expect(
        root.querySelector<HTMLElement>("[data-expert-structure]")!.style
          .height,
      ).toBe("");
      expect(root.querySelector(".katex-error")).toBeNull();
    },
  );

  it("SiLU 两路有箭头进入乘法，输出与示例都命名为 a", () => {
    const root = expertElement();
    expect(root.querySelectorAll("[data-silu-operand]")).toHaveLength(2);
    expect(root.querySelector('[data-sigmoid-steps="z"]')).toBeNull();
    expect(
      root.querySelectorAll("[data-silu-operand] [aria-label]"),
    ).toHaveLength(2);
    expect(
      root
        .querySelectorAll("[data-silu-operand] [aria-label]")[1]
        .getAttribute("aria-label"),
    ).toBe("\\sigma(z)=\\frac1{1+e^{-z}}");
    expect(
      [...root.querySelectorAll("[data-silu-arrow]")].map((node) =>
        node.getAttribute("data-silu-arrow"),
      ),
    ).toEqual(["identity", "sigmoid", "output"]);
    expect(
      root
        .querySelector("[data-silu-output] [aria-label]")
        ?.getAttribute("aria-label"),
    ).toBe("a=z\\cdot\\sigma(z)");
    expect(
      root
        .querySelector("[data-silu-example] [aria-label]")
        ?.getAttribute("aria-label"),
    ).toContain("a=2\\times0.8808");
    expect(
      root.querySelector('[data-expert-matrix="A_{29,31}"]'),
    ).not.toBeNull();
  });

  it("专家框按内容测量，收紧后下游输出与求和同步上移", () => {
    const baseline = buildGraph(29);
    const compact = buildGraph(29, new Map([["experts", 1000]]));
    expect(
      baseline.nodes.find((node) => node.id === "experts")!.style?.height,
    ).toBeUndefined();
    for (const id of [
      "expert-output-31",
      "expert-scale-31",
      "expert-weighted-31",
      "moe-sum",
      "output",
    ]) {
      expect(
        compact.nodes.find((node) => node.id === id)!.position.y -
          baseline.nodes.find((node) => node.id === id)!.position.y,
      ).toBe(-300);
    }
  });
});
