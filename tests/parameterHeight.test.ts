import { describe, expect, it } from "vitest";
import {
  buildGraph,
  measurementsForGraph,
} from "../src/compositions/DeepSeekV41Layer";

describe("参数列名按内容定高", () => {
  it.each(["prefill", "decode"] as const)(
    "%s 的 Query 参数外框参与实测并居中",
    (phase) => {
      const graph = buildGraph(15, new Map(), phase);
      const measured = graph.nodes.map((node) =>
        node.data.columnVectors
          ? { ...node, measured: { width: 230, height: 76 } }
          : node,
      );
      const heights = measurementsForGraph(graph, measured)!;
      const aligned = buildGraph(15, heights, phase);
      for (const [weightId, inputId] of [
        ["q-wdown", "q-x"],
        ["q-wup", "q-low-rank-up"],
      ]) {
        const weight = aligned.nodes.find((node) => node.id === weightId)!;
        expect(heights.get(weightId)).toBe(76);
        expect(weight.style?.height).toBeUndefined();
        expect(weight.style?.minHeight).toBe("max-content");
        const before = graph.nodes.find((node) => node.id === weightId)!;
        expect(weight.position.y - before.position.y, inputId).toBe(-38);
        const input = aligned.nodes.find((node) => node.id === inputId)!;
        expect(weight.position.y + 38).toBe(
          input.position.y + Number(input.style?.height) / 2,
        );
      }
    },
  );
});
