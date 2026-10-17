import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { models, compressionForLayer, routedWeights } from "../src/data/models";
import { recipeFor } from "../src/templates/recipes";
import { layoutStages } from "../src/templates/RecipeCanvas";

describe("配置与版本边界", () => {
  it("五个模型族、V4 的 Flash/Pro 分开，不把视觉配置当文本配置", () => {
    expect(models).toHaveLength(9);
    expect(models.find((m) => m.id === "v41")!.config.hidden_size).toBe(5120);
    expect(models.find((m) => m.id === "v4-pro")!.config.hidden_size).toBe(
      7168,
    );
    expect(
      models.every((m) => /^[a-f0-9]{40}$/.test(m.provenance.revision)),
    ).toBe(true);
  });
  it("V4 压缩与 V4.1 分开", () => {
    const v4 = models.find((m) => m.id === "v4-flash")!;
    const v41 = models.find((m) => m.id === "v41")!;
    expect([1, 3, 4].map((l) => compressionForLayer(v4, l))).toEqual([
      0, 4, 128,
    ]);
    expect([1, 3, 21].map((l) => compressionForLayer(v41, l))).toEqual([
      0, 2, 1,
    ]);
  });
  it("混合系数来自选中原始分数，而非 Softmax", () => {
    expect(routedWeights([0.8, 0.4, 0.1], [0, 1], 1.5)).toEqual([1, 0.5]);
    expect(() => routedWeights([0], [0], 1.5)).toThrow();
  });
});
it.each(["prefill", "decode"] as const)(
  "Qwen %s 逐层入口连接模型首尾，独立机制仍可访问",
  (phase) => {
    const model = models.find((m) => m.id === "qwen38")!;
    expect(model.chapters).toEqual(["layer", "ple", "gdn", "qsa"]);
    const first = recipeFor(model, "layer", phase, 1);
    const last = recipeFor(model, "layer", phase, 48);
    expect(first.stages.map((s) => s.id)).toContain("embedding-copy");
    expect(last.stages.at(-1)?.id).toBe("lm-head");
    expect(first.references.length).toBeGreaterThanOrEqual(2);
    expect(last.references.length).toBeGreaterThanOrEqual(2);
  },
);
for (const model of models)
  for (const chapter of model.chapters.filter((c) => c !== "layer"))
    for (const phase of ["prefill", "decode"] as const) {
      it(`${model.id} / ${chapter} / ${phase} 的图都有结构、来源和有效公式`, () => {
        const recipe = recipeFor(
          model,
          chapter,
          phase,
          chapter === "qsa" ? 4 : 3,
        );
        expect(recipe.stages.length).toBeGreaterThanOrEqual(2);
        expect(new Set(recipe.stages.map((s) => s.id)).size).toBe(
          recipe.stages.length,
        );
        expect(recipe.references.length).toBeGreaterThanOrEqual(2);
        const html = recipe.stages
          .map((s) => renderToStaticMarkup(<>{s.body}</>))
          .join("");
        expect(html).not.toContain("katex-error");
        expect(html).not.toContain("undefined");
        expect(
          [
            recipe.introduction,
            ...recipe.stages.map((s) => s.title),
            html,
          ].join("\n"),
        ).not.toMatch(/不是|而非|并非|不能|不要|仍沿用同一绿色|不另起/);
        expect(recipe.stages.every((stage) => stage.output.length > 0)).toBe(
          true,
        );
      });
    }
it("布局使用实测高度，不依赖固定卡片高度", () => {
  const items = [100, 750, 200].map((height, i) => ({
    id: String(i),
    type: "stage" as const,
    position: { x: 0, y: 0 },
    measured: { width: 1200, height },
    data: { id: String(i), title: "测试", body: null, output: "x", ordinal: i },
  }));
  const result = layoutStages(items);
  expect(result.map((node) => node.position.y)).toEqual([30, 250, 1120]);
});
