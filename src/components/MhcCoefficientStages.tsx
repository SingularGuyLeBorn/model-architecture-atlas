import {
  Box,
  COLORS,
  FeatureVector,
  MathFormula,
  ModuleHeading,
  Operator,
  ParameterColumn,
  RowMatrix,
  StackedSum,
  SumJunction,
  TensorHeading,
  VectorStrip,
  type DiagramTone,
} from "./diagram-primitives";
import type { ReactNode } from "react";

const copies = [1, 2, 3, 4];
// [OM-FREEPLAY] 色相选用琥珀、蓝、梅紫，分别区分缩放参数、偏置参数和仿射结果。
export const MHC_AFFINE_TONES = {
  scale: "amber",
  bias: "blue",
  result: "plum",
} as const;
const grid4 = {
  display: "grid",
  gridTemplateColumns: "repeat(4,minmax(0,1fr))",
  gap: 8,
};
const compact4 = {
  display: "grid",
  gridTemplateColumns: "repeat(4,max-content)",
  gap: 8,
  justifyContent: "center",
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
    <section
      data-mhc-flatten
      style={{
        ...group,
        width: "fit-content",
        maxWidth: "100%",
        justifySelf: "center",
      }}
    >
      <ModuleHeading>
        ① 输入：同一 token t 的四路残差，每路 5120 个数
      </ModuleHeading>
      <div data-notation-alias>
        本段固定 Layer {layer} 与 token t：{" "}
        <MathFormula
          tex={`h_{c,d}:=(\\mathbf h_{${layer},c,t}^{${stage}})_d,\\quad c=1,2,3,4`}
        />
      </div>
      <div
        data-four-stream-row
        style={{ ...compact4, gridTemplateColumns: "repeat(4,240px)" }}
      >
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
        data-expanded-tensor
        style={{
          ...compact4,
          gridTemplateColumns: "repeat(4,240px)",
          border: `1px solid ${COLORS.blue}`,
          borderRadius: 8,
          padding: 8,
          background: "transparent",
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
      <span>将同一 token 的第 1、2、3、4 路向量首尾相接，组成一行。</span>
      <MathFormula tex="f_{t,(c-1)5120+d}=h_{c,d},\quad c=1,2,3,4,\ d=1,\ldots,5120" />
    </section>
  );
}

export function MhcJointNorm() {
  const columns = ["1", "2", "20480"];
  return (
    <section data-mhc-joint-norm data-rmsnorm-dimension="20480" style={group}>
      <ModuleHeading>
        ② 四路一起算一个均方根 rₜ，再让每个 f 元素除以同一个 rₜ
      </ModuleHeading>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 32px minmax(0,1fr)",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 6,
            width: "100%",
            maxWidth: 350,
            justifySelf: "center",
          }}
        >
          <span>共 20480 个平方项，展示第 1、2、末项</span>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,minmax(0,110px))",
              gap: 10,
              justifyContent: "center",
            }}
          >
            {columns.map((d) => (
              <div
                key={d}
                data-mhc-square-element
                style={{ display: "grid", gap: 6 }}
              >
                <Box tone="cyan">
                  <MathFormula tex={`f_{t,${d}}^2`} />
                </Box>
              </div>
            ))}
          </div>
          <SumJunction count={3} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "max-content 22px max-content",
              gap: 6,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Box tone="cyan">
              <MathFormula tex="\frac{\sum_{d=1}^{D}f_{t,d}^2}{D},\quad D=20480" />
            </Box>
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
                gridTemplateColumns: "max-content 20px max-content",
                gap: 6,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Box tone="blue">
                <MathFormula tex={`\\frac{f_{t,${d}}}{r_t}`} />
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
          <span>稳定项 ε = 10⁻²⁰。</span>
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
      <ModuleHeading>③ 归一化后的整行 × 本子层参数 → 24 个控制数</ModuleHeading>
      <div data-notation-alias style={{ display: "grid", gap: 4 }}>
        <span>
          wⱼ 表示参数矩阵第 j 列（20480 个元素）；uⱼ 表示本次投影结果的第 j
          个数：
        </span>
        <MathFormula
          tex={`(\\mathbf w_j)_d:=(W_{${layer}}^{HC,${sub}})_{dj},\\quad u_j:=(\\mathbf u_{${layer},t}^{${sub}})_j`}
        />
      </div>
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
        <Box tone="indigo" expanded>
          <TensorHeading
            name={`W_{${layer}}^{HC,${sub}}`}
            shape="20480\times24"
          />
          <div
            data-mhc-parameter-columns
            style={{ ...compact4, gap: 8, alignItems: "center" }}
          >
            {["1", "2", "\\cdots", "24"].map((j) =>
              j === "\\cdots" ? (
                <MathFormula key={j} tex={j} />
              ) : (
                <ParameterColumn key={j} tex={`\\mathbf w_${j}`} />
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
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 12,
        }}
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
      <section data-mhc-parameter-origin style={{ ...group, gap: 8 }}>
        <ModuleHeading>
          本层{sub === "A" ? " Attention" : " FFN"} 的可学习参数 · s 与 b
        </ModuleHeading>
        <span>
          训练时学习，推理时从本层模型权重加载；Attention 与 FFN
          各有一套，同一子层的所有 token 共用。
        </span>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "start",
            gap: 24,
          }}
        >
          <Box tone="amber" expanded>
            <TensorHeading
              name={`\\mathbf s_{${layer}}^{HC,${sub}}`}
              shape="1\times3"
            />
            <div style={{ display: "flex", gap: 8 }}>
              {copies.slice(0, 3).map((j) => (
                <Box key={j} tone="amber">
                  <MathFormula tex={`s_${j}`} />
                </Box>
              ))}
            </div>
            <span>s₁ 用于 p，s₂ 用于 q，s₃ 用于 C</span>
          </Box>
          <RowMatrix
            tex={`\\mathbf b_{${layer}}^{HC,${sub}}`}
            shape="1\times24"
            rows={["\\mathbf b"]}
            rowLength="24"
            elementTex={(_, d) => `b_{${d}}`}
            tone="blue"
          />
        </div>
        <MathFormula
          tex={`s_j:=(\\mathbf s_{${layer}}^{HC,${sub}})_j,\\quad b_j:=(\\mathbf b_{${layer}}^{HC,${sub}})_j`}
        />
        <span>
          b₁–b₄ 用于 p，b₅–b₈ 用于 q，b₉–b₂₄ 按行排成 C 分支的 4×4 偏置矩阵。
        </span>
        <small>
          官方参数：hc_{sub === "A" ? "attn" : "ffn"}_scale（3 个数）、hc_
          {sub === "A" ? "attn" : "ffn"}_base（24 个数）。u 随当前输入变化，s 与
          b 是加载的参数。
        </small>
      </section>
      <div data-mhc-affine-legend style={{ ...row, flexWrap: "wrap" }}>
        {(
          [
            ["scale", "s", "缩放参数"],
            ["bias", "b", "偏置参数"],
            ["result", "a", "缩放、加偏置后的结果"],
          ] as const
        ).map(([role, symbol, label]) => (
          <Box key={role} tone={MHC_AFFINE_TONES[role]}>
            <MathFormula tex={symbol} /> · {label}
          </Box>
        ))}
      </div>
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
      <ModuleHeading>
        {kind === "p"
          ? "p · 第 1–4 个数，供下一子层汇合"
          : "q · 第 5–8 个数，控制本子层输出写回多少"}
      </ModuleHeading>
      <span data-mhc-gate-parameter-source>
        下列 s{s}、b{offset + 1}–b{offset + 4} 取自上方本子层的可学习参数；u
        来自当前输入的投影。
      </span>
      <div style={{ display: "grid", gap: 7 }}>
        {copies.map((j) => (
          <div
            key={j}
            data-mhc-affine-row
            style={{
              display: "grid",
              gridTemplateColumns:
                "max-content 18px max-content 18px max-content 18px max-content",
              justifyContent: "center",
              gap: 4,
              alignItems: "center",
            }}
          >
            <Box tone="green">
              <MathFormula tex={`u_{${offset + j}}`} />
            </Box>
            <Operator tex="\times" />
            <Box tone={MHC_AFFINE_TONES.scale}>
              <MathFormula tex={`s_${s}`} />
            </Box>
            <Operator tex="+" />
            <Box tone={MHC_AFFINE_TONES.bias}>
              <MathFormula tex={`b_{${offset + j}}`} />
            </Box>
            <Operator tex="=" />
            <Box tone={MHC_AFFINE_TONES.result}>
              <MathFormula tex={`a^{${kind}}_${j}`} />
            </Box>
          </div>
        ))}
      </div>
      <span>a 是缩放、加偏置后的中间值，上标 p、q 分别标识两个分支。</span>
      <div data-mhc-gate-equations style={{ ...grid4, gap: 6 }}>
        {copies.map((j) => (
          <div key={j} style={{ display: "grid", gap: 6, textAlign: "center" }}>
            <Box tone="cyan">
              <MathFormula tex={`v^{${kind}}_${j}=\\sigma(a^{${kind}}_${j})`} />
            </Box>
            <Box tone={kind === "p" ? "green" : "rose"}>
              <MathFormula
                tex={
                  kind === "p"
                    ? `p_${j}=v^p_${j}+\\epsilon_{HC}`
                    : `q_${j}=2\\cdot v^q_${j}`
                }
              />
            </Box>
          </div>
        ))}
      </div>
      <span>
        {kind === "p"
          ? "每个 sigmoid 结果加 10⁻⁶，保持正值。"
          : "每个 sigmoid 结果乘以 2，结果范围为 (0, 2)。"}
      </span>
      {children}
    </section>
  );
}

