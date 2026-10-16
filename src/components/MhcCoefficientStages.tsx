import {
  Box,
  COLORS,
  FeatureVector,
  MathFormula,
  Operator,
  RowMatrix,
  StackedSum,
  SumJunction,
  TensorHeading,
  VectorStrip,
  type DiagramTone,
} from "./diagram-primitives";
import type { ReactNode } from "react";

const copies = [1, 2, 3, 4];
const grid4 = {
  display: "grid",
  gridTemplateColumns: "repeat(4,minmax(0,1fr))",
  gap: 8,
};
const group = {
  border: `1px solid ${COLORS.line}`,
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 10,
  minWidth: 0,
};
const row = { display: "flex", alignItems: "center", gap: 8, minWidth: 0 };

export function MhcFlatten({ layer, stage }: { layer: number; stage: string }) {
  return (
    <section data-mhc-flatten style={group}>
      <strong>① 输入：同一 token t 的四路残差，每路 5120 个数</strong>
      <div data-four-stream-row style={grid4}>
        {copies.map((c) => (
          <div key={c} style={{ display: "grid", gap: 6 }}>
            <FeatureVector
              name={`\\mathbf h_{${layer},${c},t}^{${stage}}`}
              scalar={(d) => `h_{${c},${d}}`}
            />
            <Operator tex="\downarrow" />
          </div>
        ))}
      </div>
      <TensorHeading name="\mathbf f_t" shape="1\times20480" />
      <div
        data-mhc-concat-segments
        style={{
          ...grid4,
          border: `1px solid ${COLORS.blue}`,
          borderRadius: 8,
          padding: 8,
          background: COLORS.blueSoft,
        }}
      >
        {copies.map((c) => (
          <div
            key={c}
            style={{
              borderLeft: c === 1 ? undefined : `2px solid ${COLORS.blue}`,
              paddingLeft: c === 1 ? 0 : 8,
              display: "grid",
              gap: 8,
            }}
          >
            <strong>
              路 {c} → 位置 {(c - 1) * 5120 + 1}–{c * 5120}
            </strong>
            <VectorStrip
              name=""
              nameWidth={0}
              length="5120"
              elementTex={(d) => `h_{${c},${d}}`}
              tone="blue"
            />
            <VectorStrip
              name=""
              nameWidth={0}
              length="5120"
              elementTex={(d) => `f_{t,${Number(d) + (c - 1) * 5120}}`}
              tone="blue"
            />
          </div>
        ))}
      </div>
      <span>
        按路 1、2、3、4 首尾接成一行；只拼接每路的元素，不拼接不同 token。图内 h
        的元素省略共同层号、t 与阶段上标。
      </span>
      <MathFormula tex="f_{t,(c-1)5120+d}=h_{c,d},\quad c=1,2,3,4,\ d=1,\ldots,5120" />
    </section>
  );
}

export function MhcJointNorm() {
  const columns = ["1", "2", "20480"];
  return (
    <section data-mhc-joint-norm data-rmsnorm-dimension="20480" style={group}>
      <strong>② 四路一起算一个均方根 rₜ，再让每个 f 元素除以同一个 rₜ</strong>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 32px minmax(0,1fr)",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,minmax(0,1fr))",
              gap: 10,
            }}
          >
            {columns.map((d) => (
              <div key={d} style={{ display: "grid", gap: 6 }}>
                <Box tone="blue">
                  <MathFormula tex={`f_{t,${d}}`} />
                </Box>
                <Operator tex="\downarrow\;(\cdot)^2" />
                <Box tone="cyan">
                  <MathFormula tex={`f_{t,${d}}^2`} />
                </Box>
              </div>
            ))}
          </div>
          <span>中间元素同样参与：共 20480 个平方项</span>
          <SumJunction count={3} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 22px 1fr 22px 1fr",
              gap: 6,
              alignItems: "center",
            }}
          >
            <Box tone="cyan">
              <MathFormula tex="\sum_{d=1}^{20480}f_{t,d}^2" />
            </Box>
            <Operator tex="\div" />
            <Box tone="neutral">20480</Box>
            <Operator tex="=" />
            <Box tone="cyan">
              <MathFormula tex="m_t" />
            </Box>
          </div>
          <div style={{ ...row, justifyContent: "center" }}>
            <MathFormula tex="m_t" />
            <Operator tex="+" />
            <MathFormula tex="\varepsilon" />
            <Operator tex="\xrightarrow{\sqrt{\ \ }}" />
            <Box tone="cyan">
              <MathFormula tex="r_t" />
            </Box>
          </div>
        </div>
        <Operator tex="\to" />
        <div style={{ display: "grid", gap: 10 }}>
          <strong>同一个分母，分别用于 20480 个除法</strong>
          {columns.map((d) => (
            <div
              key={d}
              data-mhc-normalized-element
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 20px 1fr 20px 1fr",
                gap: 6,
                alignItems: "center",
              }}
            >
              <Box tone="blue">
                <MathFormula tex={`f_{t,${d}}`} />
              </Box>
              <Operator tex="\div" />
              <Box tone="cyan">
                <MathFormula tex="r_t" />
              </Box>
              <Operator tex="=" />
              <Box tone="blue">
                <MathFormula tex={`\\bar f_{t,${d}}`} />
              </Box>
            </div>
          ))}
          <TensorHeading name="\bar{\mathbf f}_t" shape="1\times20480" />
          <VectorStrip
            name=""
            nameWidth={0}
            length="20480"
            elementTex={(d) => `\\bar f_{t,${d}}`}
            tone="blue"
          />
          <span>没有可学习的 γ。此处 ε = 10⁻²⁰；不另起 z、y 名称。</span>
        </div>
      </div>
    </section>
  );
}

