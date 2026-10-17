import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompressorProjections } from "../src/components/CompressorProjections";

describe("压缩器的整行投影与单列点积", () => {
  it.each([3, 15, 21])("第 %s 层的完整矩阵对应向量，单列对应标量", (layer) => {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
      <CompressorProjections layer={layer} ratio={layer === 21 ? 1 : 2} />,
    );
    expect(root.querySelector(".katex-error")).toBeNull();
    expect(
      root.querySelector("[data-compressor-parameter-origin]")?.textContent,
    ).toContain("独立参数");
    expect(root.textContent).not.toContain("训练得到");
    expect(root.querySelectorAll("[data-compressor-projection]")).toHaveLength(
      layer === 21 ? 1 : 2,
    );
    for (const branch of root.querySelectorAll<HTMLElement>(
      "[data-compressor-projection]",
    )) {
      const gate = branch.dataset.compressorProjection === "gate";
      const sup = gate ? "\\mathrm{gate}" : "KV,G";
      const resultSup = gate ? "\\mathrm{gate}" : "c";
      const scalar = gate ? "a" : "v";
      expect(
        branch.querySelector(
          '[data-projection-weight] [data-tensor-origin="independent-parameter"]',
        ),
      ).not.toBeNull();
      expect(
        branch.querySelector(
          '[data-projection-output] [data-tensor-origin="activation"]',
        ),
      ).not.toBeNull();
      expect(
        branch.querySelector("[data-compressor-output-role]")?.textContent,
      ).toContain(gate ? "Gate 原始分数" : "候选 KV 内容");
      expect(
        branch.querySelector("[data-compressor-role-destination]")?.textContent,
      ).toContain(gate ? "同组两行的同一列" : "512 维内容");
      expect(
        branch.querySelector("[data-projection-column-definition]")
          ?.textContent,
      ).toContain("原参数的切片");
      const formulas = (selector: string) =>
        [...branch.querySelectorAll(`${selector} [aria-label]`)].map((el) =>
          el.getAttribute("aria-label"),
        );
      expect(formulas("[data-projection-input]")).toContain("1\\times5120");
      expect(formulas("[data-projection-weight]")).toEqual(
        expect.arrayContaining([`W_{${layer}}^{${sup}}`, "5120\\times512"]),
      );
      expect(formulas("[data-projection-output]")).toEqual(
        expect.arrayContaining([
          `\\mathbf ${scalar}_{${layer},t}^{${resultSup}}`,
          "1\\times512",
        ]),
      );
      expect(
        branch.querySelectorAll(
          "[data-projection-weight] [data-parameter-column]",
        ),
      ).toHaveLength(3);
      for (const j of [1, 2, 512]) {
        expect(formulas("[data-projection-weight]")).toContain(
          `\\mathbf w_{${layer},${j}}^{${sup}}`,
        );
        expect(formulas("[data-projection-scalar-examples]")).toContain(
          `\\mathbf x_{${layer},t}\\times\\mathbf w_{${layer},${j}}^{${sup}}=${scalar}_{${layer},t,${j}}^{${resultSup}}\\in\\mathbb R`,
        );
      }
      expect(formulas("[data-projection-column-definition]")).toContain(
        `(\\mathbf w_{${layer},j}^{${sup}})_d:=(W_{${layer}}^{${sup}})_{d,j}`,
      );
    }
  });
});
