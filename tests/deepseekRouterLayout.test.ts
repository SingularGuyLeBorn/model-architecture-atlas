import { describe, expect, it } from "vitest";
import { buildGraph } from "../src/compositions/DeepSeekV41Layer";

describe("Router 得分矩阵独立紧凑布局", () => {
  it.each(["prefill", "decode"] as const)(
    "%s 不再借用专家区宽度，保留三个已展开专家的独立连线",
    (phase) => {
      const graph = buildGraph(29, new Map(), phase);
      const scores = graph.nodes.find((node) => node.id === "scores")!;
      const router = graph.nodes.find((node) => node.id === "router")!;
      const experts = graph.nodes.find((node) => node.id === "experts")!;
      expect(Number(scores.style!.width)).toBeLessThan(
        Number(experts.style!.width) / 2,
      );
      expect(scores.position.x + Number(scores.style!.width) / 2).toBe(
        router.position.x + Number(router.style!.width) / 2,
      );
      expect(scores.style!.height).toBeUndefined();
      const edges = graph.edges.filter((edge) => edge.source === "scores");
      expect(
        edges.map((edge) => [edge.sourceHandle, edge.targetHandle]),
      ).toEqual([
        ["score-7", "expert-7"],
        ["score-31", "expert-31"],
        ["score-351", "expert-351"],
      ]);
    },
  );

  it("得分矩阵实测高度改变，专家与后续求和跟随移动", () => {
    const a = buildGraph(3, new Map([["scores", 280]]));
    const b = buildGraph(3, new Map([["scores", 180]]));
    for (const id of ["experts", "expert-output-shared", "moe-sum", "output"]) {
      expect(
        b.nodes.find((node) => node.id === id)!.position.y -
          a.nodes.find((node) => node.id === id)!.position.y,
      ).toBe(-100);
    }
    expect(b.nodes.find((node) => node.id === "router")!.position).toEqual(
      a.nodes.find((node) => node.id === "router")!.position,
    );
  });
});
