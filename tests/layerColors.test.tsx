import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Expert, buildGraph } from "../src/compositions/DeepSeekV41Layer";
import { COLORS } from "../src/components/diagram-primitives";
import { EngramPurpose } from "../src/components/EngramPurpose";

it("Engram 概览与主图共享门控、残差身份色，不保留手写旧色板", () => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<EngramPurpose layer={2} />);
  const colorOf = (tex: string) =>
    [...root.querySelectorAll<HTMLElement>("[aria-label]")].find(
      (e) => e.getAttribute("aria-label") === tex,
    )?.parentElement?.style.background;
  expect(colorOf("g_c=f(h_c,k_c)")).toBe("rgb(246, 229, 201)");
  expect(colorOf("\\mathcal H^E\\quad4\\times5120")).toBe("rgb(223, 234, 245)");
});

it("全部层两阶段的专属导线与数据身份一致，不用专家分组色替代结果", () => {
  for (let layer = 1; layer <= 40; layer++)
    for (const phase of ["prefill", "decode"] as const) {
      const graph = buildGraph(layer, new Map(), phase);
      for (const edge of graph.edges) {
        expect(edge.data?.color, edge.id).toBe(edge.style?.stroke);
        if (
          edge.id.startsWith("expert-result-") ||
          edge.id.startsWith("expert-row-")
        )
          expect(edge.style?.stroke).toBe(COLORS.green);
        if (
          edge.id.startsWith("expert-product-") ||
          edge.id.startsWith("expert-sum-")
        )
          expect(edge.style?.stroke).toBe(COLORS.cyan);
        if (
          [
            "norm-q",
            "norm-kv",
            "query-matrix-row",
            "query-row-split",
            "add1-state",
            "add2-output",
          ].includes(edge.id)
        )
          expect(edge.style?.stroke).toBe(COLORS.blue);
        if (edge.id === "merge-heads")
          expect(edge.style?.stroke).toBe(COLORS.line);
      }
    }
});

it.each([true, false])(
  "专家 shared=%s：输入和不同中间角色明确分色",
  (shared) => {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
      <Expert layer={3} index={1} shared={shared} />,
    );
    const matrices = [...root.querySelectorAll("[data-expert-matrix]")];
    for (const [prefix, tone] of [
      ["Y_", "blue"],
      ["Z_", "plum"],
      ["A_", "mint"],
      ["B_", "forest"],
      ["C_", "teal"],
    ]) {
      const matrix = matrices.find((e) =>
        e.getAttribute("data-expert-matrix")?.startsWith(prefix),
      );
      expect(matrix, prefix).toBeDefined();
      expect(matrix?.getAttribute("data-tone")).toBe(tone);
    }
  },
);
