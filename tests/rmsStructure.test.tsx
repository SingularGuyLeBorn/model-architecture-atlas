import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import katex from "katex";
import { Rms } from "../src/templates/architecture-blocks";

for (const compact of [false, true])
  it(`RMSNorm ${compact ? "紧凑" : "横向"}结构保留归约与整行缩放`, () => {
    const dom = document.createElement("div");
    dom.innerHTML = renderToStaticMarkup(
      <Rms
        input="x_{3,t}"
        output="y_{3,t}"
        size={2560}
        gamma="1+w_3"
        eps={1e-6}
        compact={compact}
      />,
    );
    const operands = dom.querySelectorAll("[data-sum-operand]");
    expect(operands).toHaveLength(3);
    ["1", "2", "2560"].forEach((d, i) => {
      expect(
        operands[i].querySelector("[aria-label]")?.getAttribute("aria-label"),
      ).toBe(`z_{${d}}^2`);
    });
    expect(dom.querySelectorAll("[data-sum-input]")).toHaveLength(3);
    expect(dom.querySelectorAll("[data-sum-omitted]")).toHaveLength(1);
    expect(dom.querySelectorAll("[data-rms-square-sum]")).toHaveLength(1);
    expect(dom.querySelectorAll('[data-trace-object="rms-root"]')).toHaveLength(
      1,
    );
    expect(
      dom.querySelectorAll(
        '.architecture-fraction [data-trace-object="rms-denominator"]',
      ),
    ).toHaveLength(1);
    const formulas = [...dom.querySelectorAll("span[aria-label]")].map(
      (n) => n.getAttribute("aria-label")!,
    );
    expect(formulas).toContain("z_d:=(x_{3,t})_d,\\quad d=1,\\ldots,2560");
    expect(formulas).toContain("m=\\frac{s}{2560}");
    expect(formulas).toContain("r=\\sqrt{m+0.000001}");
    expect(formulas).toContain("1+w_3");
    expect(formulas).toContain("y_{3,t}");
    formulas.forEach((tex) =>
      expect(() =>
        katex.renderToString(tex, { throwOnError: true }),
      ).not.toThrow(),
    );
  });
