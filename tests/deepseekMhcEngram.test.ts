import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  applySavedLayout,
  buildGraph,
  EngramInject,
  EngramLookup,
  hasEngram,
  IndexScoreProcess,
  MhcMix,
  MhcPost,
  MhcPre,
  RmsNormProcess,
} from "../src/compositions/DeepSeekV41Layer";

function render(element: ReactElement) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(element);
  expect(root.querySelector(".katex-error")).toBeNull();
  const formulas = [...root.querySelectorAll("[aria-label]")].map(
    (el) => el.getAttribute("aria-label") ?? "",
  );
  expect(
    formulas.some((tex) =>
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(tex),
    ),
  ).toBe(false);
  return { root, formulas };
}

describe("mHC 与 Engram 的真实主路径", () => {
  it("40 层均包含两次 mHC 汇合/回写，Engram 只位于 2、15 层且在 Attention 前", () => {
    for (let layer = 1; layer <= 40; layer++) {
      const graph = buildGraph(layer);
      const has = (source: string, target: string) =>
        graph.edges.some(
          (edge) => edge.source === source && edge.target === target,
        );
      expect(hasEngram(layer)).toBe(layer === 2 || layer === 15);
      expect(graph.nodes.some((node) => node.id === "engram-inject")).toBe(
        hasEngram(layer),
      );
      expect(has("hc-pre-a", "norm1")).toBe(true);
      expect(has("hc-pre-f", "norm2")).toBe(true);
      expect(has("hc-mix-a", "hc-pre-f")).toBe(true);
      expect(has("hc-mix-a", "add1")).toBe(true);
      expect(has("hc-mix-f", "add2")).toBe(true);
      expect(has("hc-mix-f", "output")).toBe(true);
      expect(has("input", "norm1")).toBe(false);
      expect(has("state1", "norm2")).toBe(false);
      if (hasEngram(layer)) {
        expect(has("tokenizer", "engram-lookup")).toBe(true);
        expect(has("engram-lookup", "engram-inject")).toBe(true);
        expect(has("input", "engram-inject")).toBe(true);
        expect(has("engram-inject", "hc-pre-a")).toBe(true);
        expect(has("engram-inject", "add1")).toBe(true);
      }
    }
  });

  it("四路混合完整展示 4×4 矩阵、20 轮归一化，以及向下一子层传递的 p", () => {
    const { root, formulas } = render(
      createElement(MhcMix, { layer: 15, sublayer: "A" }),
    );
    expect(
      formulas.filter((tex) => /^c_\{[1-4][1-4]\}$/.test(tex)),
    ).toHaveLength(16);
    expect(root.textContent).toContain("共 20 轮");
    expect(root.textContent).toContain("供本层 FFN 汇合使用");
    expect(formulas).toContain("20480\\times24");
    expect(
      root.querySelector('[data-rmsnorm-dimension="20480"]'),
    ).not.toBeNull();
    expect(
      [...root.querySelectorAll("[data-mhc-coefficient-output]")].map((e) =>
        e.getAttribute("data-mhc-coefficient-output"),
      ),
    ).toEqual(["p", "q", "C"]);
    for (const output of root.querySelectorAll("[data-mhc-coefficient-output]"))
      expect(output.textContent).toContain("输出");
  });

  it("mHC 的联合均方根没有虚构 gamma；Engram 的两侧则分别有 gamma", () => {
    const { root } = render(
      createElement(RmsNormProcess, {
        input: "\\mathbf f_t",
        output: "\\bar{\\mathbf f}_t",
        dimension: 20480,
        rowCount: "1",
        label: "mHC",
      }),
    );
    expect(root.querySelectorAll("[data-rmsnorm-product-arrows]")).toHaveLength(
      0,
    );
    const injected = render(
      createElement(EngramInject, { layer: 15, phase: "decode" }),
    );
    expect(
      injected.root.querySelectorAll('[data-rmsnorm-dimension="5120"]'),
    ).toHaveLength(2);
    expect(injected.root.querySelectorAll("[data-engram-copy]")).toHaveLength(
      4,
    );
    expect(
      injected.root.querySelectorAll(
        '[data-engram-copy] [data-merge-arrows="2"]',
      ),
    ).toHaveLength(8);
    expect(
      injected.root.querySelectorAll(
        "[data-engram-value-product] [data-feature-vector]",
      ),
    ).toHaveLength(4);
    expect(
      (injected.root.querySelector("[data-four-stream-row]") as HTMLElement)
        .style.gridTemplateColumns,
    ).toBe("repeat(4,minmax(0,1fr))");
    expect(injected.formulas).toContain(
      "s_c=\\operatorname{copysign}(\\sqrt{a_c},d_c)",
    );
    expect(injected.formulas).toContain("a_c=\\max(|d_c|,10^{-6})");
  });

  it.each([2, 15])(
    "Layer %s 的 2/3/4-gram 与 24 次查表具有正确的维度",
    (layer) => {
      const { root, formulas } = render(
        createElement(EngramLookup, { layer, phase: "decode" }),
      );
      expect(root.querySelectorAll("[data-ngram]")).toHaveLength(3);
      expect(formulas).toContain("6144\\times25600");
      expect(formulas).toContain(
        `${layer === 2 ? 384006168 : 384016682}\\times256`,
      );
      expect(formulas).toContain(
        String((layer === 2 ? 384006168 : 384016682) - 1),
      );
      expect(root.textContent).toContain("已缓存的至多 3 个历史 ID");
    },
  );

  it("首层 one-hot 汇合和四路独立回写都有结构", () => {
    const pre = render(
      createElement(MhcPre, { layer: 1, sublayer: "A", count: "N" }),
    );
    expect(pre.formulas).toContain("\\mathbf p=(1,0,0,0)");
    expect(pre.root.querySelector('[data-merge-arrows="4"]')).not.toBeNull();
    const post = render(createElement(MhcPost, { layer: 15, sublayer: "F" }));
    expect(post.root.querySelectorAll("[data-mhc-output-copy]")).toHaveLength(
      4,
    );
    expect(
      post.root.querySelectorAll(
        '[data-mhc-output-copy] [data-merge-arrows="2"]',
      ),
    ).toHaveLength(4);
  });

  it("系数长边使用主流程以外的列，避免穿过宽 Attention 与专家节点", () => {
    const graph = buildGraph(15);
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const right = (id: string) =>
      nodes.get(id)!.position.x + Number(nodes.get(id)!.style!.width);
    for (const id of ["hc-mix-a", "hc-mix-f"]) {
      expect(nodes.get(id)!.position.x).toBeGreaterThan(
        Math.max(right("heads"), right("experts")),
      );
    }
  });

  it("q 与 C 分别进入回写数据框，四个目标路同排，C 的列对应目标路", () => {
    const graph = buildGraph(15);
    for (const sub of ["a", "f"]) {
      expect(graph.edges.find((e) => e.id === `mix-${sub}-post`)).toMatchObject(
        { sourceHandle: "post", targetHandle: "post" },
      );
      expect(graph.edges.find((e) => e.id === `mix-${sub}-comb`)).toMatchObject(
        { sourceHandle: "comb", targetHandle: "comb" },
      );
    }
    const { root } = render(
      createElement(MhcPost, { layer: 15, sublayer: "A" }),
    );
    expect(root.querySelectorAll("[data-mhc-residual-product]")).toHaveLength(
      16,
    );
    expect(root.querySelectorAll("[data-mhc-post-product]")).toHaveLength(4);
    for (const group of root.querySelectorAll<HTMLElement>(
      "[data-four-stream-row]",
    ))
      expect(group.style.gridTemplateColumns).toBe("repeat(4,minmax(0,1fr))");
    for (let target = 1; target <= 4; target++)
      for (let source = 1; source <= 4; source++) {
        const product = root.querySelector(
          `[data-mhc-residual-product="${target}-${source}"]`,
        )!;
        expect(
          [...product.querySelectorAll("[aria-label]")].map((e) =>
            e.getAttribute("aria-label"),
          ),
        ).toContain(`c_{${source}${target}}`);
      }
    expect(root.querySelector("[data-mhc-q-input]")).not.toBeNull();
    expect(root.querySelector("[data-mhc-comb-input]")).not.toBeNull();
    const input = root.querySelector("[data-mhc-sublayer-input]")!;
    expect(input.querySelector('[aria-label="O_{15}"]')).not.toBeNull();
    expect(input.textContent).toContain("展开第 t 行");
    expect((input as HTMLElement).style.maxWidth).toBe("420px");
    expect(
      (root.querySelector("[data-mhc-q-input]") as HTMLElement).style.maxWidth,
    ).toBe("420px");
    expect(
      input.querySelectorAll("[data-vector-elements]").length,
    ).toBeGreaterThan(3);
  });

  it.each(["A", "F"] as const)(
    "%s 回写保留 C 的二维矩阵，每路的残差混合与输出广播左右并行汇入加法",
    (sublayer) => {
      const { root, formulas } = render(
        createElement(MhcPost, { layer: 15, sublayer }),
      );
      const matrix = root.querySelector<HTMLElement>("[data-mhc-comb-matrix]")!;
      expect(matrix.style.gridTemplateColumns).toBe(
        "42px repeat(4,minmax(0,1fr))",
      );
      expect(
        [...matrix.querySelectorAll("[aria-label]")].map((e) =>
          e.getAttribute("aria-label"),
        ),
      ).toEqual(
        [1, 2, 3, 4].flatMap((k) => [1, 2, 3, 4].map((j) => `c_{${k}${j}}`)),
      );
      for (const group of root.querySelectorAll<HTMLElement>(
        "[data-mhc-output-copy]",
      )) {
        const branches = group.querySelector<HTMLElement>(
          "[data-mhc-parallel-branches]",
        )!;
        expect(branches.style.gridTemplateColumns).toBe(
          "repeat(2,minmax(0,1fr))",
        );
        expect(branches.children[0].hasAttribute("data-mhc-residual-mix")).toBe(
          true,
        );
        expect(branches.children[1].hasAttribute("data-mhc-broadcast")).toBe(
          true,
        );
        expect(
          branches.children[0].querySelectorAll("[data-mhc-residual-product]"),
        ).toHaveLength(4);
        expect(
          branches.children[1].querySelectorAll("[data-mhc-post-product]"),
        ).toHaveLength(1);
        expect(
          branches.nextElementSibling?.hasAttribute("data-mhc-final-sum"),
        ).toBe(true);
        expect(
          branches.children[0].lastElementChild?.hasAttribute(
            "data-mhc-residual-result",
          ),
        ).toBe(true);
        expect(
          branches.children[1].lastElementChild?.hasAttribute(
            "data-mhc-broadcast-result",
          ),
        ).toBe(true);
      }
      for (const [productSelector, inputSelector] of [
        ["[data-mhc-residual-product]", "[data-mhc-comb-input]"],
        ["[data-mhc-post-product]", "[data-mhc-q-input]"],
      ]) {
        for (const product of root.querySelectorAll(productSelector))
          expect(
            (product.children[0] as HTMLElement).style.backgroundColor,
          ).toBe(
            (root.querySelector(inputSelector) as HTMLElement).style
              .backgroundColor,
          );
      }
      expect(root.querySelector("[data-mhc-q-input]")?.textContent).toContain(
        "来自本子层 mHC 系数分支",
      );
      expect(
        root.querySelector("[data-mhc-sublayer-input]")?.textContent,
      ).toContain(sublayer === "A" ? "Attention 输出投影" : "FFN 专家加权汇总");
      expect(formulas).toContain("\\mathbf r=(2.5,2.5,2.5,2.5)");
      expect(formulas).toContain("\\mathbf q\\,o=(1,2,3,4)");
    },
  );

  it.each(["A", "F"] as const)(
    "%s 的各项实际接入圆形求和器，短支路展开逐元素广播而非长空箭头",
    (sublayer) => {
      const { root } = render(createElement(MhcPost, { layer: 15, sublayer }));
      for (const route of root.querySelectorAll("[data-mhc-output-copy]")) {
        const mixed = route.querySelector("[data-stacked-sum]")!;
        expect(mixed.querySelectorAll("[data-sum-input]")).toHaveLength(4);
        expect(mixed.querySelectorAll("[data-sum-circle]")).toHaveLength(1);
        expect(mixed.querySelector("[data-sum-output]")).not.toBeNull();
        const final = route.querySelector("[data-mhc-final-sum]")!;
        expect(final.querySelectorAll("[data-sum-input]")).toHaveLength(2);
        expect(final.querySelector("[data-sum-output]")).not.toBeNull();
        expect(
          [...route.querySelectorAll("[data-mhc-broadcast-element]")].map((e) =>
            e.getAttribute("data-mhc-broadcast-element"),
          ),
        ).toEqual(["1", "2", "5120"]);
        expect(route.querySelector("[data-mhc-broadcast-arrow]")).toBeNull();
      }
      for (const circle of root.querySelectorAll<HTMLElement>(
        "[data-sum-circle]",
      )) {
        expect(circle.style.width).toBe(circle.style.height);
        expect(circle.style.borderRadius).toBe("50%");
        expect(
          circle.querySelector("[aria-label]")?.getAttribute("aria-label"),
        ).toBe("\\Sigma");
      }
      const producer = render(
        createElement(MhcMix, { layer: 15, sublayer }),
      ).root;
      const graph = buildGraph(15);
      const colors = [];
      for (const [symbol, input, edge] of [
        ["C", "comb", "comb"],
        ["q", "q", "post"],
      ]) {
        const source = producer.querySelector<HTMLElement>(
          `[data-mhc-coefficient-output="${symbol}"]`,
        )!;
        const target = root.querySelector<HTMLElement>(
          `[data-mhc-${input}-input]`,
        )!;
        expect(source.style.backgroundColor).toBe(target.style.backgroundColor);
        const edgeColor = graph.edges.find(
          (e) => e.id === `mix-${sublayer.toLowerCase()}-${edge}`,
        )?.style?.stroke;
        const colorProbe = document.createElement("div");
        colorProbe.style.borderColor = String(edgeColor);
        expect(colorProbe.style.borderColor).toBe(source.style.borderColor);
        colors.push(source.style.backgroundColor);
      }
      expect(new Set(colors).size).toBe(2);
      expect(
        root.querySelector('[data-mhc-broadcast-map] [data-split-arrows="4"]'),
      ).not.toBeNull();
    },
  );

  it("Indexer 展示代表 Head 的两个操作数、独立权重与得分矩阵", () => {
    const { root, formulas } = render(
      createElement(IndexScoreProcess, { layer: 15, kvSource: 15 }),
    );
    expect(
      [...root.querySelectorAll("[data-index-head]")].map((e) =>
        e.getAttribute("data-index-head"),
      ),
    ).toEqual(["1", "2", "32"]);
    expect(root.querySelectorAll("[data-index-head-weight]")).toHaveLength(3);
    expect(formulas).toContain("\\sum_{h=1}^{32}");
    expect(formulas).toContain("S_{15}");
    expect(formulas).toContain("128\\times M");
    expect(formulas).toContain("\\eta_{15,t,32}");
  });

  it("复用索引的层直接读行号，不把 K 缓存画成重新打分输入", () => {
    const reused = buildGraph(16);
    expect(reused.edges.some((e) => e.id === "compressor-indexer")).toBe(false);
    expect(reused.edges.some((e) => e.id === "q-low-rank-indexer")).toBe(false);
    expect(
      reused.edges.find((e) => e.id === "indexer-select")?.data?.labelTex,
    ).toContain("I_{15,t}");
    expect(
      buildGraph(29).edges.some((e) => e.id === "compressor-indexer"),
    ).toBe(true);
  });

  it("展开高度由测量推动后续主路径；旧普通残差边不再从保存布局回来", () => {
    const graph = buildGraph(15);
    const expanded = buildGraph(
      15,
      new Map([
        ["engram-inject", 2300],
        ["hc-mix-a", 1200],
      ]),
    );
    expect(
      expanded.nodes.find((n) => n.id === "norm1")!.position.y -
        graph.nodes.find((n) => n.id === "norm1")!.position.y,
    ).toBe(300);
    const coefficientOnly = buildGraph(15, new Map([["hc-mix-a", 2500]]));
    expect(
      coefficientOnly.nodes.find((n) => n.id === "norm1")!.position.y,
    ).toBe(graph.nodes.find((n) => n.id === "norm1")!.position.y);
    const saved = {
      version: 8,
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
      })),
      edges: [
        ...graph.edges,
        { id: "input-norm", source: "input", target: "norm1" },
        { id: "manual-test", source: "input", target: "norm1" },
      ],
    };
    const restored = applySavedLayout(graph, saved);
    expect(restored.edges.some((e) => e.id === "input-norm")).toBe(false);
    expect(restored.edges.some((e) => e.id === "manual-test")).toBe(true);
    const previous = {
      ...saved,
      nodes: saved.nodes.filter(
        (n) => !n.id.startsWith("hc-") && !n.id.startsWith("engram-"),
      ),
      edges: saved.edges.map((e) =>
        e.id === "state1-add2"
          ? { ...e, data: { tex: "H'", waypoints: [{ x: 12, y: 12 }] } }
          : e,
      ),
    };
    const reflowed = applySavedLayout(graph, previous);
    expect(reflowed.edges.find((e) => e.id === "state1-add2")).toEqual(
      graph.edges.find((e) => e.id === "state1-add2"),
    );
  });
});
