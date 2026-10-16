import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CacheModeLedger,
  GlobalCacheHistory,
  cachePolicy,
} from "../src/components/CacheSemantics";
import { rawConfigs } from "../src/data/models";
import { explainModule } from "../src/components/ModuleInspector";

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
