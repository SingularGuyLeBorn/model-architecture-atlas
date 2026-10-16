import {
  Box,
  MathFormula,
  ModuleHeading,
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
      <div>
        <MathFormula tex={`X_{${layer}}`} /> 的第 t 行分别乘训练得到的参数矩阵。
        {ratio === 2
          ? "两条投影并行，读取同一个输入；此处仍逐 token 输出，尚未合并两行。"
          : "压缩比 1：只有 KV 投影，没有 gate 分支。"}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${branches.length},minmax(0,1fr))`,
          gap: 16,
          alignItems: "start",
        }}
      >
        {branches.map((branch) => {
          const sup = branch === "kv" ? "KV,c" : "\\mathrm{gate}";
          const scalar = branch === "kv" ? "v" : "a";
          const resultSup = branch === "kv" ? "c" : "\\mathrm{gate}";
          const output = `\\mathbf ${scalar}_{${layer},t}^{${resultSup}}`;
          return (
            <section
              key={branch}
              data-compressor-projection={branch}
              style={{ display: "grid", gap: 8, minWidth: 0 }}
            >
              <ModuleHeading>
                {branch === "kv" ? "KV 候选投影" : "Gate 分数投影"}
              </ModuleHeading>
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
                  <Box tone="indigo" expanded>
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
                            tex={`\\mathbf w_{${layer},${j}}^{${sup}}`}
                          />
                        ),
                      )}
                    </div>
                  </Box>
                </div>
                <Operator tex="=" />
                <div data-projection-output>
                  <Box tone={branch === "kv" ? "green" : "amber"} expanded>
                    <TensorHeading name={output} shape="1\times512" />
                    <VectorStrip
                      name=""
                      nameWidth={0}
                      length="512"
                      compact
                      tone={branch === "kv" ? "green" : "amber"}
                      elementTex={(j) =>
                        `${scalar}_{${layer},t,${j}}^{${resultSup}}`
                      }
                    />
                  </Box>
                </div>
              </div>
              <div data-projection-column-definition>
                每个 w 框代表 W 的一整列（5120 个元素）：
                <MathFormula
                  tex={`(\\mathbf w_{${layer},j}^{${sup}})_d:=(W_{${layer}}^{${sup}})_{d,j}`}
                />
              </div>
              <div
                data-projection-scalar-examples
                style={{ display: "grid", gap: 5, justifyItems: "center" }}
              >
                {["1", "2", "512"].map((j, index) => (
                  <div key={j} style={{ textAlign: "center" }}>
                    {index === 2 && (
                      <div>
                        <MathFormula tex="\vdots" />
                      </div>
                    )}
                    <MathFormula
                      tex={`\\mathbf x_{${layer},t}\\times\\mathbf w_{${layer},${j}}^{${sup}}=${scalar}_{${layer},t,${j}}^{${resultSup}}\\in\\mathbb R`}
                    />
                  </div>
                ))}
              </div>
              <div style={{ textAlign: "center" }}>
                一列得到一个标量；全部 512 列得到上方 512 维输出行。
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
