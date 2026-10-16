import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { latexHtml } from "../src/components/EditableArchitectureGraph";
import { MathMarkup, updateMathMarkup } from "../src/components/MathMarkup";

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const originalActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});

describe("原生公式按结构更新", () => {
  it("层号变动保留 MathML 元素与文本节点，显示文本和 TeX 注释同时更新", () => {
    const root = document.createElement("span");
    root.innerHTML = latexHtml("q_{1,t}+o_{1,t}");
    const elements = [...root.querySelectorAll("*")];
    const number = root.querySelector("mn")!;
    const numberText = number.firstChild;
    updateMathMarkup(root, latexHtml("q_{29,t}+o_{29,t}"));
    expect([...root.querySelectorAll("*")]).toEqual(elements);
    expect(number.firstChild).toBe(numberText);
    expect(number.textContent).toBe("29");
    expect(root.querySelector("annotation")?.textContent).toBe(
      "q_{29,t}+o_{29,t}",
    );
    expect(root.innerHTML).toBe(latexHtml("q_{29,t}+o_{29,t}"));
  });
  it("结构或属性不同整体更新，不保留旧分数与旧颜色", () => {
    const root = document.createElement("span");
    root.innerHTML = latexHtml("x_1");
    const old = root.firstChild;
    updateMathMarkup(root, latexHtml("\\frac{x_2}{y_2}", true));
    expect(root.firstChild).not.toBe(old);
    expect(root.querySelector("mfrac")).not.toBeNull();
    expect(root.querySelector('math[display="block"]')).not.toBeNull();
    updateMathMarkup(root, latexHtml("\\color{red}{x_3}"));
    expect(root.innerHTML).toBe(latexHtml("\\color{red}{x_3}"));
  });
  it("转义文本经过 HTML 解析还原，不把实体当显示文字", () => {
    const root = document.createElement("span");
    root.innerHTML = latexHtml("\\text{A < B}");
    updateMathMarkup(root, latexHtml("\\text{C > D}"));
    expect(
      root.querySelector("mtext")?.textContent?.replace(/\u00a0/g, " "),
    ).toBe("C > D");
    const expected = document.createElement("span");
    expected.innerHTML = latexHtml("\\text{C > D}");
    expect(root.innerHTML).toBe(expected.innerHTML);
  });
  it("服务端首次输出完整公式，客户端连续换层和切换结构仍正确", async () => {
    const first = "q_{1,t}";
    expect(
      renderToStaticMarkup(<MathMarkup html={latexHtml(first)} tex={first} />),
    ).toContain("<math");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(<MathMarkup html={latexHtml(first)} tex={first} />),
      );
      const math = container.querySelector("math");
      for (const tex of ["q_{15,t}", "q_{29,t}", "q_{1,t}"]) {
        await act(async () =>
          root.render(<MathMarkup html={latexHtml(tex)} tex={tex} />),
        );
        expect(container.firstElementChild?.getAttribute("aria-label")).toBe(
          tex,
        );
        expect(container.querySelector("annotation")?.textContent).toBe(tex);
        expect(container.querySelector("math")).toBe(math);
      }
      await act(async () =>
        root.render(
          <MathMarkup html={latexHtml("\\frac{q}{k}")} tex="fraction" />,
        ),
      );
      expect(container.querySelector("mfrac")).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
