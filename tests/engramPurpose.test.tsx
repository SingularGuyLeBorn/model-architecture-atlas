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
      expect(purpose.textContent).toContain("没有跳过这些模块");
      expect(purpose.textContent).toContain("24 行 × 256 维");
      expect(purpose.textContent).toContain("独立参数，推理期间固定");
      expect(purpose.textContent).toContain("6144 → 25600");
      expect(root.querySelector(".katex-error")).toBeNull();
      const notes = explainModule({
        kind: "engram-lookup",
        layer,
        phase,
      }).paragraphs.join("");
      expect(notes).toContain("不保证");
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
