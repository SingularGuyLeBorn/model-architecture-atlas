import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import katex from "katex";
import { qwenCoreRecipe, qwenStateName } from "../src/templates/qwen-residual";
import { RecipePortsContext } from "../src/templates/RecipePorts";
import { elementIndex } from "../src/templates/structure-blocks";

vi.mock("@xyflow/react", async (original) => ({
  ...(await original<typeof import("@xyflow/react")>()),
  Handle: ({ id }: { id: string }) => <span data-handleid={id} />,
}));

it("嵌套专家号作为同一外层下标，特征索引加在外层末端", () => {
  expect(elementIndex("f_{48,e_{10},t}", "2560")).toBe("f_{48,e_{10},t,2560}");
  expect(elementIndex("W^{gate}_{48,e_{10}}", "1,640")).toBe(
    "W^{gate}_{48,e_{10},1,640}",
  );
  expect(elementIndex("x_t", "1")).toBe("x_{t,1}");
  expect(elementIndex("x", "d")).toBe("x_{d}");
});

for (const layer of [1, 2, 4, 48])
  for (const phase of ["prefill", "decode"] as const)
    it(`Qwen 四路主路径 ${layer} ${phase} · 原状态旁路、独立读写门与 MoE`, () => {
      const recipe = qwenCoreRecipe(phase, layer);
      const doms = new Map(
        recipe.stages.map((stage) => {
          const inputs = recipe.links.flatMap((e, i) =>
            e.target === stage.id ? [{ id: `in-${i}`, tex: e.tex }] : [],
          );
          const outputs = recipe.links.flatMap((e, i) =>
            e.source === stage.id ? [{ id: `out-${i}`, tex: e.tex }] : [],
          );
          const dom = document.createElement("div");
          dom.innerHTML = renderToStaticMarkup(
            <RecipePortsContext.Provider value={{ inputs, outputs }}>
              {stage.body}
            </RecipePortsContext.Provider>,
          );
          for (const math of dom.querySelectorAll("span[aria-label]")) {
            const tex = math.getAttribute("aria-label")!;
            expect(tex).not.toMatch(/\\\\[a-zA-Z]/);
            expect(tex).not.toMatch(/_\d{2}/);
            expect(() =>
              katex.renderToString(tex, { throwOnError: true }),
            ).not.toThrow();
          }
          expect(dom.innerHTML).not.toContain("undefined");
          return [stage.id, dom] as const;
        }),
      );
      expect(doms.size).toBe(recipe.stages.length);
      recipe.links.forEach((e, i) => {
        expect(
          doms.get(e.source)?.querySelectorAll(`[data-handleid="out-${i}"]`),
          `${e.source} -> ${e.target}: ${e.tex}`,
        ).toHaveLength(1);
        expect(
          doms.get(e.target)?.querySelectorAll(`[data-handleid="in-${i}"]`),
          `${e.source} -> ${e.target}: ${e.tex}`,
        ).toHaveLength(1);
      });
      expect(recipe.links).toContainEqual({
        source: layer === 2 ? "ple-inject" : "input",
        target: "attn-gr-write",
        tex: qwenStateName(layer, "in"),
      });
      expect(recipe.links).toContainEqual({
        source: "attn-gr-write",
        target: "ffn-gr-write",
        tex: qwenStateName(layer, "mid"),
      });
      for (const prefix of ["attn-gr", "ffn-gr"]) {
        const norm = doms.get(`${prefix}-norm`)!;
        expect(
          norm.querySelector("[data-object-link-count='8']"),
        ).not.toBeNull();
        for (const j of [1, 2, 3, 4]) {
          expect(
            norm.querySelectorAll(`[data-trace-object="norm-input-${j}"]`),
          ).toHaveLength(1);
          expect(
            norm.querySelectorAll(`[data-trace-object="norm-output-${j}"]`),
          ).toHaveLength(1);
        }
        expect(
          doms.get(`${prefix}-norm`)?.querySelectorAll(".architecture-rms"),
        ).toHaveLength(4);
        expect(
          doms.get(`${prefix}-read`)?.querySelectorAll("[data-read-product]"),
        ).toHaveLength(4);
        expect(
          doms.get(`${prefix}-write`)?.querySelectorAll(".architecture-sum"),
        ).toHaveLength(4);
        expect(doms.get(`${prefix}-write`)?.textContent).toContain(
          "未经归一化的原始路",
        );
        expect(
          recipe.links.some(
            (e) =>
              e.source === `${prefix}-norm` && e.target === `${prefix}-write`,
          ),
        ).toBe(false);
      }
      expect(
        recipe.stages.filter((s) => /^moe-expert-/.test(s.id)),
      ).toHaveLength(3);
      expect(
        [...doms.get("moe-shared")!.querySelectorAll("[aria-label]")].map((n) =>
          n.getAttribute("aria-label"),
        ),
      ).toContain("2560\\times1");
      expect(
        doms
          .get("moe-expert-10")
          ?.querySelector(`[aria-label="f_{${layer},e_{10},t,2560}"]`),
      ).not.toBeNull();
      expect(doms.get("moe-select")?.textContent).toContain(
        "只对这 10 项重新归一化",
      );
    });
