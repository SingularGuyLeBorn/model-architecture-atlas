import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  applySavedLayout,
  buildGraph,
  RmsNormProcess,
  IndexScoreProcess,
} from "../src/compositions/DeepSeekV41Layer";

describe("RMSNorm 的逐行结构与来源", () => {
  it("Indexer 展示的三个 Head 分别接入方形累加器", () => {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
      createElement(IndexScoreProcess, { layer: 15, kvSource: 15 }),
    );
    expect(root.querySelectorAll("[data-sum-input]")).toHaveLength(3);
    expect(root.querySelector("[data-sum-node]")).not.toBeNull();
    expect(root.querySelector("[data-sum-output]")).not.toBeNull();
    const products = [
      ...root.querySelectorAll("[data-index-head] [aria-label]"),
    ]
      .map((element) => element.getAttribute("aria-label")!)
      .filter((tex) => tex.startsWith("\\eta") && tex.includes("a^I"));
    expect(products).toHaveLength(9);
    expect(products.every((tex) => tex.includes("\\cdot a^I"))).toBe(true);
    expect(
      root.querySelector("[data-index-symbol-guide]")?.textContent,
    ).toContain("当前 token");
    expect(
      root
        .querySelector("[data-index-score-definition] [aria-label]")
        ?.getAttribute("aria-label"),
    ).toBe("s_{15,t,i}=\\sum_{h=1}^{32}\\eta_{15,t,h}\\cdot a^I_{h,t,i}");
  });
  it("横向紧凑排布仍保留平方、归约、缩放和输出矩阵", () => {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
      createElement(RmsNormProcess, {
        input: "K",
        output: "Y",
        dimension: 128,
        rowCount: "M",
        gamma: "g",
        label: "Indexer",
        horizontal: true,
      }),
    );
    expect(
      root.querySelector('[data-rmsnorm-layout="horizontal"]'),
    ).not.toBeNull();
    expect(root.querySelector("[data-rmsnorm-square]")).not.toBeNull();
    expect(root.querySelector("[data-rmsnorm-reduction]")).not.toBeNull();
    expect(root.querySelectorAll("[data-rmsnorm-product-arrows]")).toHaveLength(
      3,
    );
    expect(root.querySelector('[aria-label="Y"]')).not.toBeNull();
    expect(root.querySelectorAll("[data-rmsnorm-stage]")).toHaveLength(2);
    expect(root.querySelector("[data-rmsnorm-root-result]")).not.toBeNull();
    expect(root.querySelector("[data-rmsnorm-broadcast]")).not.toBeNull();
    expect(root.querySelectorAll("[data-sum-input]")).toHaveLength(3);
    expect(root.querySelector("[data-sum-node]")).not.toBeNull();
    expect(root.querySelector(".katex-error")).toBeNull();
  });
  it.each([128, 512, 1280, 5120])(
    "展开 %s 维的平方、均值、广播除法和独立缩放参数",
    (dimension) => {
      const root = document.createElement("div");
      root.innerHTML = renderToStaticMarkup(
        createElement(RmsNormProcess, {
          input: "\\widehat Q_{3}^r",
          output: "Q_{3}^r",
          dimension,
          rowCount: "N",
          gamma: "\\boldsymbol\\gamma_3^Q",
          label: "Query 低秩投影",
        }),
      );
      expect(root.querySelector(".katex-error")).toBeNull();
      expect(root.querySelectorAll("[data-rmsnorm-square] > div")).toHaveLength(
        3,
      );
      for (const cell of root.querySelectorAll("[data-rmsnorm-square] > div")) {
        expect(cell.querySelectorAll("[aria-label]")).toHaveLength(1);
        expect(
          cell.querySelector("[aria-label]")?.getAttribute("aria-label"),
        ).toMatch(/\^2$/);
      }
      expect(root.querySelectorAll("[data-rmsnorm-scale] > div")).toHaveLength(
        3,
      );
      const formulas = [...root.querySelectorAll("[aria-label]")].map((el) =>
        el.getAttribute("aria-label"),
      );
      const reduction = root.querySelector("[data-rmsnorm-reduction]")!;
      const operations = [...reduction.querySelectorAll("[aria-label]")].map(
        (el) => el.getAttribute("aria-label"),
      );
      expect(operations).toEqual([
        `\\frac{\\sum_{j=1}^{d}z_{s,j}^{2}}{d},\\quad d=${dimension}`,
        "=",
        "m_{s}",
        "\\downarrow",
        "+\\varepsilon\\;\\longrightarrow\\;\\sqrt{\\phantom{x}}",
        "r_{s}",
      ]);
      expect(formulas).toContain(`\\gamma_{${dimension}}`);
      expect(formulas).toContain(
        `\\boldsymbol\\gamma=\\boldsymbol\\gamma_3^Q\\in\\mathbb R^{${dimension}}`,
      );
      expect(
        root.querySelectorAll("[data-rmsnorm-operands] > div"),
      ).toHaveLength(6);
      expect(
        root.querySelectorAll("[data-rmsnorm-product-arrows]"),
      ).toHaveLength(3);
      expect(formulas).toContain(`y_{s,${dimension}}`);
      expect(root.querySelectorAll("[data-vector-elements]")).toHaveLength(6);
      expect(
        root.querySelector("[data-rmsnorm-example]")?.textContent,
      ).toContain("4 维算例");
      expect(
        formulas.some((tex) =>
          /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(tex ?? ""),
        ),
      ).toBe(false);
    },
  );

  it("Query 投影区分归一化前后，Indexer 读取归一化输出", () => {
    const graph = buildGraph(3);
    expect(
      graph.nodes.find((node) => node.id === "q-low-rank")?.data.tex,
    ).toContain("\\widehat Q");
    expect(
      graph.nodes.find((node) => node.id === "q-low-rank-up")?.data.tex,
    ).toBe("Q_{3}^{r}");
    expect(
      graph.edges.find((edge) => edge.id === "q-low-rank-indexer"),
    ).toMatchObject({ source: "q-rmsnorm", target: "indexer" });
  });

  it("三个投影分支使用可读宽度并保留独立通道，不重叠", () => {
    for (const layer of [1, 15, 29]) {
      const graph = buildGraph(layer);
      const branches = ["q", "kv", "compressor"]
        .map((id) => graph.nodes.find((node) => node.id === id))
        .filter((node) => node !== undefined);
      for (const node of branches)
        expect(Number(node.style?.width)).toBeGreaterThanOrEqual(800);
      for (let index = 1; index < branches.length; index++) {
        const previous = branches[index - 1],
          current = branches[index];
        expect(
          current.position.x -
            previous.position.x -
            Number(previous.style?.width),
        ).toBeGreaterThanOrEqual(100);
        expect(current.position.y).toBe(previous.position.y);
      }
    }
  });

  it("保存布局不能用旧高度压住新内容；新增子阶段重排父组并更新语义出线", () => {
    const graph = buildGraph(3);
    const saved = {
      version: 8,
      nodes: graph.nodes
        .filter((node) => node.id !== "q-rmsnorm")
        .map((node) => ({
          id: node.id,
          x: node.position.x + 10,
          y: node.position.y + 20,
          width: 360,
          height: 72,
        })),
      edges: graph.edges
        .filter((edge) => edge.id !== "heads-concat")
        .map((edge) =>
          edge.id === "q-low-rank-indexer"
            ? { ...edge, source: "q-low-rank" }
            : edge,
        ),
    };
    const restored = applySavedLayout(graph, saved);
    const norm = restored.nodes.find((node) => node.id === "norm1")!;
    expect(norm.style?.height).toBeUndefined();
    expect(norm.style?.minHeight).toBe(72);
    expect(norm.position.x).toBe(
      graph.nodes.find((node) => node.id === "norm1")!.position.x + 10,
    );
    for (const id of ["q", "q-low-rank-up", "q-wide-matrix", "q-row"]) {
      expect(restored.nodes.find((node) => node.id === id)).toEqual(
        graph.nodes.find((node) => node.id === id),
      );
    }
    expect(
      restored.edges.find((edge) => edge.id === "q-low-rank-indexer")?.source,
    ).toBe("q-rmsnorm");
    expect(restored.edges.some((edge) => edge.id === "heads-concat")).toBe(
      false,
    );
  });

  it.each(["prefill", "decode"] as const)(
    "%s 下内容增高同时推动父框、内部第二次投影和下游",
    (phase) => {
      const before = buildGraph(
        3,
        new Map([
          ["norm1", 644],
          ["q-rmsnorm", 620],
          ["norm2", 644],
        ]),
        phase,
      );
      const after = buildGraph(
        3,
        new Map([
          ["norm1", 744],
          ["q-rmsnorm", 820],
          ["norm2", 794],
        ]),
        phase,
      );
      const old = (id: string) => before.nodes.find((node) => node.id === id)!;
      const next = (id: string) => after.nodes.find((node) => node.id === id)!;
      expect(next("q").position.y - old("q").position.y).toBe(100);
      expect(
        Number(next("q").style?.height) - Number(old("q").style?.height),
      ).toBe(200);
      expect(
        next("q-wide-matrix").position.y - old("q-wide-matrix").position.y,
      ).toBe(200);
      expect(next("q-row").position.y - old("q-row").position.y).toBe(300);
      expect(
        next("q-wide-matrix").position.y +
          Number(next("q-wide-matrix").style?.height),
      ).toBeLessThan(Number(next("q").style?.height));
      expect(next("moe-input").position.y - old("moe-input").position.y).toBe(
        450,
      );
      for (const id of ["norm1", "norm2", "q-rmsnorm"])
        expect(next(id).style?.height).toBeUndefined();
    },
  );
});
