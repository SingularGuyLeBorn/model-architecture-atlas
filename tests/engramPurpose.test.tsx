import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EngramLookup } from "../src/compositions/DeepSeekV41Layer";
import { explainModule } from "../src/components/ModuleInspector";
import { models } from "../src/data/models";
import { recipeFor } from "../src/templates/recipes";

it("主图与独立章节说明 Engram 收益、成本、参数身份，不引入原论文卷积分支", () => {
  for (const layer of [2, 15]) {
    for (const phase of ["prefill", "decode"] as const) {
      const root = document.createElement("div");
      root.innerHTML = renderToStaticMarkup(
        <EngramLookup layer={layer} phase={phase} />,
      );
      const purpose = root.querySelector("[data-engram-purpose]")!;
      expect(purpose.textContent).toContain("24 行 × 256 维");
      expect(purpose.textContent).toContain("W: 6144 × 25600");
      expect(purpose.textContent).toContain("I | love | New | York");
      expect(purpose.textContent).not.toMatch(
        /计算账本|教学值|Logit Lens|CKA|毫秒/,
      );
      expect(purpose.querySelectorAll("path").length).toBeGreaterThan(15);
      expect(
        purpose.getElementsByTagNameNS(
          "http://www.w3.org/2000/svg",
          "foreignObject",
        ).length,
      ).toBeGreaterThan(15);
      expect(purpose.querySelector("[data-engram-comparison]")).not.toBeNull();
      expect(root.querySelector(".katex-error")).toBeNull();
      const table = root.querySelector("[data-engram-table]")!;
      expect(
        table.querySelectorAll("[data-matrix-ellipsis-column]"),
      ).toHaveLength(3);
      const cells = [
        ...table.querySelectorAll<HTMLElement>("[data-vector-cell]"),
      ];
      expect(new Set(cells.map((el) => el.style.background))).toEqual(
        new Set(["rgb(223, 228, 247)"]),
      );
      expect(table.querySelector("small, strong")).toBeNull();
      expect(
        root.querySelector(
          "[data-engram-read-layout] [data-engram-read-result]",
        ),
      ).not.toBeNull();
      const notes = explainModule({
        kind: "engram-lookup",
        layer,
        phase,
      }).paragraphs.join("");
      expect(notes).toContain("不保证");
      expect(notes).toContain("CKA");
      expect(notes).toContain("Logit Lens");
      expect(notes).toContain("40 层 Attention 与 FFN");
      expect(notes).toContain("0.5,0.02,0.22,0.36");
      expect(notes).toContain("没有 Engram 因果卷积分支");
    }
  }
  const recipe = recipeFor(
    models.find((model) => model.id === "v41")!,
    "engram",
    "decode",
    2,
  );
  const markup = recipe.stages
    .map((stage) => renderToStaticMarkup(<>{stage.body}</>))
    .join("");
  expect(markup).toContain("data-engram-purpose");
  expect(markup).not.toContain("结合因果卷积支路");
  expect(markup).not.toContain("投影矩阵、卷积");
  expect(markup).toContain("此版本没有 Engram 因果卷积分支");
});
