import { describe, it, expect } from "vitest";
import { inspectInternalTarget } from "../src/components/internal-selection";
import { inspectorReducer } from "../src/components/ModuleInspector";

describe("内部对象选择", () => {
  it("指数框选中变量本身，并完整保留多层上下标", () => {
    const root = document.createElement("div");
    const formula = document.createElement("span");
    formula.setAttribute(
      "aria-label",
      "e^{\\boxed{a^{gate}_{3,2i-1,512}}}+e^{\\boxed{a^{gate}_{3,2i,512}}}",
    );
    formula.innerHTML =
      '<math><msup><mi>e</mi><menclose notation="box"><mi>a</mi></menclose></msup><msup><mi>e</mi><menclose notation="box"><mi>a</mi></menclose></msup></math>';
    root.append(formula);
    const variable = root.querySelectorAll("menclose")[1];
    const selected = inspectInternalTarget(variable.firstElementChild, root)!;
    expect(selected.element).toBe(variable);
    expect(selected.detail.tex).toBe("a^{gate}_{3,2i,512}");
  });
  it("命中元素时选择最内层框而非矩阵与父容器", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<div style="border:1px solid"><div id="cell" style="border:1px solid"><span aria-label="h_{1,2}">h</span></div></div>';
    const result = inspectInternalTarget(root.querySelector("span"), root)!;
    expect(result.element.id).toBe("cell");
    expect(result.detail.tex).toBe("h_{1,2}");
  });
  it("线命中区与可见线读取相同输入序号", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<div data-stacked-sum><div data-sum-operand="1"><span aria-label="c_{22}"></span></div><svg><g data-wire-path><path id="visible" data-sum-input="1"/><path data-wire-hit data-wire-input="1" /></g></svg></div>';
    expect(
      inspectInternalTarget(root.querySelector("[data-wire-hit]"), root)
        ?.element.id,
    ).toBe("visible");
    expect(
      inspectInternalTarget(root.querySelector("path"), root)?.detail,
    ).toEqual({
      kind: "wire",
      tex: "c_{22}",
      description:
        "第 2 路输入沿箭头进入累加器，参与逐元素求和；结果从独立出口送往下方结果框。",
    });
  });
  it("关闭后换选内部对象保留当前选择，主动打开后显示它", () => {
    const detail = { kind: "wire" as const, description: "输入线" };
    const selected = inspectorReducer(
      { mode: "closed", nodeId: "q" },
      { type: "select", nodeId: "add2", detail },
    );
    expect(selected.mode).toBe("closed");
    expect(inspectorReducer(selected, { type: "open" }).detail).toEqual(detail);
    expect(
      inspectorReducer(selected, { type: "select", nodeId: "kv" }).detail,
    ).toBeUndefined();
    expect(inspectorReducer(selected, { type: "context-change" })).toEqual({
      mode: "closed",
      nodeId: "add2",
    });
  });
});
