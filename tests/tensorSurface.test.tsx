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
  MatrixEllipsis,
} from "../src/components/diagram-primitives";
import { Expert } from "../src/compositions/DeepSeekV41Layer";
import { Tensor } from "../src/templates/structure-blocks";

it("选中列保留独立连线锚点，选中行与列统一使用同族填色和边框", () => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <Tensor
      name="S"
      shape={"3\\times3"}
      rows={["1", "2", "3"]}
      columns={["1", "2", "3"]}
      selected={["1", "3"]}
      selectedColumns={["2"]}
      tone="violet"
    />,
  );
  const rows = [...root.querySelectorAll<HTMLElement>(".tensor-row")];
  expect(root.querySelectorAll(".tensor-row.picked")).toHaveLength(2);
  const selected = rows[0].querySelector<HTMLElement>(".scalar")!;
  const column = rows[1].querySelectorAll<HTMLElement>(".scalar")[1];
  const normal = rows[1].querySelector<HTMLElement>(".scalar")!;
  expect(column.style.borderColor).toBe(selected.style.borderColor);
  expect(column.style.background).toBe(selected.style.background);
  expect(column.style.background).not.toBe(normal.style.background);
  root.innerHTML = renderToStaticMarkup(
    <Tensor
      name="s"
      shape={"1\\times3"}
      rows={["t"]}
      columns={["1", "2", "3"]}
      selectedColumns={["2"]}
      columnTrace={(c) => (c === "2" ? "chosen-score" : undefined)}
    />,
  );
  expect(
    root.querySelectorAll('[data-trace-object="chosen-score"]'),
  ).toHaveLength(1);
  expect(
    root
      .querySelector('[data-trace-object="chosen-score"]')
      ?.classList.contains("scalar"),
  ).toBe(true);
});

it.each([
  [["1", "2", "\\cdots", "128"], 3],
  [["1", "2", "3", "\\cdots", "512"], 4],
] as const)("纵向省略号逐列对应 %s", (columns, count) => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <MatrixEllipsis columns={[...columns]} />,
  );
  const dots = [...root.querySelectorAll("[data-matrix-ellipsis-column]")];
  expect(dots).toHaveLength(count);
  expect(
    dots.map((dot) => dot.getAttribute("data-matrix-ellipsis-column")),
  ).toEqual(columns.filter((c) => c !== "\\cdots"));
  for (const dot of dots)
    expect(dot.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe(
      "\\vdots",
    );
});

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
