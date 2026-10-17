import {
  Box,
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
      <div data-compressor-parameter-origin>
        <MathFormula tex={`X_{${layer}}`} /> 是上游计算结果，取第 t 行作为输入。
        {ratio === 2
          ? "两份独立参数 Wᴳ 与 Wᵍᵃᵗᵉ；均不同于本地 Wˢᵂᴬ。"
          : "Wᴳ 是独立参数，不是本地 Wˢᵂᴬ；压缩比 1，无 gate。"}
        上标 G 指全局 KV 分支。
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
          const sup = branch === "kv" ? "KV,G" : "\\mathrm{gate}";
          const scalar = branch === "kv" ? "v" : "a";
          const resultSup = branch === "kv" ? "c" : "\\mathrm{gate}";
          const output = `\\mathbf ${scalar}_{${layer},t}^{${resultSup}}`;
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
                    <Box tone="indigo" expanded>
                      <div data-tensor-origin="independent-parameter">
                        独立参数 · 直接加载
                      </div>
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
                    <Box tone={branch === "kv" ? "green" : "plum"} expanded>
                      <div data-tensor-origin="activation">
                        计算结果 · x × W
                      </div>
                      <strong data-compressor-output-role={branch}>
                        {branch === "kv"
                          ? "候选 KV 内容 · 不是压缩权重"
                          : "Gate 原始分数 · 尚未归一化"}
                      </strong>
                      <TensorHeading name={output} shape="1\times512" />
                      <VectorStrip
                        name=""
                        nameWidth={0}
                        length="512"
                        compact
                        tone={branch === "kv" ? "green" : "plum"}
                        elementTex={(j) =>
                          `${scalar}_{${layer},t,${j}}^{${resultSup}}`
                        }
                      />
                    </Box>
                  </div>
                </div>
                <div data-compressor-role-destination>
                  {branch === "kv" ? (
                    <>
                      <MathFormula tex={output} /> 是准备被压缩的 512 维内容；
                      {ratio === 2
                        ? "下方由 α 逐元素加权，再把两行相加。"
                        : "压缩比 1 时直接归一化。"}
                    </>
                  ) : (
                    <>
                      <MathFormula tex={output} />{" "}
                      提供各列的选择分数；同组两行的同一列做
                      Softmax，得到压缩权重 <MathFormula tex="\alpha" />。
                    </>
                  )}
                </div>
                <div data-projection-column-definition>
                  每个 w 框是 W 的一列（5120
                  个元素），属于原参数的切片，不是额外参数：
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
              </BranchFrame>
            </section>
          );
        })}
      </div>
    </section>
  );
}
