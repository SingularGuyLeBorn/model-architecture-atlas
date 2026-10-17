import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import katex from "katex";
import { qwenGdnRecipe } from "../src/templates/qwen-gdn";
import { RecipePortsContext } from "../src/templates/RecipePorts";

vi.mock("@xyflow/react", async (original) => ({
  ...(await original<typeof import("@xyflow/react")>()),
  Handle: ({ id }: { id: string }) => <span data-handleid={id} />,
}));

for (const layer of [1, 2, 3, 47])
  for (const phase of ["prefill", "decode"] as const)
    it(`Qwen GDN Layer ${layer} ${phase} · 真实端口、严格公式、状态更新依赖`, () => {
      const recipe = qwenGdnRecipe(phase, layer);
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
            expect(math.getAttribute("aria-label")).not.toMatch(/\\\\[a-zA-Z]/);
            expect(math.getAttribute("aria-label")).not.toMatch(/_\d{2}/);
            expect(() =>
              katex.renderToString(math.getAttribute("aria-label")!, {
                throwOnError: true,
              }),
            ).not.toThrow();
          }
          expect(dom.innerHTML).not.toContain("undefined");
          return [stage.id, dom] as const;
        }),
      );
      recipe.links.forEach((e, i) => {
        expect(
          doms.get(e.source)?.querySelectorAll(`[data-handleid="out-${i}"]`),
        ).toHaveLength(1);
        expect(
          doms.get(e.target)?.querySelectorAll(`[data-handleid="in-${i}"]`),
        ).toHaveLength(1);
      });
      expect(recipe.links).toContainEqual({
        source: "write",
        target: "read",
        tex: `S_{${layer},h,t}`,
      });
      expect(
        recipe.links.some((e) => e.source === "decay" && e.target === "read"),
      ).toBe(false);
      expect(
        doms.get("conv")?.querySelectorAll("[data-architecture-summand]"),
      ).toHaveLength(4);
      expect(
        doms.get("conv")?.querySelectorAll('[data-trace-object="window-t"]'),
      ).toHaveLength(1);
      expect(
        doms.get("write")?.querySelectorAll("[data-architecture-summand]"),
      ).toHaveLength(2);
      expect(doms.get("outer")?.textContent).toContain("128");
      expect(doms.get("gates")?.textContent).toContain("6144");
      expect(doms.get("qkv")?.textContent).toContain("10240");
      expect(doms.get("output")?.textContent).toContain("sigmoid");
      expect(doms.get("write")?.textContent).toContain("48");
    });

it("QSA 层和非法层号不冒充 GDN", () => {
  for (const layer of [0, 4, 8, 48, 49])
    expect(() => qwenGdnRecipe("decode", layer)).toThrow();
});
