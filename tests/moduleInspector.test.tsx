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
      expect(result.summary.length).toBeGreaterThan(20);
      expect(result.variables.length).toBeGreaterThan(2);
      const html = renderToStaticMarkup(
        createElement(ModuleInspector, {
          data,
          connections: [],
          onClose: () => {},
        }),
      );
      expect(html).not.toContain("katex-error");
    }
  });
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
});
