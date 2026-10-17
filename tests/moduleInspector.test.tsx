import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  inspectorReducer,
  explainModule,
  ModuleInspector,
  type InspectorState,
} from "../src/components/ModuleInspector";
import { buildGraph, MhcMix } from "../src/compositions/DeepSeekV41Layer";
import { createElement } from "react";

describe("模块解释的显式开关", () => {
  it("本层生成、窗口与 Attention 旁注统一使用当前 token t", () => {
    for (const kind of [
      "projection-kv",
      "swa-window",
      "kv-merge",
      "heads",
      "projection-q",
    ]) {
      const text = explainModule({
        kind,
        layer: 2,
        phase: "decode",
      }).paragraphs.join("\n");
      expect(text).toContain("t−128 到 t−1");
      expect(text).toContain("原样保留 t−127 到 t−1");
      expect(text).toContain("上一层的本地 KV 不拼进本层");
      expect(text).toContain("只标识参数所属分支");
      expect(text).toContain("127 条历史加当前行");
      expect(text).not.toContain("token129");
    }
  });
  it("初始化与系数旁注明确完整复制、单次子层计算和动态权重", () => {
    const init = explainModule({
      kind: "hc-expand",
      layer: 3,
      phase: "decode",
    }).paragraphs.join("\n");
    expect(init).toContain("完整复制四份");
    expect(init).toContain("1\\times4\\times5120");
    expect(init).toContain("(1,0,0,0)");
    expect(init).toContain("只计算一次");
    const mhc = explainModule({
      kind: "hc-mix",
      layer: 3,
      sublayer: "A",
    }).paragraphs.join("\n");
    expect(mhc).toContain("具体系数随层、token 和残差内容动态计算");
    expect(mhc).toContain("$q$ 和 $C$ 用于当前子层回写");
    expect(mhc).toContain("$p$ 留给下一次汇合");
  });
  it("临时预览离开或换层收回，固定后离开保持", () => {
    const closed: InspectorState = { mode: "closed", nodeId: "q" };
    const preview = inspectorReducer(closed, { type: "preview" });
    expect(preview.preview).toBe(true);
    const auto = inspectorReducer(
      { mode: "auto", nodeId: null },
      { type: "preview" },
    );
    expect(inspectorReducer(auto, { type: "leave" }).mode).toBe("auto");
    expect(inspectorReducer(preview, { type: "leave" }).mode).toBe("closed");
    expect(inspectorReducer(preview, { type: "context-change" }).mode).toBe(
      "closed",
    );
    expect(
      inspectorReducer(inspectorReducer(preview, { type: "open" }), {
        type: "leave",
      }).mode,
    ).toBe("open");
  });
  it("第一次选框打开，关闭后选框与换层不擅自打开，再次开启展示最后所选框", () => {
    let state: InspectorState = { mode: "auto", nodeId: null };
    state = inspectorReducer(state, { type: "select", nodeId: "q" });
    expect(state).toEqual({ mode: "open", nodeId: "q" });
    state = inspectorReducer(state, { type: "select", nodeId: "kv" });
    expect(state.mode).toBe("open");
    state = inspectorReducer(state, { type: "close" });
    state = inspectorReducer(state, { type: "select", nodeId: "hc-mix-a" });
    expect(state).toEqual({ mode: "closed", nodeId: "hc-mix-a" });
    expect(inspectorReducer(state, { type: "open" })).toEqual({
      mode: "open",
      nodeId: "hc-mix-a",
    });
  });
  it("完整图的每一种主模块都能返回说明，mHC 包含各中间变量和消费端", () => {
    const kinds = new Map(
      buildGraph(15)
        .nodes.filter((node) => !node.parentId)
        .map((node) => [node.data.kind, node.data]),
    );
    for (const data of kinds.values()) {
      const result = explainModule(data);
      expect(result.paragraphs.length).toBeGreaterThanOrEqual(2);
      for (const paragraph of result.paragraphs) {
        expect(paragraph.length).toBeGreaterThan(50);
        expect(paragraph.endsWith("。")).toBe(true);
        expect(paragraph).not.toMatch(/@L|@N|@SUB/);
        expect(paragraph).not.toMatch(
          /不是|而非|并非|不能|不要|仍沿用同一绿色|不另起/,
        );
      }
      const html = renderToStaticMarkup(
        createElement(ModuleInspector, {
          data,
          connections: [],
          onClose: () => {},
        }),
      );
      expect(html).not.toContain("katex-error");
      const root = document.createElement("div");
      root.innerHTML = html;
      expect(root.querySelectorAll(".inspector-prose > p")).toHaveLength(
        result.paragraphs.length,
      );
      expect(
        root.querySelector("dl,h3,h4,ul,ol,.inspector-formula"),
      ).toBeNull();
      expect(root.textContent).not.toContain("变量字典");
    }
  });
});

