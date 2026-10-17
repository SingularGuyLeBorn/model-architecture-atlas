import { Fragment } from "react";
import {
  Box,
  MathFormula as M,
  Operator,
  RowMatrix,
  TensorHeading,
  VectorStrip,
} from "./diagram-primitives";

// [OM-FREEPLAY] 取已展示的末个地址作代表，便于从双表外侧接线；24 行遵循相同计算。
export const ENGRAM_DEQUANT_ROW = "b_{4,8}";
export const ENGRAM_DEQUANT_BLOCKS = [1, 2, 8];

/** 同一 b 的两个读出行；数值拆成 32 列块，系数逐块广播，再按原列序组成 BF16 行。 */
export function EngramRowDequantization({ layer }: { layer: number }) {
  return (
    <div
      data-engram-dequantization
      style={{
        display: "grid",
        gridTemplateColumns: "max-content 96px max-content",
        gap: 10,
        paddingLeft: 42,
        width: "max-content",
      }}
    >
      <strong style={{ textAlign: "center", gridColumn: "1 / -1" }}>
        反量化 · 展开同一行 <M tex={`b:=${ENGRAM_DEQUANT_ROW}`} /> · 其余 23
        行同样处理
      </strong>
      <div
        data-dequant-inputs
        style={{
          gridColumn: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "start",
          gap: 48,
        }}
      >
        <div data-dequant-values>
          <Box tone="indigo" expanded>
            <TensorHeading name="\bar{\mathbf e}_b" shape="1\times256" />
            <VectorStrip
              name=""
              nameWidth={0}
              length="256"
              elementTex={(d) => `\\bar e_{b,${d}}`}
              tone="indigo"
              uniformCells
              compact
            />
          </Box>
        </div>
        <div data-dequant-scales>
          <Box tone="ochre" expanded>
            <TensorHeading name="\mathbf s_b" shape="1\times8" />
            <VectorStrip
              name=""
              nameWidth={0}
              length="8"
              elementTex={(k) => `s_{b,${k}}`}
              tone="ochre"
              uniformCells
              compact
            />
          </Box>
        </div>
      </div>
      <div
        data-dequant-blocks
        style={{
          gridColumn: 1,
          display: "grid",
          gridTemplateColumns: "max-content 24px max-content 24px max-content",
          gap: "20px 8px",
          paddingTop: 48,
        }}
      >
        {ENGRAM_DEQUANT_BLOCKS.map((k) => (
          <Fragment key={k}>
            {k === 8 && (
              <>
                {[1, 3, 5].map((col) => (
                  <div
                    key={col}
                    style={{ gridColumn: col, textAlign: "center" }}
                  >
                    <M tex="\vdots" />
                  </div>
                ))}
              </>
            )}
            <div
              data-dequant-block={k}
              style={{
                display: "grid",
                gridTemplateColumns: "subgrid",
                gridColumn: "1 / -1",
                gap: "6px 8px",
                alignItems: "center",
              }}
            >
              <small style={{ gridColumn: "1 / -1" }}>
                第 {k} 块 · 列 {(k - 1) * 32 + 1}–{k * 32} · 两个输入转 FP32
                后相乘
              </small>
              <div data-dequant-value-block={k}>
                <Box tone="indigo" expanded>
                  <VectorStrip
                    name=""
                    nameWidth={0}
                    length={String(k * 32)}
                    columns={[
                      String((k - 1) * 32 + 1),
                      String((k - 1) * 32 + 2),
                      "\\cdots",
                      String(k * 32),
                    ]}
                    elementTex={(d) => `\\bar e_{b,${d}}`}
                    tone="indigo"
                    uniformCells
                    compact
                  />
                </Box>
              </div>
              <Operator tex="\times" />
              <div data-dequant-scale-block={k}>
                <Box tone="ochre">
                  <M tex={`s_{b,${k}}`} />
                </Box>
              </div>
              <Operator tex="=" />
              <div data-dequant-result-block={k}>
                <Box tone="green" expanded>
                  <VectorStrip
                    name=""
                    nameWidth={0}
                    length={String(k * 32)}
                    columns={[
                      String((k - 1) * 32 + 1),
                      String((k - 1) * 32 + 2),
                      "\\cdots",
                      String(k * 32),
                    ]}
                    elementTex={(d) => `\\hat e_{4,8,${d}}`}
                    tone="green"
                    uniformCells
                    compact
                  />
                </Box>
              </div>
            </div>
          </Fragment>
        ))}
      </div>
      <div
        data-dequant-footer
        style={{
          gridColumn: 1,
          position: "relative",
          display: "flex",
          gap: 64,
          justifyContent: "space-between",
          alignItems: "start",
          paddingTop: 60,
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <div data-dequant-output>
            <Box tone="green" expanded>
              <TensorHeading name="\mathbf e_{4,8}" shape="1\times256" />
              <VectorStrip
                name=""
                nameWidth={0}
                length="256"
                elementTex={(d) => `e_{4,8,${d}}`}
                tone="green"
                uniformCells
                compact
              />
            </Box>
          </div>
          <small>8 块保持列序 · 转为 BF16</small>
        </div>
      </div>
      <div
        data-engram-read-result
        style={{
          display: "grid",
          gap: 4,
          gridColumn: 3,
          gridRow: 3,
          alignSelf: "center",
        }}
      >
        <strong style={{ textAlign: "center" }}>24 行结果 · BF16</strong>
        <RowMatrix
          tex={`\\mathcal E_{${layer},t}`}
          shape="3\times8\times256"
          rows={["2\\text{-gram}", "3\\text{-gram}", "4\\text{-gram}"]}
          rowLength="8"
          elementTex={(i, h) => `\\mathbf e_{${i + 2},${h}}^{(256)}`}
          elementColumns={["1", "2", "\\cdots", "8"]}
          headerLineHeight={2.4}
        />
      </div>
    </div>
  );
}
