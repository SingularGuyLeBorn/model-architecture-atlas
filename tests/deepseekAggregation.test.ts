import { describe, expect, it } from "vitest";
import {
  applySavedLayout,
  buildGraph,
} from "../src/compositions/DeepSeekV41Layer";

function saveGraph(graph: ReturnType<typeof buildGraph>) {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      width: Number(node.style?.width),
      height:
        typeof node.style?.height === "number" ? node.style.height : undefined,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      data: edge.data,
    })),
  };
}

describe("MoE 各路独立加权后汇入求和", () => {
  it("每个输出、权重、乘法、结果都是独立节点，四条可见支路各自进入求和器", () => {
    const graph = buildGraph(3);
    expect(graph.nodes.some((node) => node.id === "aggregate")).toBe(false);
    const incomingSum = graph.edges.filter((edge) => edge.target === "moe-sum");
    expect(incomingSum).toHaveLength(4);
    expect(new Set(incomingSum.map((edge) => edge.targetHandle)).size).toBe(4);
    for (const key of ["shared", "7", "31", "351"]) {
      for (const stage of ["output", "weight", "scale", "weighted"]) {
        const node = graph.nodes.find(
          (node) => node.id === `expert-${stage}-${key}`,
        );
        expect(node).toBeDefined();
        expect(node?.parentId).toBeUndefined();
      }
      const operands = graph.edges.filter(
        (edge) => edge.target === `expert-scale-${key}`,
      );
      expect(operands.map((edge) => edge.source).sort()).toEqual(
        [`expert-output-${key}`, `expert-weight-${key}`].sort(),
      );
      expect(
        incomingSum.some((edge) => edge.source === `expert-weighted-${key}`),
      ).toBe(true);
    }
    expect(
      graph.edges.some(
        (edge) =>
          edge.source.includes("ellipsis") || edge.target.includes("ellipsis"),
      ),
    ).toBe(false);
  });

  it("实测内容变高时，乘法、加权结果及求和阶段依次下移", () => {
    const baseline = buildGraph(3);
    const expanded = buildGraph(
      3,
      new Map([
        ["expert-output-31", 400],
        ["expert-weighted-351", 200],
      ]),
    );
    const y = (graph: typeof baseline, id: string) =>
      graph.nodes.find((node) => node.id === id)!.position.y;
    expect(
      y(expanded, "expert-scale-shared") - y(baseline, "expert-scale-shared"),
    ).toBe(160);
    expect(y(expanded, "moe-sum") - y(baseline, "moe-sum")).toBe(260);
  });

  it("已有布局补入新增支路，保留上游拖动和用户删线，仅重排新阶段之后的位置", () => {
    const graph = buildGraph(29);
    const saved = saveGraph(graph);
    saved.nodes = saved.nodes.filter(
      (node) =>
        !node.id.startsWith("expert-") &&
        node.id !== "weighted-expert-ellipsis",
    );
    saved.edges = saved.edges.filter(
      (edge) => !edge.id.startsWith("expert-") && edge.id !== "norm-kv",
    );
    saved.nodes.find((node) => node.id === "q")!.x += 37;
    saved.nodes.find((node) => node.id === "moe-sum")!.y = 5;
    const restored = applySavedLayout(graph, saved);
    expect(restored.nodes.find((node) => node.id === "q")!.position.x).toBe(
      graph.nodes.find((node) => node.id === "q")!.position.x + 37,
    );
    expect(
      restored.nodes.find((node) => node.id === "moe-sum")!.position,
    ).toEqual(graph.nodes.find((node) => node.id === "moe-sum")!.position);
    expect(
      restored.edges.filter((edge) => edge.target === "moe-sum"),
    ).toHaveLength(4);
    expect(restored.edges.some((edge) => edge.id === "norm-kv")).toBe(false);
  });
});
