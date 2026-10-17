import { frameColor } from "./diagram-appearance";
import {
  Box,
  COLORS,
  MathFormula as M,
  MatrixEllipsis,
  Operator,
  RowMatrix,
  TensorHeading,
  VectorStrip,
  matrixColumnTracks,
} from "./diagram-primitives";
import { HorizontalTransfer } from "./HorizontalTransfer";

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
          border: `1px solid ${frameColor(COLORS.indigo)}`,
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
            gap: 4,
          }}
        >
          {[
            "0",
            "b_{2,1}",
            "b_{2,2}",
            "\\vdots",
            "b_{4,8}",
            String(rows - 1),
          ].map((index, i) =>
            index === "\\vdots" ? (
              <MatrixEllipsis key={index} columns={columns} />
            ) : (
              <VectorStrip
                key={index}
                name={index}
                nameWidth={88}
                length={last}
                elementTex={(j) =>
                  scale ? `s_{${index},${j}}` : `\\bar e_{${index},${j}}`
                }
                selected={i === 1 || i === 2 || i === 4}
                tone={scale ? "ochre" : "indigo"}
                uniformCells
                columnSubgrid
                compact
              />
            ),
          )}
        </div>
      </div>
      <small>
        {scale
          ? "每行 8 个系数 · 每个系数对应 32 列"
          : "按 24 个哈希地址读取 · 桶地址从 0 开始"}
      </small>
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
        gridTemplateColumns: "max-content 52px max-content 52px max-content",
        gap: 10,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "grid", gap: 16 }}>
        <StoredTable layer={layer} rows={rows} />
        <StoredTable layer={layer} rows={rows} scale />
      </div>
      <div />
      <div
        data-engram-dequantization
        style={{ display: "grid", gap: 8, justifyItems: "center" }}
      >
        <strong>反量化 · 24 行分别执行</strong>
        <M tex="b=b_{n,h},\quad n\in\{2,3,4\},\ h=1,\ldots,8" />
        <div
          style={{
            display: "grid",
            gap: 4,
            justifyItems: "start",
            width: "100%",
          }}
        >
          <small>同一行号 b · 读取数值</small>
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
          <small>同一行号 b · 读取系数</small>
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
        <small>转为 FP32 · 每块 32 个数乘同一个系数</small>
        <div style={{ display: "grid", gap: 6 }}>
          {[1, 2, 8].map((k) => (
            <div key={k}>
              {k === 8 && (
                <div style={{ textAlign: "center" }}>
                  <M tex="\vdots" />
                </div>
              )}
              <div
                data-dequant-block={k}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "max-content 20px max-content 20px max-content",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                <Box tone="ochre">
                  <M tex={`s_{b,${k}}`} />
                </Box>
                <Operator tex="\times" />
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
                <Operator tex="=" />
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
                    elementTex={(d) => `\\hat e_{n,h,${d}}`}
                    tone="green"
                    uniformCells
                    compact
                  />
                </Box>
              </div>
            </div>
          ))}
        </div>
        <small>8 块按原列序组成一行 · 转为 BF16</small>
        <div data-dequant-output>
          <Box tone="green" expanded>
            <TensorHeading name="\mathbf e_{n,h}" shape="1\times256" />
            <VectorStrip
              name=""
              nameWidth={0}
              length="256"
              elementTex={(d) => `e_{n,h,${d}}`}
              tone="green"
              uniformCells
              compact
            />
          </Box>
        </div>
      </div>
      <div />
      <div data-engram-read-result style={{ display: "grid", gap: 4 }}>
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
      <HorizontalTransfer
        sourceSelector="[data-engram-table]"
        color={COLORS.indigo}
        targetSelector="[data-dequant-values] [data-expanded-tensor]"
        leftSelector="[data-engram-table]"
        rightSelector="[data-engram-dequantization]"
      />
      <HorizontalTransfer
        sourceSelector="[data-engram-scale-table]"
        color={COLORS.ochre}
        targetSelector="[data-dequant-scales] [data-expanded-tensor]"
        leftSelector="[data-engram-scale-table]"
        rightSelector="[data-engram-dequantization]"
      />
      <HorizontalTransfer
        sourceSelector="[data-dequant-output] [data-expanded-tensor]"
        targetSelector="[data-engram-read-result] [data-expanded-tensor]"
        leftSelector="[data-engram-dequantization]"
        rightSelector="[data-engram-read-result]"
      />
    </div>
  );
}
