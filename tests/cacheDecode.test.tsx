import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CACHE_STEPS,
  cacheDecodeRecipe,
  LayerCacheExample,
} from "../src/components/CacheDecodeExample";
import { exportFileName, unionBounds } from "../src/components/diagram-svg";
import { models, rawConfigs } from "../src/data/models";
import { recipeFor } from "../src/templates/recipes";
import { explainModule } from "../src/components/ModuleInspector";

describe("第 1201、1202 个 token 的缓存契约", () => {
  it("逐层主图直接展开同一例子：Full 评分，Reuse 读取同一组 ID", () => {
    for (const step of CACHE_STEPS) {
      const full = renderToStaticMarkup(
        <LayerCacheExample layer={3} phase="decode" part="index" />,
      );
      const reuse = renderToStaticMarkup(
        <LayerCacheExample layer={4} phase="decode" part="index" />,
      );
      expect(full).toContain(`data-selected-ids="${step.ids.join(",")}"`);
      expect(reuse).toContain(`data-reused-ids="${step.ids.join(",")}"`);
      expect(reuse).not.toContain("data-rank=");
    }
    for (const layer of [3, 4]) {
      for (const part of [
        "local",
        "global",
        "index",
        "selected",
        "concat",
      ] as const) {
        const html = renderToStaticMarkup(
          <LayerCacheExample layer={layer} phase="decode" part={part} />,
        );
        expect(html).toContain('data-layer-cache-token="1201"');
        expect(html).toContain('data-layer-cache-token="1202"');
        expect(html).not.toContain("katex-error");
        expect(html).not.toContain("÷");
        expect(
          renderToStaticMarkup(
            <LayerCacheExample layer={layer} phase="prefill" part={part} />,
          ),
        ).toBe("");
      }
    }
    expect(
      renderToStaticMarkup(
        <LayerCacheExample layer={9} phase="decode" part="index" />,
      ),
    ).toBe("");
  });
  it("窗口淘汰、分组完成和可见候选数量对齐官方配置", () => {
    const config = rawConfigs.v41.text_config;
    expect(config.kv_source_layer_ids).toContain(2);
    expect(config.kv_source_layer_ids).not.toContain(3);
    expect(config.index_source_layer_ids).not.toContain(3);
    expect(config.compress_ratios[2]).toBe(2);
    expect(config.sliding_window).toBe(128);
    for (const step of CACHE_STEPS) {
      expect(step.globalRows).toBe(
        Math.floor(step.token / config.compress_ratios[2]),
      );
      expect(step.globalBefore).toBe(600);
      expect(step.firstBefore).toBe(step.token - config.sliding_window);
      expect(step.firstAfter).toBe(step.evicted + 1);
      expect(step.token - step.firstAfter + 1).toBe(config.sliding_window);
      expect(step.readRows).toBe(step.localRows + 512);
      expect(step.ids).toHaveLength(config.index_topk);
      expect(new Set(step.ids).size).toBe(512);
      expect(step.ids).toEqual([...step.ids].sort((a, b) => a - b));
      const selected = step.scores.filter((row) => step.ids.includes(row.id));
      const rejected = step.scores.filter((row) => !step.ids.includes(row.id));
      expect(rejected).toHaveLength(step.globalRows - 512);
      expect(Math.min(...selected.map((row) => row.score))).toBeGreaterThan(
        Math.max(...rejected.map((row) => row.score)),
      );
      expect(step.ranked.map((row) => row.id).sort((a, b) => a - b)).toEqual(
        Array.from({ length: step.globalRows }, (_, i) => i + 1),
      );
    }
    expect(
      CACHE_STEPS.map((s) => [
        s.evicted,
        s.globalRows,
        s.appendGlobal,
        s.readRows,
      ]),
    ).toEqual([
      [1073, 600, false, 640],
      [1074, 601, true, 640],
    ]);
    expect(CACHE_STEPS[0].ranked[511]).toEqual({ id: 51, score: 0.89 });
    expect(CACHE_STEPS[0].ranked[512]).toEqual({ id: 278, score: 0.88 });
    expect(CACHE_STEPS[1].ranked[511]).toEqual({ id: 376, score: 0.9 });
    expect(CACHE_STEPS[1].ranked[512]).toEqual({ id: 311, score: 0.89 });
    expect(CACHE_STEPS[1].ids).not.toContain(601);
    expect(CACHE_STEPS[0].ids).not.toEqual(CACHE_STEPS[1].ids);
  });
  it("两层历史分别传递；跨时间仅传状态，同 token 跨层复用 G 与 ID", () => {
    const recipe = cacheDecodeRecipe([]);
    expect(recipe.stages).toHaveLength(9);
    for (const t of [1201, 1202]) {
      for (const [prefix, layer] of [
        ["local", 3],
        ["reuse", 4],
      ] as const)
        expect(
          recipe.links.find(
            (l) =>
              l.source === (t === 1201 ? "history1200" : prefix + "1201") &&
              l.target === prefix + t,
          )?.tex,
        ).toContain("U_" + layer);
      const shared = recipe.links.find(
        (l) => l.source === "global" + t && l.target === "reuse" + t,
      )!;
      expect(shared.tex).toContain("G_3");
      expect(shared.tex).toContain("I_{3," + t + "}");
      const html = renderToStaticMarkup(
        recipe.stages.find((s) => s.id === "reuse" + t)!.body,
      );
      expect(html).toContain("u_{4," + t + "}");
      expect(html).toContain("I_{3," + t + "}");
      expect(html).not.toContain("W_{4}^{KV,c}");
    }
    const pending = recipe.links.find(
      (l) => l.source === "global1201" && l.target === "global1202",
    )!;
    expect(pending.tex).toContain("v^c_{3,1201}");
    expect(pending.tex).toContain("a^{\\mathrm{gate}}_{3,1201}");
    expect(
      recipe.links.some(
        (l) => l.source === "reuse1201" && l.target === "local1202",
      ),
    ).toBe(false);
    expect(recipe.stages.map((s) => s.layoutLevel)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    const model = models.find((m) => m.id === "v41")!;
    expect(
      recipeFor(model, "cache", "prefill", 1).stages.map((s) => s.id),
    ).toEqual(recipeFor(model, "cache", "decode", 3).stages.map((s) => s.id));
  });
  it("追加发生在 1202，索引候选轴、权重与参数区分完整且公式可渲染", () => {
    const recipe = cacheDecodeRecipe([]);
    for (const stage of recipe.stages)
      expect(renderToStaticMarkup(stage.body)).not.toContain("katex-error");
    const odd = renderToStaticMarkup(
      recipe.stages.find((s) => s.id === "global1201")!.body,
    );
    const even = renderToStaticMarkup(
      recipe.stages.find((s) => s.id === "global1202")!.body,
    );
    expect(odd).not.toContain('data-new-row="true"');
    expect(even.match(/data-new-row="true"/g)).toHaveLength(2);
    expect(even).toContain("601\\times128");
    expect(even).toContain("601\\times512");
    expect(even).toContain('data-score-columns="601"');
    expect(even).toContain("data-stacked-sum");
  });
  it("选行到读取位置和第 4 层复用使用同一个集合", () => {
    const recipe = cacheDecodeRecipe([]);
    for (const step of CACHE_STEPS) {
      const render = (prefix: string) =>
        renderToStaticMarkup(
          recipe.stages.find((s) => s.id === prefix + step.token)!.body,
        );
      const selectedIds = `data-selected-ids="${step.ids.join(",")}"`;
      expect(render("global")).toContain(selectedIds);
      expect(render("reuse")).toContain(selectedIds);
      for (const prefix of ["attend", "reuse"]) {
        const html = render(prefix);
        expect(html).toContain(`结果行 129 · 原 G 行 ${step.ids[0]}`);
        expect(html).toContain(`结果行 640 · 原 G 行 ${step.ids[511]}`);
        expect(html).not.toContain("mathbf g_{3,601}");
      }
    }
  });
  it("第三、四层 Decode 旁注同步两步例子，其他层不套用", () => {
    const explain = (layer: number) =>
      explainModule({
        kind: "projection-kv",
        layer,
        phase: "decode",
      }).paragraphs.join("");
    expect(explain(3)).toContain("等第 1202 个 token");
    expect(explain(4)).toContain("不生成 G₄");
    expect(explain(4)).toContain("同一 token");
    expect(explain(5)).not.toContain("固定例子 t=1201");
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
