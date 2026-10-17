import { describe, expect, it } from "vitest";
import {
  buildGraph,
  executionAxis,
} from "../src/compositions/DeepSeekV41Layer";

describe("Token 来源与 Prefill / Decode 粒度", () => {
  it("逐层取行实例按实测高度推动下游，不覆盖拼接模块", () => {
    for (const layer of [3, 4]) {
      const graph = buildGraph(
        layer,
        new Map([["global-select", 2600]]),
        "decode",
      );
      const selected = graph.nodes.find((node) => node.id === "global-select")!;
      const merge = graph.nodes.find((node) => node.id === "kv-merge")!;
      expect(selected.style?.height).toBeUndefined();
      expect(merge.position.y).toBeGreaterThan(selected.position.y + 2600);
    }
  });
  it("Prefill 保留整个序列，Decode 只算全局位置 t 的一行", () => {
    expect(executionAxis("prefill")).toEqual({
      token: "t",
      count: "N",
      rows: ["1", "2", "\\vdots", "t", "\\vdots", "N"],
    });
    expect(executionAxis("decode")).toEqual({
      token: "t",
      count: "1",
      rows: ["t"],
    });
    expect(executionAxis("decode", 2)).toEqual({
      token: "129",
      count: "1",
      rows: ["129"],
    });
    expect(executionAxis("prefill", 2)).toEqual(executionAxis("prefill"));
    for (const phase of ["prefill", "decode"] as const) {
      const graph = buildGraph(1, new Map(), phase);
      const matrix = graph.nodes.find((node) => node.id === "q-wide-matrix")!;
      expect(matrix.data.matrixRows).toHaveLength(phase === "prefill" ? 6 : 1);
      expect(matrix.data.matrixRows![matrix.data.matrixSelectedRow!]).toContain(
        "1,t",
      );
      expect(matrix.data.tex).toContain(`${executionAxis(phase).count}\\times`);
      expect(graph.nodes.every((node) => node.data.phase === phase)).toBe(true);
    }
  });

  it("Tokenizer 经 Embedding 进入首层；后续层明确经过前层输出", () => {
    for (const layer of [1, 3, 29]) {
      const graph = buildGraph(layer);
      const has = (source: string, target: string) =>
        graph.edges.some(
          (edge) => edge.source === source && edge.target === target,
        );
      expect(has("tokenizer", "embedding")).toBe(true);
      expect(has("embedding", "hc-expand")).toBe(true);
      expect(has("hc-expand", layer === 1 ? "input" : "first-input")).toBe(
        true,
      );
      if (layer > 1) {
        expect(
          graph.nodes.find((node) => node.id === "first-input")!.data.layer,
        ).toBe(1);
        expect(has("first-input", "prior-layers")).toBe(true);
        expect(has("prior-layers", "input")).toBe(true);
        expect(has("embedding", "input")).toBe(false);
      }
    }
  });

  it("完整矩阵、取行、Head 分块是可追踪的阶段，各 Head 有独立入口", () => {
    const graph = buildGraph(3);
    expect(
      graph.edges.find((edge) => edge.id === "query-matrix-row"),
    ).toMatchObject({ source: "q-wide-matrix", target: "q-row" });
    expect(
      graph.edges.find((edge) => edge.id === "query-row-split"),
    ).toMatchObject({ source: "q-row", target: "q-head-slice" });
    expect(
      graph.nodes.find((node) => node.id === "q-head-slice")!.parentId,
    ).toBeUndefined();
    for (const h of [1, 2, 64]) {
      expect(
        graph.nodes.find((node) => node.id === `q-head-${h}`)!.parentId,
      ).toBe("q-head-slice");
      expect(
        graph.edges.find((edge) => edge.id === `query-head-${h}`),
      ).toMatchObject({
        source: `q-head-${h}`,
        target: "heads",
        targetHandle: `query-${h}`,
      });
    }
    expect(graph.edges.some((edge) => edge.id === "q-heads")).toBe(false);
  });

  it("输入链内容实测增高后，后续阶段一起移动", () => {
    const baseline = buildGraph(3);
    const expanded = buildGraph(
      3,
      new Map([
        ["tokenizer", 340],
        ["embedding", 360],
      ]),
    );
    for (const id of [
      "first-input",
      "prior-layers",
      "input",
      "q",
      "q-row",
      "q-head-slice",
      "heads",
    ]) {
      expect(
        expanded.nodes.find((n) => n.id === id)!.position.y -
          baseline.nodes.find((n) => n.id === id)!.position.y,
      ).toBe(180);
    }
  });
});