export function MhcProjection({
  layer,
  sub,
}: {
  layer: number;
  sub: "A" | "F";
}) {
  return (
    <section data-mhc-projection style={group}>
      <strong>③ 归一化后的整行 × 本子层参数 → 24 个控制数</strong>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(0,1fr) 24px minmax(0,1fr) 24px minmax(0,1fr)",
          gap: 8,
          alignItems: "center",
        }}
      >
        <RowMatrix
          tex="\bar{\mathbf f}_t"
          shape="1\times20480"
          rows={["\\bar{\\mathbf f}_t"]}
          rowLength="20480"
          elementTex={(_, d) => `\\bar f_{t,${d}}`}
          tone="blue"
        />
        <Operator tex="\times" />
        <Box tone="amber">
          <TensorHeading
            name={`W_{${layer}}^{HC,${sub}}`}
            shape="20480\times24"
          />
          <div style={grid4}>
            {["1", "2", "\\cdots", "24"].map((j) =>
              j === "\\cdots" ? (
                <MathFormula key={j} tex={j} />
              ) : (
                <div
                  key={j}
                  style={{
                    border: `1px solid ${COLORS.amber}`,
                    padding: "16px 6px",
                    borderRadius: 6,
                  }}
                >
                  <MathFormula tex={`\\mathbf w_${j}`} />
                </div>
              ),
            )}
          </div>
        </Box>
        <Operator tex="=" />
        <RowMatrix
          tex={`\\mathbf u_{${layer},t}^{${sub}}`}
          shape="1\times24"
          rows={["\\mathbf u"]}
          rowLength="24"
          elementTex={(_, d) => `u_{${d}}`}
        />
      </div>
      <div
        data-mhc-u-segments
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 16 }}
      >
        {[
          [1, 4, "下一子层汇合 p"],
          [5, 8, "当前子层回写 q"],
          [9, 24, "当前子层残差混合 C"],
        ].map(([start, end, title]) => (
          <div
            key={start}
            style={{
              border: `2px solid ${COLORS.green}`,
              borderRadius: 9,
              padding: 10,
              display: "grid",
              gap: 8,
            }}
          >
            <strong>
              u 的第 {start}–{end} 个数 → {title}
            </strong>
            <VectorStrip
              name=""
              nameWidth={0}
              length={String(end)}
              columns={
                start === 9
                  ? ["9", "10", "\\cdots", "24"]
                  : Array.from({ length: 4 }, (_, i) =>
                      String(Number(start) + i),
                    )
              }
              elementTex={(d) => `u_{${d}}`}
              tone="green"
            />
          </div>
        ))}
      </div>
      <span>
        三段同时计算，各自使用缩放 s₁ / s₂ / s₃ 和对应偏置 b。u
        的元素仍沿用同一绿色。
      </span>
    </section>
  );
}

