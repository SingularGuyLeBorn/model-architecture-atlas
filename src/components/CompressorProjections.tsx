import {
  Box,
  COMPRESSION_TONES,
  BranchFrame,
  MathFormula,
  Operator,
  ParameterColumn,
  RowMatrix,
  TensorHeading,
  VectorStrip,
} from "./diagram-primitives";

/** 完整矩阵得到整行；单列只得到一个元素。两条投影读取同一输入。 */
export function CompressorProjections({
  layer,
  ratio,
}: {
  layer: number;
  ratio: 1 | 2;
}) {
  const branches = ratio === 2 ? (["kv", "gate"] as const) : (["kv"] as const);
  return (
    <section data-compressor-projections style={{ display: "grid", gap: 10 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${branches.length},minmax(0,1fr))`,
          gap: 16,
          alignItems: "start",
        }}
      >
        {branches.map((branch) => {
          const sup = branch === "kv" ? "KV,G" : "\\mathrm{gate}";
          const scalar = branch === "kv" ? "v" : "a";
          const resultSup = branch === "kv" ? "c" : "\\mathrm{gate}";
          const output = `\\mathbf ${scalar}_{${layer},t}^{${resultSup}}`;
          const parameterTone =
            branch === "kv" ? "indigo" : COMPRESSION_TONES.gateParameter;
          const resultTone =
            branch === "kv"
              ? COMPRESSION_TONES.candidate
              : COMPRESSION_TONES.gateScore;
          return (
            <section
              key={branch}
              data-compressor-projection={branch}
              style={{ display: "grid", gap: 8, minWidth: 0 }}
            >
              <BranchFrame
                title={
                  branch === "kv" ? "全局 KV 投影 · 独立参数" : "Gate 分数投影"
                }
              >
                <div
                  data-compressor-projection-equation
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "max-content 24px max-content 24px max-content",
                    gap: 6,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div data-projection-input>
                    <div
                      data-tensor-origin="activation"
                      style={{ textAlign: "center", marginBottom: 4 }}
                    >
                      上游计算结果
                    </div>
                    <RowMatrix
                      tex={`\\mathbf x_{${layer},t}`}
                      shape="1\times5120"
                      rows={[`\\mathbf x_{${layer},t}`]}
                      rowLength="5120"
                      tone="blue"
                      elementTex={(_, d) => `x_{${layer},t,${d}}`}
                    />
                  </div>
                  <Operator tex="\times" />
                  <div data-projection-weight>
                    <div
                      data-tensor-origin="independent-parameter"
                      style={{ textAlign: "center", marginBottom: 4 }}
                    >
                      本层独立参数
                    </div>
                    <Box tone={parameterTone} expanded>
                      <TensorHeading
                        name={`W_{${layer}}^{${sup}}`}
                        shape="5120\times512"
                      />
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "max-content max-content 20px max-content",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {["1", "2", "\\cdots", "512"].map((j) =>
                          j === "\\cdots" ? (
                            <MathFormula key={j} tex={j} />
                          ) : (
                            <ParameterColumn
                              key={j}
                              tone={parameterTone}
                              tex={`\\mathbf w_{${layer},${j}}^{${sup}}`}
                            />
                          ),
                        )}
                      </div>
                    </Box>
                  </div>
                  <Operator tex="=" />
                  <div data-projection-output>
                    <div
                      data-tensor-origin="activation"
                      style={{ textAlign: "center", marginBottom: 4 }}
                    >
                      <strong data-compressor-output-role={branch}>
                        {branch === "kv" ? "候选 KV 内容" : "Gate 原始分数"}
                      </strong>
                    </div>
                    <Box tone={resultTone} expanded>
                      <TensorHeading name={output} shape="1\times512" />
                      <VectorStrip
                        name=""
                        nameWidth={0}
                        length="512"
                        compact
                        tone={resultTone}
                        elementTex={(j) =>
                          `${scalar}_{${layer},t,${j}}^{${resultSup}}`
                        }
                      />
                    </Box>
                  </div>
                </div>
              </BranchFrame>
            </section>
          );
        })}
      </div>
    </section>
  );
}
