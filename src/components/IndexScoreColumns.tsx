import {
  Box,
  COLORS,
  MathFormula,
  Operator,
  StackedSum,
} from "./diagram-primitives";
import { Fragment } from "react";
import { frameColor } from "./diagram-appearance";

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