export function MhcGate({
  kind,
  children,
}: {
  kind: "p" | "q";
  children: ReactNode;
}) {
  const offset = kind === "p" ? 0 : 4,
    s = kind === "p" ? 1 : 2;
  return (
    <section
      data-mhc-gate={kind}
      style={{
        ...group,
        borderColor: kind === "p" ? COLORS.green : COLORS.rose,
      }}
    >
      <strong>
        {kind === "p"
          ? "p · 第 1–4 个数，供下一子层汇合"
          : "q · 第 5–8 个数，控制本子层输出写回多少"}
      </strong>
      <div style={{ display: "grid", gap: 7 }}>
        {copies.map((j) => (
          <div
            key={j}
            data-mhc-affine-row
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 18px 1fr 18px 1fr 18px 1fr",
              gap: 4,
              alignItems: "center",
            }}
          >
            <Box tone="green">
              <MathFormula tex={`u_{${offset + j}}`} />
            </Box>
            <Operator tex="\times" />
            <Box tone="amber">
              <MathFormula tex={`s_${s}`} />
            </Box>
            <Operator tex="+" />
            <Box tone="amber">
              <MathFormula tex={`b_{${offset + j}}`} />
            </Box>
            <Operator tex="=" />
            <Box tone="amber">
              <MathFormula tex={`a^{${kind}}_${j}`} />
            </Box>
          </div>
        ))}
      </div>
      <span>
        a 是缩放、加偏置之后的中间值；上标区分两段，避免两个 a₁ 混淆。
      </span>
      <div style={{ ...grid4, gap: 6 }}>
        {copies.map((j) => (
          <div key={j} style={{ display: "grid", gap: 6, textAlign: "center" }}>
            <MathFormula tex={`a^{${kind}}_${j}`} />
            <Operator tex="\downarrow\;\sigma" />
            <Box tone="cyan">
              <MathFormula tex={`v^{${kind}}_${j}`} />
            </Box>
            <Operator
              tex={
                kind === "p"
                  ? "\\downarrow\\; +\\epsilon_{HC}"
                  : "\\downarrow\\;\\times 2"
              }
            />
            <Box tone={kind === "p" ? "green" : "rose"}>
              <MathFormula tex={`${kind}_${j}`} />
            </Box>
          </div>
        ))}
      </div>
      <span>
        {kind === "p"
          ? "每个 sigmoid 结果加 10⁻⁶，保持正值。"
          : "每个 sigmoid 结果明确乘以 2，结果范围为 (0, 2)；2 不是次数或维度。"}
      </span>
      {children}
    </section>
  );
}

export function SigmoidSteps() {
  return (
    <div data-mhc-sigmoid style={{ ...group, gap: 8 }}>
      <strong>两条分支都使用同一个 σ：对每个 a 单独做以下运算</strong>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 75px 1fr 75px 1fr 75px 1fr 75px 1fr",
          gap: 6,
          alignItems: "center",
        }}
      >
        <Box tone="amber">
          <MathFormula tex="a" />
        </Box>
        <Operator tex="\xrightarrow{\times(-1)}" />
        <Box tone="amber">
          <MathFormula tex="-a" />
        </Box>
        <Operator tex="\xrightarrow{\exp}" />
        <Box tone="cyan">
          <MathFormula tex="e^{-a}" />
        </Box>
        <Operator tex="\xrightarrow{+1}" />
        <Box tone="cyan">
          <MathFormula tex="1+e^{-a}" />
        </Box>
        <Operator tex="\xrightarrow{1\div}" />
        <Box tone="cyan">
          <MathFormula tex="v=\sigma(a)" />
        </Box>
      </div>
    </div>
  );
}

function Grid4({
  name,
  cell,
  tone = "violet",
}: {
  name: string;
  cell: (k: number, j: number) => string;
  tone?: DiagramTone;
}) {
  return (
    <Box tone={tone}>
      <TensorHeading name={name} shape="4\times4" />
      <div data-mhc-four-matrix style={{ ...grid4, gap: 4 }}>
        {copies.flatMap((k) =>
          copies.map((j) => (
            <Box key={`${k}-${j}`} tone={tone}>
              <MathFormula tex={cell(k, j)} />
            </Box>
          )),
        )}
      </div>
    </Box>
  );
}