it("旁注把变量、形状和消费关系写进段落，并随层号及模式更新", () => {
  const text = explainModule({
    kind: "hc-mix",
    layer: 15,
    sublayer: "F",
    phase: "decode",
  }).paragraphs.join("\n");
  for (const term of [
    "1\\times4\\times5120",
    "W_{15}^{HC,F}",
    "s_1",
    "b_j",
    "a^p_j",
    "C^{(1)}",
    "\\mathbf r_j",
    "下一层 Attention",
    "Decode",
  ])
    expect(text).toContain(term);
  const html = renderToStaticMarkup(
    createElement(ModuleInspector, {
      data: { kind: "projection-q", layer: 29 },
      connections: [
        { id: "in", direction: "in", other: "输入归一化", label: "X_{29}" },
        { id: "out", direction: "out", other: "Head 分块", label: "Q_{29}" },
      ],
      onClose: () => {},
    }),
  );
  const root = document.createElement("div");
  root.innerHTML = html;
  expect(root.querySelectorAll(".inspector-connection-prose")).toHaveLength(2);
  expect(root.textContent).toContain("本模块从“输入归一化”接收");
  expect(root.textContent).toContain("本模块向“Head 分块”传递");
  expect(root.querySelector(".katex-error")).toBeNull();
});

it("mHC 拼接、归一化、三段 u、仿射与分支运算均展开成结构", () => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    createElement(MhcMix, { layer: 15, sublayer: "F" }),
  );
  expect(root.querySelector(".katex-error")).toBeNull();
  expect(
    root.querySelector("[data-mhc-concat-segments]")?.children,
  ).toHaveLength(4);
  expect(root.querySelector("[data-mhc-u-segments]")?.children).toHaveLength(3);
  expect(root.querySelector("[data-mhc-pq-parallel]")?.children).toHaveLength(
    2,
  );
  expect(
    root.querySelector("[data-mhc-gate-branches] > [data-mhc-sinkhorn]"),
  ).not.toBeNull();
  expect(
    root.querySelector("[data-mhc-column-normalize] [data-stacked-sum]"),
  ).not.toBeNull();
  expect(
    [
      ...root.querySelectorAll("[data-mhc-coefficient-output] [aria-label]"),
    ].map((el) => el.getAttribute("aria-label")),
  ).toContain("\\mathbf p_{15,t}^{F}");
  expect(root.querySelectorAll("[data-mhc-affine-row]")).toHaveLength(8);
  expect(root.querySelectorAll("[data-mhc-four-matrix]")).toHaveLength(4);
  const norm = root.querySelector("[data-mhc-joint-norm]")!;
  const tex = [...norm.querySelectorAll("[aria-label]")].map((el) =>
    el.getAttribute("aria-label"),
  );
  expect(tex.some((value) => /^[zy]_[{]/.test(value ?? ""))).toBe(false);
  expect(root.textContent).not.toContain("其余 16");
  expect(root.textContent).not.toContain("广播");
  expect(root.textContent).not.toMatch(
    /不是|而非|并非|不能|不要|仍沿用同一绿色|不另起|避免.*混淆/,
  );
});
