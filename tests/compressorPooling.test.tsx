import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  CompressorPooling,
  CompressorWeights,
} from "../src/components/CompressorPooling";
import {
  exponentialTex,
  normalizedExponentialTex,
} from "../src/components/exponential-notation";
import { Tensor } from "../src/templates/structure-blocks";

it.each([3, 9, 15])("第 %s 层复用池化结构，权重和内容逐列展开", (layer) => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <>
      <CompressorWeights layer={layer} />
      <CompressorPooling layer={layer} />
    </>,
  );
  expect(root.querySelector(".katex-error")).toBeNull();
  const columns = root.querySelectorAll("[data-compressor-gate-column]");
  expect(columns).toHaveLength(3);
  for (const column of columns) {
    const d = column.getAttribute("data-compressor-gate-column")!;
    const formulas = [...column.querySelectorAll("annotation")].map(
      (el) => el.textContent,
    );
    for (const row of [1, 2]) {
      expect(formulas).toContain(`\\alpha_{${layer},i,${row},${d}}`);
      expect(formulas).toContain(
        normalizedExponentialTex(
          [
            `a^{\\mathrm{gate}}_{${layer},2i-1,${d}}`,
            `a^{\\mathrm{gate}}_{${layer},2i,${d}}`,
          ],
          row - 1,
        ),
      );
    }
    // 框属于幂指数内的输入，不属于 e 或整个分式。
    expect(
      column.querySelectorAll("msup menclose[notation='box']"),
    ).toHaveLength(6);
  }
  for (const role of ["weight", "content"]) {
    const vectors = root.querySelectorAll(`[data-compressor-${role}-role]`);
    expect(vectors).toHaveLength(2);
    for (const vector of vectors) {
      expect(vector.querySelectorAll("[data-vector-cell]")).toHaveLength(3);
      expect(
        vector
          .querySelector("[data-tensor-caption]")
          ?.closest("[data-expanded-tensor]"),
      ).toBeNull();
      expect(vector.querySelector("[data-expanded-tensor] strong")).toBeNull();
    }
  }
  expect(
    root.querySelectorAll("[data-compressor-weighted-row] [data-branch-frame]"),
  ).toHaveLength(2);
});

it("指数的公共表示只框变量，拒绝不存在的分子", () => {
  expect(exponentialTex("z_i")).toBe("e^{\\boxed{z_i}}");
  expect(() => normalizedExponentialTex([], 0)).toThrow();
  expect(() => normalizedExponentialTex(["a"], 1)).toThrow();
});

it("机制章节矩阵省略行覆盖每个已展示的数据列", () => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <Tensor name="G_3" shape="M\times512" />,
  );
  expect(root.querySelectorAll("[data-matrix-ellipsis-column]")).toHaveLength(
    3,
  );
  for (const row of root.querySelectorAll<HTMLElement>(".tensor-row"))
    expect(row.style.gridTemplateColumns).toBe("subgrid");
});
