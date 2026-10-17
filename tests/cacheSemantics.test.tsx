import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CacheModeLedger,
  GlobalCacheHistory,
  cachePolicy,
  cacheSharingSegments,
  cacheSourceSummary,
  CacheSharingMap,
} from "../src/components/CacheSemantics";
import { rawConfigs } from "../src/data/models";
import { explainModule } from "../src/components/ModuleInspector";
import { buildGraph } from "../src/compositions/DeepSeekV41Layer";

it("完整 40 层区间区分 G、索引来源和全部 Reuse 消费者", () => {
  expect(cacheSharingSegments()).toEqual([
    { start: 3, end: 8, kv: 3, index: 3 },
    { start: 9, end: 14, kv: 9, index: 9 },
    { start: 15, end: 20, kv: 15, index: 15 },
    { start: 21, end: 24, kv: 21, index: 21 },
    { start: 25, end: 28, kv: 21, index: 25 },
    { start: 29, end: 32, kv: 21, index: 29 },
    { start: 33, end: 36, kv: 21, index: 33 },
    { start: 37, end: 40, kv: 21, index: 37 },
  ]);
  for (let layer = 1; layer <= 40; layer++) {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(<CacheSharingMap layer={layer} />);
    expect(root.querySelectorAll("[data-sharing-g]")).toHaveLength(4);
    expect(root.querySelectorAll("[data-sharing-index]")).toHaveLength(8);
    expect(root.querySelectorAll("[data-sharing-consumer]")).toHaveLength(30);
    expect(root.querySelectorAll("[data-active-sharing]")).toHaveLength(
      layer > 2 ? 1 : 0,
    );
    expect(root.querySelector(".katex-error")).toBeNull();
    expect(root.querySelector("[data-sharing-current]")?.textContent).toBe(
      cacheSourceSummary(layer),
    );
    const graph = buildGraph(layer);
    expect(graph.nodes.some((n) => n.id === "cache-sharing")).toBe(false);
    expect(graph.nodes.find((n) => n.id === "compressor")?.data.mode).toBe(
      layer < 3 ? undefined : cachePolicy(layer).mode.toLowerCase(),
    );
    expect(
      explainModule({ kind: "cache-sharing", layer }).paragraphs.join(""),
    ).toContain(cacheSourceSummary(layer));
  }
});

it("逐层图只保留实际计算与复用入口，不被独立共享总览撑高", () => {
  for (const layer of [2, 3, 15, 26]) {
    const graph = buildGraph(layer);
    expect(buildGraph(layer, new Map([["cache-sharing", 3000]]))).toEqual(
      graph,
    );
    expect(graph.nodes.some((n) => n.id === "cache-sharing")).toBe(false);
    const hasGlobal = layer > 2;
    expect(graph.edges.some((e) => e.id === "norm-compressor")).toBe(
      cachePolicy(layer).mode === "Full",
    );
    expect(graph.edges.some((e) => e.id === "norm-index-weights")).toBe(
      ["Full", "Reindex"].includes(cachePolicy(layer).mode),
    );
    expect(graph.edges.some((e) => e.id === "swa-merge")).toBe(true);
    expect(graph.edges.some((e) => e.id === "merge-heads")).toBe(true);
    if (hasGlobal) {
      expect(
        graph.edges.find((e) => e.id === "indexer-matrix")?.data?.labelTex,
      ).toBe(`G_{${layer}}`);
      expect(
        graph.edges.find((e) => e.id === "indexer-select")?.data?.labelTex,
      ).toBe(`I_{${layer},t}`);
    }
  }
});

it("缓存所有者和索引所有者分别跟随配置，Reindex 不替换 G 来源", () => {
  const config = rawConfigs.v41.text_config;
  for (let layer = 1; layer <= 40; layer++) {
    const p = cachePolicy(layer);
    const last = (ids: number[]) => ids.filter((id) => id < layer).at(-1);
    expect(p.kv).toBe(
      last(config.kv_source_layer_ids) === undefined
        ? null
        : last(config.kv_source_layer_ids)! + 1,
    );
    expect(p.index).toBe(
      last(config.index_source_layer_ids) === undefined
        ? null
        : last(config.index_source_layer_ids)! + 1,
    );
    expect(p.mode === "Full").toBe(
      config.kv_source_layer_ids.includes(layer - 1),
    );
  }
  expect(cachePolicy(26)).toEqual({ mode: "Reuse", kv: 21, index: 25 });
  expect(cachePolicy(25)).toEqual({ mode: "Reindex", kv: 21, index: 25 });
  expect(cachePolicy(1)).toEqual({ mode: "SWA-only", kv: null, index: null });
});

it("模式表突出当前模式，旁注给出当前来源，Decode 图保留历史输入", () => {
  for (const layer of [3, 4, 21, 25, 26, 40]) {
    const html = renderToStaticMarkup(<CacheModeLedger layer={layer} />);
    expect(html.match(/data-current-mode="true"/g)).toHaveLength(1);
    expect(html).not.toContain("katex-error");
    const note = explainModule({ kind: "compressor", layer, phase: "decode" });
    expect(note.title).toContain(cachePolicy(layer).mode);
    expect(note.paragraphs.join("")).toContain(
      `$G_${"{"}${cachePolicy(layer).kv}}$`,
    );
    expect(note.paragraphs.join("")).toContain("不重算全部历史");
  }
  for (const [layer, ratio] of [
    [3, 2],
    [21, 1],
  ]) {
    const html = renderToStaticMarkup(
      <GlobalCacheHistory layer={layer} ratio={ratio} />,
    );
    expect(html).toContain(`G_{${layer}}^{&lt;t}`);
    expect(html).toContain("M_{old}");
    expect(html).not.toContain("katex-error");
    expect(html).toContain(
      ratio === 2 ? "仅暂存，不追加" : "每个新 token 生成一行",
    );
  }
});
