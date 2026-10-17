import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import katex from "katex";
import { qwenQsaRecipe } from "../src/templates/qwen-qsa";
import { RecipePortsContext } from "../src/templates/RecipePorts";

vi.mock("@xyflow/react", async (original) => ({
  ...(await original<typeof import("@xyflow/react")>()),
  Handle: ({ id }: { id: string }) => <span data-handleid={id} />,
}));

for (const layer of [4, 8, 48])
  for (const phase of ["prefill", "decode"] as const)
    it(`QSA Layer ${layer} ${phase} · 块选择不替代原 K/V，公式与端口可追踪`, () => {
      const recipe = qwenQsaRecipe(phase, layer);
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
      recipe.links.forEach((e, i) => {
        expect(
          doms.get(e.source)?.querySelectorAll(`[data-handleid="out-${i}"]`),
        ).toHaveLength(1);
        expect(
          doms.get(e.target)?.querySelectorAll(`[data-handleid="in-${i}"]`),
        ).toHaveLength(1);
      });
      expect(
        recipe.links.filter((e) => e.target === "read").map((e) => e.source),
      ).toEqual(["cache", "cache", "select"]);
      expect(
        recipe.links.some(
          (e) => e.source === "block-key" && e.target === "read",
        ),
      ).toBe(false);
      expect(
        doms.get("pool")?.querySelectorAll("[data-architecture-summand]"),
      ).toHaveLength(4);
      expect(
        doms
          .get("index-score")
          ?.querySelectorAll("[data-architecture-summand]"),
      ).toHaveLength(4);
      expect(
        doms.get("read")?.querySelectorAll('[data-trace-object="id"]'),
      ).toHaveLength(3);
      expect(
        doms.get("read")?.querySelectorAll('[data-trace-object="key"]'),
      ).toHaveLength(3);
      expect(
        doms.get("read")?.querySelectorAll('[data-trace-object="value"]'),
      ).toHaveLength(3);
      expect(doms.get("select")?.textContent).toContain("尾部");
      expect(doms.get("qz-split")?.textContent).toContain(
        "每行前 256 维 Q、后 256 维 gate",
      );
      expect(
        doms.get("block-key")?.querySelector('[aria-label*="4b-4"]'),
      ).not.toBeNull();
      for (const r of ["1", "2", "L_t"])
        expect(
          doms
            .get("weighted")
            ?.querySelector(`[aria-label="v_{${layer},g,j_{${r}},256}"]`),
        ).not.toBeNull();
    });

it("GDN 层和非法层号不能套用 QSA", () => {
  for (const layer of [0, 1, 2, 3, 47, 49])
    expect(() => qwenQsaRecipe("decode", layer)).toThrow();
});
