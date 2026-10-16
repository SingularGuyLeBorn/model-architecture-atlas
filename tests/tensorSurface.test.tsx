import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  Box,
  COLORS,
  FeatureVector,
  Matrix,
  RowMatrix,
  MathFormula,
  VectorStrip,
} from "../src/components/diagram-primitives";
import { Expert } from "../src/compositions/DeepSeekV41Layer";
import { Tensor } from "../src/templates/structure-blocks";

it("白色画布上，展开张量外框透明且内部元素保留颜色", () => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <>
      <Matrix
        tex="X"
        shape="N\times4"
        rowTex={(r) => `x_${r}`}
        elementTex={(r, c) => `x_{${r},${c}}`}
        vectorLength="4"
      />
      <RowMatrix
        tex="X"
        shape="N\times4"
        rows={["x_1", "x_2"]}
        rowLength="4"
        elementTex={(r, c) => `x_{${r},${c}}`}
      />
      <FeatureVector name="x" scalar={(c) => `x_${c}`} />
      <Box tone="violet" expanded>
        <Box tone="violet">c₁₁</Box>
      </Box>
      <Tensor name="X" shape="N\times4" />
      <Expert layer={1} index={7} score=".91" />
    </>,
  );
  expect(COLORS.paper).toBe("#ffffff");
  const frames = [
    ...root.querySelectorAll<HTMLElement>("[data-expanded-tensor]"),
  ];
  expect(frames.length).toBeGreaterThan(10);
  for (const frame of frames) {
    expect(["", "transparent"]).toContain(frame.style.background);
    expect(
      [...frame.querySelectorAll<HTMLElement>("div,span")].some(
        (cell) =>
          cell.style.background && cell.style.background !== "transparent",
      ),
    ).toBe(true);
  }
  expect(root.querySelector(".katex-error")).toBeNull();
});

it("标量与向量默认采用内容宽度，矩阵行共享内容列宽", () => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <>
      <Box>
        <MathFormula tex="a" />
      </Box>
      <VectorStrip
        name=""
        nameWidth={0}
        length="4"
        elementTex={(c) => `p_${c}`}
      />
      <RowMatrix
        tex="P"
        shape="N\times4"
        rows={["p_1", "p_N"]}
        rowLength="4"
        elementTex={(r, c) => `p_{${r},${c}}`}
      />
    </>,
  );
  // jsdom 的 CSS 解析器不保留 intrinsic width；浏览器尺寸由 E2E 验证。
  expect(root.firstElementChild!.getAttribute("style")).toContain(
    "width:fit-content",
  );
  const vector = root.querySelector<HTMLElement>("[data-vector-elements]")!;
  expect(vector.dataset.contentWidth).toBe("true");
  expect(vector.getAttribute("style")).toContain("width:max-content");
  const matrix = root.querySelector<HTMLElement>("[data-expanded-tensor]")!;
  expect(matrix.getAttribute("style")).toContain("width:max-content");
  expect(
    (matrix.children[1] as HTMLElement).style.gridTemplateColumns,
  ).toContain("max-content");
  for (const row of matrix.querySelectorAll<HTMLElement>(
    "[data-vector-elements]",
  ))
    expect(row.style.gridTemplateColumns).toBe("subgrid");
});
