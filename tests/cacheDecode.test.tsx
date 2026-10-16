import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CACHE_101,
  cacheDecodeRecipe,
} from "../src/components/CacheDecodeExample";
import { exportFileName, unionBounds } from "../src/components/diagram-svg";
import { models, rawConfigs } from "../src/data/models";
import { recipeFor } from "../src/templates/recipes";
import { explainModule } from "../src/components/ModuleInspector";

describe("第 101 个 token 的缓存契约", () => {
  it("固定层号、压缩组、窗口与读取数对齐官方配置", () => {
    const config = rawConfigs.v41.text_config;
    expect(config.kv_source_layer_ids).toContain(2);
    expect(config.kv_source_layer_ids).not.toContain(3);
    expect(config.index_source_layer_ids).not.toContain(3);
    expect(CACHE_101.globalRows).toBe(
      Math.floor(CACHE_101.token / config.compress_ratios[2]),
    );
    expect(CACHE_101.localRows).toBe(
      Math.min(CACHE_101.token, config.sliding_window),
    );
    expect(CACHE_101.readRows).toBe(CACHE_101.localRows + CACHE_101.globalRows);
  });
  it("两层窗口分别来自历史，第四层读取第三层 G 而非自己的压缩器", () => {
    const recipe = cacheDecodeRecipe([]);
    for (const target of ["local101", "reuse101"])
      expect(
        recipe.links.some(
          (l) =>
            l.source === "history101" &&
            l.target === target &&
            l.tex.includes("SWA"),
        ),
      ).toBe(true);
    expect(
      recipe.links.find(
        (l) => l.source === "global101" && l.target === "reuse101",
      )?.tex,
    ).toContain("G_3");
    const html = renderToStaticMarkup(
      recipe.stages.find((s) => s.id === "reuse101")!.body,
    );
    expect(html).toContain("u_{4,101}");
    expect(html).toContain("I_{3,101}");
    expect(html).not.toContain("W_{4}^{KV,c}");
    expect(html).not.toContain("katex-error");
    const model = models.find((m) => m.id === "v41")!;
    expect(
      recipeFor(model, "cache", "prefill", 1).stages.map((s) => s.id),
    ).toEqual(recipeFor(model, "cache", "decode", 3).stages.map((s) => s.id));
  });
  it("旁注仅在第三、四层 Decode 使用固定例子", () => {
    expect(
      explainModule({
        kind: "projection-kv",
        layer: 3,
        phase: "decode",
      }).paragraphs.join(""),
    ).toContain("等第 102 个 token");
    expect(
      explainModule({
        kind: "projection-kv",
        layer: 4,
        phase: "decode",
      }).paragraphs.join(""),
    ).toContain("不生成 G₄");
    expect(
      explainModule({
        kind: "projection-kv",
        layer: 5,
        phase: "decode",
      }).paragraphs.join(""),
    ).not.toContain("固定例子 t=101");
  });
});
describe("SVG 导出边界", () => {
  it("包含负坐标人工折点，不依赖屏幕裁剪", () => {
    expect(
      unionBounds([
        { x: 10, y: 30, width: 100, height: 50 },
        { x: -80, y: -60, width: 30, height: 20 },
      ]),
    ).toEqual({ x: -80, y: -60, width: 190, height: 140 });
    expect(() => unionBounds([])).toThrow();
  });
  it("文件名可读且不包含路径分隔符", () => {
    expect(exportFileName("V41:第3层/decode")).toBe("V41-第3层-decode.svg");
    expect(exportFileName(" ")).toBe("diagram.svg");
  });
});
