import {
  Box,
  COLORS,
  BranchFrame,
  ExpandedVector,
  MathFormula,
  ModuleHeading,
  Operator,
  StructureEllipsis,
  SumJunction,
  VectorStrip,
} from "./diagram-primitives";
import { normalizedExponentialTex } from "./exponential-notation";
import { frameColor } from "./diagram-appearance";

export function CompressorPending({ layer }: { layer: number }) {
  return (
    <div
      data-compressor-pending
      style={{
        justifySelf: "center",
        display: "grid",
        gap: 7,
        padding: 8,
        border: `1px solid ${frameColor(COLORS.amber)}`,
        borderRadius: 7,
        fontSize: 12,
      }}
    >
      <strong>全局压缩组 · 两步凑齐，区别于每步更新的 U</strong>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "max-content 24px max-content",
          justifyContent: "center",
          alignItems: "center",
          gap: 5,
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 4,
            justifyItems: "center",
          }}
        >
          <MathFormula tex="t=2i-1" />
          <small>暂存；G / Key 不追加</small>
          <div style={{ display: "flex", gap: 4 }}>
            <Box tone="green">
              <MathFormula tex={`\\mathbf v^c_{${layer},2i-1}`} />
            </Box>
            <Box tone="plum">
              <MathFormula
                tex={`\\mathbf a^{\\mathrm{gate}}_{${layer},2i-1}`}
              />
            </Box>
          </div>
        </div>
        <Operator tex="\to" />
        <div
          style={{
            display: "grid",
            gap: 4,
            justifyItems: "center",
          }}
        >
          <MathFormula tex="t=2i" />
          <small>读暂存 + 本步新算</small>
          <div style={{ display: "flex", gap: 4 }}>
            <Box tone="green">
              <MathFormula tex={`\\mathbf v^c_{${layer},2i}`} />
            </Box>
            <Box tone="plum">
              <MathFormula tex={`\\mathbf a^{\\mathrm{gate}}_{${layer},2i}`} />
            </Box>
          </div>
        </div>
      </div>
      <span>t=2i 时压缩并追加；未满组只读旧 G。</span>
    </div>
  );
}

/** 两行逐列归一化、逐元素加权与汇合；各 Full 层共用同一结构。 */
export function CompressorWeights({ layer }: { layer: number }) {
  return (
    <>
      <ModuleHeading>压缩权重 α · 同列两个分数归一化</ModuleHeading>
      <div data-compressor-gate-origin>
        第 i 组：token 2i−1、2i · 每列权重之和为 1
      </div>
      <div
        data-compressor-gate-columns
        style={{
          display: "grid",
          gridTemplateColumns: "max-content max-content 20px max-content",
          gap: 10,
          justifyContent: "center",
          alignItems: "stretch",
        }}
      >
        {["1", "2", "\\cdots", "512"].map((d) =>
          d === "\\cdots" ? (
            <StructureEllipsis key={d} />
          ) : (
            <div key={d} data-compressor-gate-column={d}>
              <BranchFrame title={`第 ${d} 列 · Softmax`}>
                <div style={{ display: "grid", gap: 10 }}>
                  {[1, 2].map((row) => (
                    <div
                      key={row}
                      data-compressor-normalized-weight={row}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <Box tone="amber">
                          <MathFormula
                            tex={`\\alpha_{${layer},i,${row},${d}}`}
                          />
                        </Box>
                        <Operator tex="=" />
                      </div>
                      <MathFormula
                        tex={normalizedExponentialTex(
                          [
                            `a^{\\mathrm{gate}}_{${layer},2i-1,${d}}`,
                            `a^{\\mathrm{gate}}_{${layer},2i,${d}}`,
                          ],
                          row - 1,
                        )}
                      />
                    </div>
                  ))}
                </div>
              </BranchFrame>
            </div>
          ),
        )}
      </div>
    </>
  );
}

export function CompressorPooling({ layer }: { layer: number }) {
  const token = (row: number) => (row === 1 ? "2i-1" : "2i");
  return (
    <>
      <ModuleHeading>权重 ⊙ 候选内容 · 同列相乘，两行相加</ModuleHeading>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2,minmax(max-content,1fr))",
          alignItems: "start",
          gap: 12,
        }}
      >
        {[1, 2].map((row) => (
          <div key={row} data-compressor-weighted-row={row}>
            <BranchFrame title={`token ${row === 1 ? "2i−1" : "2i"}`}>
              <div data-compressor-weight-role>
                <ExpandedVector
                  title="压缩权重"
                  name={`\\boldsymbol\\alpha_{${layer},i,${row}}`}
                  length="512"
                  tone="amber"
                  elementTex={(d) => `\\alpha_{${layer},i,${row},${d}}`}
                />
              </div>
              <Operator tex="\odot" />
              <div data-compressor-content-role>
                <ExpandedVector
                  title="候选 KV 内容"
                  name={`\\mathbf v^c_{${layer},${token(row)}}`}
                  length="512"
                  tone="green"
                  elementTex={(d) => `v^c_{${layer},${token(row)},${d}}`}
                />
              </div>
              <Operator tex="=" />
              <div data-compressor-product style={{ justifySelf: "center" }}>
                <VectorStrip
                  name=""
                  nameWidth={0}
                  length="512"
                  tone="green"
                  uniformCells
                  cellPadding={4}
                  elementTex={(d) =>
                    `\\alpha_{${layer},i,${row},${d}}\\cdot v^c_{${layer},${token(row)},${d}}`
                  }
                />
              </div>
            </BranchFrame>
          </div>
        ))}
      </div>
      <SumJunction
        count={2}
        sourceSelector="[data-compressor-product]"
        targetSelector="[data-compressor-pool-result] [data-expanded-tensor]"
      />
      <div
        data-compressor-pool-result
        style={{
          width: "fit-content",
          justifySelf: "center",
          display: "grid",
          justifyItems: "center",
          gap: 4,
        }}
      >
        <ExpandedVector
          name={`\\widehat{\\mathbf g}_{${layer},i}`}
          length="512"
          tone="green"
          elementTex={(d) => `\\widehat g_{${layer},i,${d}}`}
        />
        <MathFormula
          tex={`\\widehat g_{${layer},i,d}=\\alpha_{${layer},i,1,d}\\cdot v^c_{${layer},2i-1,d}+\\alpha_{${layer},i,2,d}\\cdot v^c_{${layer},2i,d}`}
        />
      </div>
    </>
  );
}
