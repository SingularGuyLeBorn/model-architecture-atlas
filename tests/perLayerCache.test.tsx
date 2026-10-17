import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CacheReference } from "../src/components/CacheReference";
import { SlidingWindowRows } from "../src/components/SlidingWindowRows";
import {
  cachePolicy,
  CacheOutputScope,
} from "../src/components/CacheSemantics";
import { buildGraph } from "../src/compositions/DeepSeekV41Layer";

it("全部层保留本地 KV 和 Attention；跨层入口按配置定义本层别名", () => {
  for (let layer = 1; layer <= 40; layer++) {
    const p = cachePolicy(layer);
    const graph = buildGraph(layer, new Map(), "decode");
    const edge = (id: string) => graph.edges.find((e) => e.id === id);
    expect(edge("norm-kv")?.data?.labelTex).toBe(`X_{${layer}}`);
    expect(edge("swa-merge")?.data?.labelTex).toBe(`U_{${layer},t}`);
    expect(edge("merge-heads")?.target).toBe("heads");
    expect(Boolean(edge("norm-compressor"))).toBe(p.mode === "Full");
    if (p.mode === "Full") {
      expect(edge("compressor-indexer")?.data?.labelTex).toBe(
        `\\bar{\\mathbf g}_{${layer},i}`,
      );
    }
    expect(Boolean(edge("q-low-rank-indexer"))).toBe(
      p.mode === "Full" || p.mode === "Reindex",
    );
    if (p.kv === null) {
      expect(
        graph.nodes.some((n) =>
          ["compressor", "indexer", "global-select"].includes(n.id),
        ),
      ).toBe(false);
      continue;
    }
    expect(edge("indexer-matrix")?.data?.labelTex).toBe(`G_{${layer}}`);
    expect(edge("indexer-select")?.data?.labelTex).toBe(`I_{${layer},t}`);
    expect(edge("select-merge")?.data?.labelTex).toBe(
      `G_{${layer},t}^{\\mathrm{selected}}`,
    );
    for (const kind of ["G", "K", "I", "B"] as const) {
      const source = kind === "I" ? p.index! : kind === "B" ? 21 : p.kv;
      const root = document.createElement("div");
      root.innerHTML = renderToStaticMarkup(
        <CacheReference layer={layer} source={source} kind={kind} />,
      );
      expect(root.querySelector(".katex-error")).toBeNull();
      expect(
        root
          .querySelector("[data-cache-reference]")
          ?.getAttribute("data-reference-source"),
      ).toBe(String(source));
      const formulas = [...root.querySelectorAll("[aria-label]")].map((e) =>
        e.getAttribute("aria-label"),
      );
      expect(
        formulas.some((s) => s?.includes(`${layer}\\leftarrow${source}`)),
      ).toBe(true);
      expect(root.textContent).toContain("下文本层简写");
    }
  }
});

it("窗口用原 token 行顺序展示淘汰、新增与 128 行括号，灰行不在有效 U 内", () => {
  for (const layer of [1, 3, 25, 26, 40]) {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(<SlidingWindowRows layer={layer} />);
    expect(root.querySelector(".katex-error")).toBeNull();
    const active = root.querySelector("[data-selection-window]")!;
    expect(active.querySelector('[data-window-token="1"]')).toBeNull();
    expect(
      root
        .querySelector('[data-window-token="1"]')
        ?.getAttribute("data-window-state"),
    ).toBe("old");
    expect(
      active
        .querySelector('[data-window-token="129"]')
        ?.getAttribute("data-window-state"),
    ).toBe("new");
    expect(
      [...active.querySelectorAll("[data-window-token]")].map((e) =>
        e.getAttribute("data-window-token"),
      ),
    ).toEqual(["2", "3", "128", "129"]);
    expect(root.querySelector("[data-window-bracket]")?.textContent).toContain(
      "128 行",
    );
    expect(root.querySelector("[data-ring-cache]")).toBeNull();
  }
  expect(
    renderToStaticMarkup(<CacheOutputScope layer={21} kind="G" />),
  ).toContain("40");
  expect(
    renderToStaticMarkup(<CacheOutputScope layer={25} kind="I" />),
  ).toContain("28");
  expect(renderToStaticMarkup(<CacheOutputScope layer={26} kind="G" />)).toBe(
    "",
  );
});
