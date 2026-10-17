import { frameColor } from "./diagram-appearance";
import {
  Box,
  COLORS,
  MathFormula as M,
  MatrixEllipsis,
  TensorHeading,
  VectorStrip,
  matrixColumnTracks,
} from "./diagram-primitives";
import { EngramRowDequantization } from "./EngramRowDequantization";

export const ENGRAM_ADDRESS_ROWS = [
  "0",
  "b_{2,1}",
  "b_{2,2}",
  "dots2",
  "b_{2,8}",
  "b_{3,1}",
  "b_{3,2}",
  "dots3",
  "b_{3,8}",
  "b_{4,1}",
  "b_{4,2}",
  "dots4",
  "b_{4,8}",
  "last",
];

// 固定版本 ParallelEngramEmbedding：FP8 值与 scale 同行读取，每 32 个元素共用一个 scale。
// https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/5254448103b6254fc646dacbca1cbbf20e9216c1/inference/model.py
function StoredTable({
  layer,
  rows,
  scale = false,
}: {
  layer: number;
  rows: number;
  scale?: boolean;
}) {
  const last = scale ? "8" : "256";
  const columns = ["1", "2", "\\cdots", last];
  return (
    <div style={{ display: "grid", gap: 4, justifyItems: "center" }}>
      <strong>
        {scale ? "对应缩放系数 · 随权重存储" : "本层参数表 · FP8 数值"}
      </strong>
      <div
        data-engram-table={!scale || undefined}
        data-engram-scale-table={scale || undefined}
        style={{
          width: "max-content",
          border: `1px solid ${frameColor(scale ? COLORS.ochre : COLORS.indigo)}`,
          borderRadius: 8,
          padding: 9,
          display: "grid",
          gap: 5,
        }}
      >
        <TensorHeading
          name={scale ? `S_{${layer}}^E` : `E_{${layer}}^{\\mathrm{FP8}}`}
          shape={`${rows}\\times${last}`}
        />
        <div
          data-uniform-matrix
          style={{
            display: "grid",
            gridTemplateColumns: matrixColumnTracks(columns, "88px"),
            gridAutoRows: "34px",
            alignItems: "center",
            gap: 4,
          }}
        >
          {ENGRAM_ADDRESS_ROWS.map((row) => {
            const index = row === "last" ? String(rows - 1) : row;
            return row.startsWith("dots") ? (
              <MatrixEllipsis key={row} columns={columns} />
            ) : (
              <div
                key={row}
                data-engram-row={`${scale ? "scale" : "fp8"}:${index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "subgrid",
                  gridColumn: "1 / -1",
                }}
              >
                <VectorStrip
                  name={index}
                  nameWidth={88}
                  length={last}
                  elementTex={(j) =>
                    scale ? `s_{${index},${j}}` : `\\bar e_{${index},${j}}`
                  }
                  selected={index.startsWith("b_")}
                  selectionStyle="amber"
                  tone={scale ? "ochre" : "indigo"}
                  uniformCells
                  columnSubgrid
                  compact
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 双表同行读取 → 代表行分块缩放 → 原列序还原 → 24 行检索结果。 */
export function EngramDequantization({
  layer,
  rows,
}: {
  layer: number;
  rows: number;
}) {
  return (
    <div
      data-engram-read-layout
      style={{
        position: "relative",
        display: "grid",
        gap: 36,
        justifyContent: "center",
      }}
    >
      <div
        data-engram-table-pair
        style={{
          display: "grid",
          gridTemplateColumns: "max-content 64px max-content 64px max-content",
          alignItems: "start",
          justifyContent: "center",
        }}
      >
        <StoredTable layer={layer} rows={rows} />
        <div />
        <div
          style={{
            display: "grid",
            gap: 4,
            justifyItems: "center",
            paddingTop: 38,
          }}
        >
          <div style={{ height: 17 }} />
          <div
            data-engram-addresses
            style={{
              border: `1px solid ${frameColor(COLORS.amber)}`,
              borderRadius: 8,
              padding: 9,
              display: "grid",
              gap: 5,
            }}
          >
            <TensorHeading name={`\\mathbf b_{${layer},t}`} shape="24\times1" />
            <div
              style={{
                display: "grid",
                gridAutoRows: "34px",
                gap: 4,
                justifyItems: "center",
                alignItems: "center",
              }}
            >
              {ENGRAM_ADDRESS_ROWS.filter(
                (index) => index !== "0" && index !== "last",
              ).map((index) => (
                <div key={index}>
                  {index.startsWith("b_") ? (
                    <div data-engram-index={index}>
                      <Box tone="amber">
                        <M tex={index} />
                      </Box>
                    </div>
                  ) : index.startsWith("dots") ? (
                    <M tex="\vdots" />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <small>
            沿行拼接 · 行号不变
            <br />
            同一行号 → 左右两行
          </small>
        </div>
        <div />
        <StoredTable layer={layer} rows={rows} scale />
      </div>
      <EngramRowDequantization layer={layer} />
    </div>
  );
}
