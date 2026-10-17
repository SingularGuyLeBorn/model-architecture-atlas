import { describe, expect, it } from "vitest";
import {
  architectureConfigs,
  architectureProfile,
  layerArchitecture,
  tokenWindow,
  qsaSelection,
  kvHeadForQuery,
} from "../src/data/architecture-profiles";

describe("新模型事实边界与逐层配置", () => {
  it("六个目标模型均有固定官方配置；不合并 V3、R1、V3.1、V3.2", () => {
    for (const id of Object.keys(
      architectureConfigs,
    ) as (keyof typeof architectureConfigs)[]) {
      const p = architectureProfile(id);
      expect(p.source.revision).toMatch(/^[0-9a-f]{40}$/);
      expect(p.source.url).toContain(p.source.revision);
      expect(() => layerArchitecture(id, 0)).toThrow();
      expect(() => layerArchitecture(id, p.layers + 1)).toThrow();
    }
    expect(layerArchitecture("v32", 4).attention).toBe("dsa");
    for (const id of ["v3", "r1", "v31"] as const) {
      expect(layerArchitecture(id, 4).attention).toBe("mla");
      expect(layerArchitecture(id, 3).ffn).toBe("dense");
      expect(layerArchitecture(id, 4).ffn).toBe("moe");
    }
  });
  it("MiMo V2.5 按实际数组分层，非 Pro 的 70 层", () => {
    expect(architectureProfile("mimo25")).toMatchObject({
      layers: 48,
      hidden: 4096,
      residualBranches: 1,
    });
    const layers = Array.from({ length: 48 }, (_, i) =>
      layerArchitecture("mimo25", i + 1),
    );
    expect(
      layers.filter((l) => l.attention === "gqa-full").map((l) => l.layer),
    ).toEqual([1, 6, 12, 18, 24, 30, 36, 42, 48]);
    expect(layers[0]).toMatchObject({
      kvHeads: 4,
      sink: false,
      ffn: "dense",
      sharedExperts: 0,
      ropeDim: 64,
    });
    expect(layers[1]).toMatchObject({
      kvHeads: 8,
      sink: true,
      ffn: "moe",
      sharedExperts: 0,
      ropeDim: 64,
    });
    expect(kvHeadForQuery(layers[0], 17)).toBe(2);
    expect(kvHeadForQuery(layers[1], 9)).toBe(2);
    expect(tokenWindow("mimo25", 2, 129)).toEqual({
      first: 2,
      last: 129,
      count: 128,
    });
    expect(tokenWindow("mimo25", 1, 129)).toEqual({
      first: 1,
      last: 129,
      count: 129,
    });
    expect(tokenWindow("mimo25", 2, 1).count).toBe(1);
  });
  it("Qwen 的 GDN/QSA、门控残差、PLE 与 MoE 各有独立事实", () => {
    expect(architectureProfile("qwen38")).toMatchObject({
      layers: 48,
      hidden: 2560,
      activeExperts: 10,
      routedExperts: 512,
      residualBranches: 4,
    });
    for (let layer = 1; layer <= 48; layer++) {
      const a = layerArchitecture("qwen38", layer);
      expect(a.attention).toBe(layer % 4 === 0 ? "qsa" : "gdn");
      expect(a.ngram).toBe(layer === 2);
      expect(a.sharedExperts).toBe(1);
      expect(a.sink).toBe(false);
    }
    expect(layerArchitecture("qwen38", 1)).toMatchObject({
      queryHeads: 16,
      kvHeads: 16,
      valueHeads: 48,
      cacheKind: "recurrent",
      ropeDim: 0,
    });
    expect(layerArchitecture("qwen38", 4)).toMatchObject({
      queryHeads: 24,
      kvHeads: 2,
      ropeDim: 64,
    });
    expect(() => kvHeadForQuery(layerArchitecture("qwen38", 1), 1)).toThrow();
    expect(() => tokenWindow("qwen38", 1, 128)).toThrow();
    expect(kvHeadForQuery(layerArchitecture("qwen38", 4), 13)).toBe(2);
  });
  it("QSA 索引预算按完整块，尾部不丢也不提前访问未来 token", () => {
    expect(qsaSelection(3, []).visible).toEqual([1, 2, 3]);
    expect(qsaSelection(4, [1]).visible).toEqual([1, 2, 3, 4]);
    expect(qsaSelection(9, [2, 1])).toMatchObject({
      rows: [5, 6, 7, 8, 1, 2, 3, 4],
      tail: [9],
    });
    const blocks = Array.from({ length: 512 }, (_, i) => i + 2);
    const chosen = qsaSelection(2055, blocks);
    expect(chosen.rows).toHaveLength(2048);
    expect(chosen.tail).toEqual([2053, 2054, 2055]);
    expect(chosen.visible).not.toContain(1);
    expect(Math.max(...chosen.visible)).toBe(2055);
    expect(() => qsaSelection(8, [1, 1])).toThrow();
    expect(() => qsaSelection(8, [1, 3])).toThrow();
    expect(() => qsaSelection(8, [1])).toThrow();
  });
});
