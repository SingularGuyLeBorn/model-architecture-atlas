import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import katex from "katex";
import {
  deepseekLayerRecipe,
  type DeepSeekLayerId,
} from "../src/templates/deepseek-layer";
import { RecipePortsContext } from "../src/templates/RecipePorts";
import { models } from "../src/data/models";
import { recipeFor } from "../src/templates/recipes";
import { Row, architectureTone } from "../src/templates/architecture-blocks";

// 此处只校验声明与对象绑定；真实 Handle 测量和连线在浏览器回归中检查。
vi.mock("@xyflow/react", async (importOriginal) => {
  const original = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...original,
    Handle: ({ id }: { id: string }) => <span data-handleid={id} />,
  };
});

for (const id of ["v3", "r1", "v31", "v32"] as DeepSeekLayerId[])
  for (const layer of [1, 3, 4, 61])
    for (const phase of ["prefill", "decode"] as const) {
      it(`${id} 第 ${layer} 层 ${phase} 的每条连线均有真实张量端口`, () => {
        const recipe = deepseekLayerRecipe(id, phase, layer);
        const rendered = new Map(
          recipe.stages.map((stage) => {
            const inputs = recipe.links.flatMap((edge, i) =>
              edge.target === stage.id
                ? [{ id: `in-${i}`, tex: edge.tex }]
                : [],
            );
            const outputs = recipe.links.flatMap((edge, i) =>
              edge.source === stage.id
                ? [{ id: `out-${i}`, tex: edge.tex }]
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
            for (const math of dom.querySelectorAll("span[aria-label]"))
              expect(() =>
                katex.renderToString(math.getAttribute("aria-label")!, {
                  throwOnError: true,
                }),
              ).not.toThrow();
            expect(html).not.toContain("undefined");
            return [stage.id, dom] as const;
          }),
        );
        recipe.links.forEach((edge, i) => {
          expect(
            rendered
              .get(edge.source)
              ?.querySelectorAll(`[data-handleid="out-${i}"]`),
          ).toHaveLength(1);
          expect(
            rendered
              .get(edge.target)
              ?.querySelectorAll(`[data-handleid="in-${i}"]`),
          ).toHaveLength(1);
        });
        expect(recipe.stages.some((s) => s.id === "dense")).toBe(layer <= 3);
        expect(recipe.stages.some((s) => s.id === "shared")).toBe(layer > 3);
        expect(recipe.stages.some((s) => s.id === "index")).toBe(id === "v32");
        const model = models.find((m) => m.id === id)!;
        expect(model.chapters).toContain("layer");
        expect(recipeFor(model, "layer", phase, layer).links).toEqual(
          recipe.links,
        );
      });
    }

describe("真实依赖与模型身份", () => {
  it("行号向量的大写容器展开成小写元素，参数行没有伪造 token 下标", () => {
    const html = renderToStaticMarkup(
      <Row name="I_{4,t}" size={2048} tone="amber" />,
    );
    expect(html).toContain("i_{4,t,1}");
    expect(html).not.toContain("I_{4,t,1}");
    const gamma = document.createElement("div");
    gamma.innerHTML = renderToStaticMarkup(
      <Row name="\\gamma^A_{4}" size={7168} tone="crimson" />,
    );
    expect(gamma.querySelector(".tensor-row > small")?.textContent).toBe("");
    expect(architectureTone("x_{4,t}")).toBe("blue");
    expect(architectureTone("c^{KV}_{4,t}")).toBe("ocean");
  });
  it("Query/KV 和 Router/共享专家为同源分支，无假串行", () => {
    const recipe = deepseekLayerRecipe("v32", "decode", 4);
    expect(
      recipe.links.some((e) => e.source === "query" && e.target === "kv"),
    ).toBe(false);
    expect(
      recipe.links.some((e) => e.source === "router" && e.target === "shared"),
    ).toBe(false);
    expect(recipe.links).toContainEqual({
      source: "query",
      target: "index-query",
      tex: "q^{low}_{4,t}",
    });
    expect(recipe.links).toContainEqual({
      source: "index-read",
      target: "attention",
      tex: "m^{read}_{4,t}",
    });
    expect(recipe.links).toContainEqual({
      source: "input",
      target: "residual-a",
      tex: "h_{4,t}",
    });
    expect(recipe.links).toContainEqual({
      source: "residual-a",
      target: "residual-f",
      tex: "y_{4,t}",
    });
  });
});
