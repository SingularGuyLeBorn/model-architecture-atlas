import {
  Box,
  COLORS,
  MathFormula,
  Operator,
  RowMatrix,
  StackedSum,
  VectorStrip,
} from "./diagram-primitives";
import { Fragment } from "react";
import { frameColor } from "./diagram-appearance";

/** 同一查询 token 的 Head 分数按行组成 A，再用权重行左乘。 */
export function IndexScoreMatrix({ layer }: { layer: number }) {
  return (
    <section data-index-score-matmul style={{ display: "grid", gap: 10 }}>
      <strong>固定查询 token t · 权重行 × Head 分数矩阵 = 分数行</strong>
      <div data-index-matrix-definition style={{ textAlign: "center" }}>
        上方未加权的 32 条分数行按 Head 顺序组成
        <MathFormula tex={`A^I_{${layer},t}`} />
        （只排列，不改变数值）：
        <MathFormula tex={`(A^I_{${layer},t})_{h,i}:=a^I_{h,t,i}`} />
        。行 h 是 Head，列 i 是候选缓存行。
      </div>
      <div
        data-index-matmul-operands
        style={{
          display: "grid",
          gridTemplateColumns: "max-content 28px max-content 28px max-content",
          gap: 12,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          data-index-matmul-weight
          style={{
            border: `1.3px solid ${frameColor(COLORS.amber)}`,
            borderRadius: 7,
            padding: 6,
            display: "grid",
            gap: 5,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <MathFormula tex={`\\boldsymbol\\eta_{${layer},t}`} />
            <MathFormula tex="1\times32" />
          </div>
          <VectorStrip
            name=""
            nameWidth={0}
            length="32"
            tone="amber"
            elementTex={(h) => `\\eta_{${layer},t,${h}}`}
          />
        </div>
        <Operator tex="\times" />
        <div data-index-matmul-scores>
          <RowMatrix
            tex={`A^I_{${layer},t}`}
            shape="32\times M"
            rows={[
              "\\mathbf a^I_{1,t}",
              "\\mathbf a^I_{2,t}",
              "\\vdots",
              "\\mathbf a^I_{32,t}",
            ]}
            rowLength="M"
            elementTex={(r, i) => `a^I_{${[1, 2, "", 32][r]},t,${i}}`}
          />
        </div>
        <Operator tex="=" />
        <div data-index-matmul-result>
          <RowMatrix
            tex={`\\mathbf s_{${layer},t}`}
            shape="1\times M"
            rows={[`\\mathbf s_{${layer},t}`]}
            rowLength="M"
            elementTex={(_, i) => `s_{${layer},t,${i}}`}
          />
        </div>
      </div>
      <div data-index-matmul-identity style={{ textAlign: "center" }}>
        <MathFormula
          tex={`\\boldsymbol\\eta_{${layer},t}\\times A^I_{${layer},t}=\\mathbf s_{${layer},t}`}
        />
        <div>
          下面展开同一次矩阵乘法的第 1、2、M 列；Σ
          表示行乘列中的累加，不是再算一遍。
        </div>
      </div>
    </section>
  );
}

/** 固定同一查询 token，按候选列分别归约 Head 轴。 */
export function IndexScoreColumns({ layer }: { layer: number }) {
  return (
    <div
      data-index-score-columns
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 24px 1fr",
        gap: 10,
        alignItems: "start",
      }}
    >
      {["1", "2", "M"].map((column, index) => (
        <Fragment key={column}>
          {index === 2 && <Operator tex="\cdots" />}
          <section
            data-index-score-column={column}
            style={{
              border: `1px solid ${frameColor(COLORS.green)}`,
              borderRadius: 8,
              padding: 8,
              display: "grid",
              gap: 8,
              minWidth: 0,
            }}
          >
            <strong>候选缓存行 i = {column} · 固定查询 token t</strong>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "max-content",
                maxWidth: "100%",
                marginInline: "auto",
              }}
            >
              <StackedSum omittedBefore={2} outputDirection="right">
                {[1, 2, 32].map((head) => (
                  <Box key={head} tone="cyan">
                    <MathFormula
                      tex={`\\eta_{${layer},t,${head}}\\cdot a^I_{${head},t,${column}}`}
                    />
                  </Box>
                ))}
              </StackedSum>
              <div data-index-score-cell={column}>
                <Box tone="green">
                  <MathFormula tex={`s_{${layer},t,${column}}`} />
                </Box>
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <MathFormula
                tex={`s_{${layer},t,${column}}=\\sum_{h=1}^{32}\\eta_{${layer},t,h}\\cdot a^I_{h,t,${column}}`}
              />
            </div>
          </section>
        </Fragment>
      ))}
    </div>
  );
}