export function MhcSinkhorn({ children }: { children: ReactNode }) {
  return (
    <section data-mhc-sinkhorn style={{ ...group, borderColor: COLORS.violet }}>
      <strong>C · u 的第 9–24 个数，按顺序每四个排成一行</strong>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 25px 55px 25px 1fr 25px 1fr",
          gap: 8,
          alignItems: "center",
        }}
      >
        <Grid4
          name="U^C"
          cell={(k, j) => `u_{${8 + 4 * (k - 1) + j}}`}
          tone="green"
        />
        <Operator tex="\times" />
        <Box tone="amber">
          <MathFormula tex="s_3" />
        </Box>
        <Operator tex="+" />
        <Grid4
          name="B^C"
          cell={(k, j) => `b_{${8 + 4 * (k - 1) + j}}`}
          tone="amber"
        />
        <Operator tex="=" />
        <Grid4 name="A^C" cell={(k, j) => `a^C_{${k}${j}}`} tone="amber" />
      </div>
      <span>
        Uᶜ、Bᶜ 是这 16 个数及对应偏置的 4×4 排列；aᶜₖⱼ = s₃·u₈₊₄₍ₖ₋₁₎₊ⱼ +
        b₈₊₄₍ₖ₋₁₎₊ⱼ。行 k 是来源路，列 j 是目标路。
      </span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 32px 1fr",
          gap: 12,
          alignItems: "start",
        }}
      >
        <section data-mhc-row-normalize style={group}>
          <strong>① 每行单独做 Softmax · 展开第 1 行</strong>
          <VectorStrip
            name=""
            nameWidth={0}
            columns={["1", "2", "3", "4"]}
            length="4"
            elementTex={(j) => `a^C_{1${j}}`}
            tone="amber"
          />
          <span>先减去本行最大值 m₁，避免指数溢出</span>
          <div style={grid4}>
            {copies.map((j) => (
              <div key={j} style={{ display: "grid", gap: 5 }}>
                <Operator tex="\downarrow\; -m_1" />
                <Box tone="amber">
                  <MathFormula tex={`a^C_{1${j}}-m_1`} />
                </Box>
                <Operator tex="\downarrow\;\exp" />
                <Box tone="violet">
                  <MathFormula tex={`e_{1${j}}`} />
                </Box>
              </div>
            ))}
          </div>
          <SumJunction count={4} />
          <Box tone="violet">
            <MathFormula tex="d_1=e_{11}+e_{12}+e_{13}+e_{14}" />
          </Box>
          <div style={grid4}>
            {copies.map((j) => (
              <div key={j} style={{ display: "grid", gap: 5 }}>
                <MathFormula tex={`e_{1${j}}\\div d_1`} />
                <Operator tex="\downarrow\; +\epsilon_{HC}" />
                <Box tone="violet">
                  <MathFormula tex={`T_{1${j}}`} />
                </Box>
              </div>
            ))}
          </div>
          <span>第 2、3、4 行各用自己的分母，得到矩阵 T。</span>
        </section>
        <div style={{ alignSelf: "center" }}>
          <Operator tex="\to" />
        </div>
        <section data-mhc-column-normalize style={group}>
          <strong>② 每列分别除以本列之和 · 展开第 1 列</strong>
          <StackedSum>
            {copies.map((k) => (
              <Box key={k} tone="violet">
                <MathFormula tex={`T_{${k}1}`} />
              </Box>
            ))}
          </StackedSum>
          <Operator tex="\downarrow\; +\epsilon_{HC}" />
          <Box tone="violet">
            <MathFormula tex="d^{col}_1=T_{11}+T_{21}+T_{31}+T_{41}+\epsilon_{HC}" />
          </Box>
          {copies.map((k) => (
            <div
              key={k}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 20px 1fr 20px 1fr",
                gap: 4,
                alignItems: "center",
              }}
            >
              <Box tone="violet">
                <MathFormula tex={`T_{${k}1}`} />
              </Box>
              <Operator tex="\div" />
              <MathFormula tex="d^{col}_1" />
              <Operator tex="=" />
              <Box tone="violet">
                <MathFormula tex={`C^{(1)}_{${k}1}`} />
              </Box>
            </div>
          ))}
          <span>第 2、3、4 列各用自己的分母。</span>
        </section>
      </div>
      <div
        data-mhc-sinkhorn-loop
        style={{
          ...group,
          borderStyle: "dashed",
          gridTemplateColumns: "1fr 30px 1fr 30px 1fr",
          alignItems: "center",
        }}
      >
        <Grid4 name="C^{(1)}" cell={(k, j) => `c^{(1)}_{${k}${j}}`} />
        <Operator tex="\to" />
        <div style={{ display: "grid", gap: 10 }}>
          <strong>再做 19 轮 · 共 20 轮</strong>
          <div style={row}>
            <span>每行除以该行之和 + ε</span>
            <Operator tex="\to" />
            <span>每列除以该列之和 + ε</span>
          </div>
          <span>
            从第 2 轮起不再取指数；同一个 4×4 矩阵反复调整，行和、列和接近 1。
          </span>
          <MathFormula tex="\epsilon_{HC}=10^{-6}" />
        </div>
        <Operator tex="\to" />
        {children}
      </div>
    </section>
  );
}
