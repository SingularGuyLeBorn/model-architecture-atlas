import { renderToStaticMarkup } from "react-dom/server";
import { setImmediate } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import katex from "katex";
import { mimoLayerRecipe } from "../src/templates/mimo-layer";
import { RecipePortsContext } from "../src/templates/RecipePorts";
import { layerArchitecture } from "../src/data/architecture-profiles";

vi.mock("@xyflow/react", async (original) => ({
  ...(await original<typeof import("@xyflow/react")>()),
  Handle: ({ id }: { id: string }) => <span data-handleid={id} />,
}));

for (const layer of Array.from({ length: 48 }, (_, i) => i + 1))
  for (const phase of ["prefill", "decode"] as const) {
    it(`MiMo 第 ${layer} 层 ${phase} 的形状与真实对象端口`, async () => {
      // 96 个同步 DOM/公式渲染间归还事件循环，让测试进程及时发送结果，不延长超时或省略断言。
      await setImmediate();
      const recipe = mimoLayerRecipe(phase, layer),
        arch = layerArchitecture("mimo25", layer);
      const doms = new Map(
        recipe.stages.map((stage) => {
          const inputs = recipe.links.flatMap((e, i) =>
            e.target === stage.id
              ? [{ id: `in-${i}`, tex: e.tex, side: e.targetSide }]
              : [],
          );
          const outputs = recipe.links.flatMap((e, i) =>
            e.source === stage.id
              ? [{ id: `out-${i}`, tex: e.tex, side: e.sourceSide }]
              : [],
          );
          const html = renderToStaticMarkup(
            <RecipePortsContext.Provider value={{ inputs, outputs }}>
              {stage.body}
            </RecipePortsContext.Provider>,
          );
          const dom = document.createElement("div");
          dom.innerHTML = html;
          expect(dom.querySelector(".katex-error")).toBeNull();
          for (const math of dom.querySelectorAll("span[aria-label]")) {
            expect(math.getAttribute("aria-label")).not.toMatch(/_\d{2}/);
            expect(() =>
              katex.renderToString(math.getAttribute("aria-label")!, {
                throwOnError: true,
              }),
            ).not.toThrow();
          }
          expect(html).not.toContain("undefined");
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
      for (const [source, target] of [
        ["input", "residual-a"],
        ["residual-a", "residual-f"],
      ]) {
        expect(
          recipe.links.find((e) => e.source === source && e.target === target),
        ).toMatchObject({ sourceSide: "left", targetSide: "left" });
      }
      expect(
        recipe.links.find(
          (e) => e.source === "rope" && e.target === "attention",
        ),
      ).toMatchObject({ sourceSide: "bottom", targetSide: "left" });
      const weighted = doms.get("weighted")!;
      expect(
        weighted.querySelector("[data-object-link-count='6']"),
      ).not.toBeNull();
      for (const row of [
        arch.window ? "r" : "1",
        arch.window ? "r+1" : "2",
        "t",
      ]) {
        expect(
          weighted.querySelectorAll(`[data-trace-object="read-${row}"]`),
        ).toHaveLength(3);
        expect(
          weighted.querySelectorAll(`[data-trace-object="value-${row}"]`),
        ).toHaveLength(3);
      }
      expect(recipe.stages.some((s) => s.id === "dense")).toBe(layer === 1);
      expect(recipe.stages.some((s) => s.id === "shared")).toBe(false);
      expect(doms.get("attention")?.textContent?.includes("sink")).toBe(
        arch.sink,
      );
      expect(doms.get("qkv")?.textContent).toContain(
        arch.window ? "14848" : "13568",
      );
      expect(doms.get("value-scale")?.textContent).toContain("0.707");
      expect(doms.get("rope")?.textContent).toContain(
        arch.window ? "10000" : "10000000",
      );
      expect(
        recipe.links.some(
          (e) => e.source === "rope" && e.target === "value-scale",
        ),
      ).toBe(false);
    });
  }