export function SigmoidDefinition() {
  return (
    <div
      data-mhc-sigmoid
      style={{
        ...group,
        gap: 8,
        width: "fit-content",
        justifySelf: "center",
      }}
    >
      <ModuleHeading>Sigmoid · 对每个 a 单独计算</ModuleHeading>
      <div
        style={{
          justifySelf: "center",
        }}
      >
        <MathFormula tex="\sigma(a)=\frac{1}{1+e^{-a}}" />
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
    <Box tone={tone} expanded>
      <TensorHeading name={name} shape="4\times4" />
      <div data-mhc-four-matrix style={{ ...compact4, gap: 4 }}>
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
  // [OM-FREEPLAY] 指数项用激活绿、分母用缩放琥珀、T 用归一化青、首轮 C 用蓝；最终 C 保留混合紫。
  return (
    <section data-mhc-sinkhorn style={{ ...group, borderColor: COLORS.violet }}>
      <ModuleHeading>C · u 的第 9–24 个数，按顺序每四个排成一行</ModuleHeading>
      <span>
        s₃ 和偏置 b₉–b₂₄ 来自上方本子层的可学习参数；此处将偏置按行排为 Bᶜ。
      </span>
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
        <Box tone={MHC_AFFINE_TONES.scale}>
          <MathFormula tex="s_3" />
        </Box>
        <Operator tex="+" />
        <Grid4
          name="B^C"
          cell={(k, j) => `b_{${8 + 4 * (k - 1) + j}}`}
          tone={MHC_AFFINE_TONES.bias}
        />
        <Operator tex="=" />
        <Grid4
          name="A^C"
          cell={(k, j) => `a^C_{${k}${j}}`}
          tone={MHC_AFFINE_TONES.result}
        />
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
          <ModuleHeading>① 每行单独做 Softmax · 展开第 1 行</ModuleHeading>
          <VectorStrip
            name=""
            nameWidth={0}
            columns={["1", "2", "3", "4"]}
            length="4"
            elementTex={(j) => `a^C_{1${j}}`}
            tone={MHC_AFFINE_TONES.result}
          />
          <span>
            四个输入来自 Aᶜ 的第 1 行。减去同一个行最大值后取指数，得到四个正数
            e₁ⱼ；它们的和 d₁ 是本行共用的分母。
          </span>
          <MathFormula tex="m_1=\max(a^C_{11},a^C_{12},a^C_{13},a^C_{14})" />
          <MathFormula tex="e_{1j}=e^{\boxed{a^C_{1j}}-\boxed{m_1}},\quad j=1,2,3,4" />
          <div data-mhc-row-denominator style={{ display: "grid" }}>
            <div style={grid4}>
              {copies.map((j) => (
                <div key={j} style={{ display: "grid" }}>
                  <Box tone="green">
                    <MathFormula tex={`e_{1${j}}`} />
                  </Box>
                </div>
              ))}
            </div>
            <SumJunction count={4} />
            <Box tone="amber">
              <MathFormula tex="d_1=e_{11}+e_{12}+e_{13}+e_{14}" />
            </Box>
          </div>
          <span>
            每个指数项除以 d₁ 得到 Softmax 权重，再加稳定项 εHC = 10⁻⁶，得到 T
            的对应元素。
          </span>
          <div
            data-mhc-row-results
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2,max-content)",
              gap: 8,
              justifyContent: "center",
            }}
          >
            {copies.map((j) => (
              <div key={j} style={{ display: "grid", gap: 5 }}>
                <Box tone="cyan">
                  <MathFormula
                    tex={`T_{1${j}}=\\frac{e_{1${j}}}{d_1}+\\epsilon_{HC}`}
                  />
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
          <ModuleHeading>② 每列分别除以本列之和 · 展开第 1 列</ModuleHeading>
          <div
            data-mhc-compact-column
            style={{ width: 168, maxWidth: "100%", justifySelf: "center" }}
          >
            <StackedSum>
              {copies.map((k) => (
                <Box key={k} tone="cyan">
                  <MathFormula tex={`T_{${k}1}`} />
                </Box>
              ))}
            </StackedSum>
          </div>
          <Box tone="amber">
            <MathFormula tex="d^{col}_1=T_{11}+T_{21}+T_{31}+T_{41}+\epsilon_{HC}" />
          </Box>
          {copies.map((k) => (
            <div
              key={k}
              style={{
                display: "grid",
                gridTemplateColumns: "max-content 20px max-content",
                gap: 4,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Box tone="cyan">
                <MathFormula tex={`\\frac{T_{${k}1}}{d^{col}_1}`} />
              </Box>
              <Operator tex="=" />
              <Box tone="blue">
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
          gridTemplateColumns: "max-content minmax(0,1fr) max-content",
          alignItems: "center",
        }}
      >
        <Grid4
          name="C^{(1)}"
          cell={(k, j) => `c^{(1)}_{${k}${j}}`}
          tone="blue"
        />
        <div style={{ display: "grid", gap: 10 }}>
          <strong>再做 19 轮 · 共 20 轮</strong>
          <span>
            以左侧首轮结果为起点，重复行归一化、列归一化，得到右侧最终矩阵。每步的分母都是该行或该列之和加
            ε；行和、列和接近 1。
          </span>
          <MathFormula tex="\epsilon_{HC}=10^{-6}" />
        </div>
        {children}
      </div>
    </section>
  );
}
