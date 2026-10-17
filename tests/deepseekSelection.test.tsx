import { renderToStaticMarkup } from "react-dom/server";
import katex from "katex";
import { expect, it } from "vitest";
import { deepseekLayerRecipe } from "../src/templates/deepseek-layer";
import {
  deepseekSelectionStages,
  dsaSelectionShape,
} from "../src/templates/deepseek-selection";

for (const phase of ["prefill", "decode"] as const) {
  it(`DSA ${phase} 区分原始 Top-K 宽度和有效可见行数`, () => {
    const shape = dsaSelectionShape(phase);
    expect(shape).toEqual({
      length: phase === "prefill" ? "N" : "t",
      budget: phase === "prefill" ? "\\min(2048,N)" : "\\min(2048,t)",
      visible: "\\min(2048,t)",
    });
    const stages = deepseekSelectionStages(phase, 61);
    const root = document.createElement("div");
    root.innerHTML = stages
      .map((stage) => renderToStaticMarkup(<>{stage.body}</>))
      .join("");
    const formulas = [...root.querySelectorAll("span[aria-label]")].map(
      (el) => el.getAttribute("aria-label")!,
    );
    expect(formulas).toContain(
      `\\operatorname{TopK}_{K},\\quad K=${shape.budget}`,
    );
    expect(formulas).toContain("m^I_{61,t,j}=b^I_{61,t,j}+c^{mask}_{61,t,j}");
    expect(formulas).toContain("t\\times1");
    expect(formulas).toContain("r_a,r_b,r_c\\in\\{1,\\ldots,K\\}");
    expect(formulas).toContain("\\bar s^I_{61,t,1}");
    expect(formulas).toContain(
      "m^{read}_{61,t,j}:=m^I_{61,t,j},\\quad 1\\le j\\le t",
    );
    for (const tex of formulas)
      expect(() =>
        katex.renderToString(tex, { throwOnError: true }),
      ).not.toThrow();
    for (const branch of [0, 1]) {
      const cache = root.querySelector(`[data-dsa-cache="${branch}"]`)!;
      expect(
        cache.querySelector("[data-object-link-count='3']"),
      ).not.toBeNull();
      for (const j of ["j_a", "j_b", "j_c"]) {
        expect(
          cache.querySelector(`[data-trace-object="mask-${branch}-${j}"]`)
            ?.textContent,
        ).toContain("0");
        const row = cache.querySelector(
          `[data-trace-object="cache-${branch}-${j}"]`,
        )!;
        expect(row.classList.contains("picked")).toBe(true);
        const last = row.querySelector(".scalar:last-child [aria-label]")!;
        expect(last.getAttribute("aria-label")).toBe(
          `${branch === 0 ? "c^{KV}" : "k^R"}_{61,${j},${branch === 0 ? 512 : 64}}`,
        );
      }
    }
  });
}

it("只有 V3.2 连接独立 DSA 掩码；内容和位置缓存来自同一层", () => {
  const recipe = deepseekLayerRecipe("v32", "prefill", 61);
  for (const tex of ["C^{KV}_{61,\\le t}", "K^R_{61,\\le t}"])
    expect(recipe.links).toContainEqual({
      source: "kv",
      target: "index-read",
      tex,
    });
  expect(recipe.links).toContainEqual({
    source: "index",
    target: "index-select",
    tex: "s^I_{61,t}",
  });
  expect(recipe.links).toContainEqual({
    source: "index-read",
    target: "attention",
    tex: "m^{read}_{61,t}",
  });
  const attention = document.createElement("div");
  attention.innerHTML = renderToStaticMarkup(
    <>{recipe.stages.find((stage) => stage.id === "attention")!.body}</>,
  );
  expect(attention.querySelectorAll(".tensor-row.picked")).toHaveLength(0);
  expect(
    attention
      .querySelector('[data-trace-object="score-with-mask"]')
      ?.closest(".architecture-sum")?.textContent,
  ).toContain("read");
  for (const id of ["v3", "r1", "v31"] as const)
    expect(
      deepseekLayerRecipe(id, "prefill", 61).stages.some((stage) =>
        stage.id.startsWith("index"),
      ),
    ).toBe(false);
});
