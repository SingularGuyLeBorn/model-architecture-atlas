import type { ReactNode } from "react";
import { cacheDecodeRecipe } from "../components/CacheDecodeExample";
import { EngramPurpose } from "../components/EngramPurpose";
import {
  MathFormula as M,
  SplitArrows,
} from "../components/diagram-primitives";
import {
  Tensor,
  Vector,
  Data,
  Down,
  Parallel,
  Sequence,
  Projection,
  Add,
  Silu,
} from "./structure-blocks";
import {
  compressionForLayer,
  routedWeights,
  type Model,
  type Chapter,
} from "../data/models";

export type Phase = "prefill" | "decode";
export type Stage = {
  id: string;
  layoutLevel?: number;
  width?: number;
  title: string;
  body: ReactNode;
  output: string;
  formula?: string;
};
export type RecipeLink = { source: string; target: string; tex: string };
export type Recipe = {
  introduction: string;
  exportName?: string;
  stages: Stage[];
  links: RecipeLink[];
  references: { title: string; url: string }[];
};
const V3_CODE =
  "https://github.com/deepseek-ai/DeepSeek-V3/blob/main/inference/model.py";
const V3_REPORT = "https://arxiv.org/html/2412.19437v2";
const stage = (
  id: string,
  title: string,
  body: ReactNode,
  output: string,
  formula?: string,
): Stage => ({ id, title, body, output, formula });
const vec = (
  name: string,
  size: number | string,
  tone: "green" | "blue" | "violet" | "rose" | "cyan" = "green",
) => <Vector name={name} size={size} tone={tone} />;

function Expert({
  model,
  name,
  coefficient,
}: {
  model: Model;
  name: string;
  coefficient: string;
}) {
  const c = model.config;
  return (
    <section className="expert">
      <h4>{name}</h4>
      {vec("y_{l,t}", c.hidden_size, "blue")}
      <SplitArrows count={2} />
      <Parallel>
        {[
          <div key="gate">
            <Tensor
              name="W^{gate}_{l,e}"
              shape={`${c.hidden_size}\\times${c.moe_intermediate_size}`}
              rows={["1", "2", "…", String(c.hidden_size)]}
              columns={["1", "2", "…", String(c.moe_intermediate_size)]}
              tone="amber"
            />
            <Down
              label={
                model.family === "v3"
                  ? "投影得到 z"
                  : "投影 → gate 上限截断为 10"
              }
            />
            <Silu />
            <Data>
              <M tex="a_{l,t,e}" />
            </Data>
          </div>,
          <div key="up">
            <Tensor
              name="W^{up}_{l,e}"
              shape={`${c.hidden_size}\\times${c.moe_intermediate_size}`}
              rows={["1", "2", "…", String(c.hidden_size)]}
              columns={["1", "2", "…", String(c.moe_intermediate_size)]}
              tone="amber"
            />
            <Down
              label={
                model.family === "v3"
                  ? "独立升维"
                  : "独立升维 → 截断到 [−10,10]"
              }
            />
            {vec("b_{l,t,e}", c.moe_intermediate_size)}
          </div>,
        ]}
      </Parallel>
      <Down label="两路对应元素相乘 ⊙" />
      {vec("c_{l,t,e}", c.moe_intermediate_size)}
      <div className="down-projection">
        <Data>
          <M tex="c_{l,t,e}" />
        </Data>
        <span className="operator">×</span>
        <Tensor
          name="W^{down}_{l,e}"
          shape={`${c.moe_intermediate_size}\\times${c.hidden_size}`}
          rows={["1", "2", "…", String(c.moe_intermediate_size)]}
          columns={["1", "2", "…", String(c.hidden_size)]}
          tone="amber"
        />
      </div>
      <Down label="下投影得到专家输出" />
      {vec("e_{l,t,e}", c.hidden_size)}
      <Down label={`乘以 ${coefficient}`} />
      {vec("v^{weighted}_{l,t,e}", c.hidden_size, "cyan")}
    </section>
  );
}

export function recipeFor(
  model: Model,
  chapter: Chapter,
  phase: Phase,
  layer: number,
): Recipe {
  const c = model.config,
    d = c.hidden_size,
    n = phase === "prefill" ? "N" : "1",
    v3 = model.family === "v3";
  const heads = c.num_attention_heads,
    topk = c.num_experts_per_tok,
    experts = c.n_routed_experts;
  const codeUrl = v3
    ? V3_CODE
    : `https://huggingface.co/deepseek-ai/${model.source}/blob/${model.provenance.revision}/inference/model.py`;
  const references = [
    { title: "官方配置 · 固定版本", url: model.provenance.url },
    { title: "官方推理代码", url: codeUrl },
  ];
  const result = (introduction: string, stages: Stage[]): Recipe => {
    // 章节先后只表示阅读顺序；只有存在实际数据依赖才绘制跨模块箭头。
    const dependencies: Partial<Record<Chapter, [string, string, string][]>> = {
      mla: [
        ["q", "absorb", "q^{noPE}_{l,h,t}"],
        ["kv", "absorb", "c^{KV}_{l,j}"],
        ["absorb", "scores", "z^{noPE}_{l,h,t,j}"],
        ["q", "scores", "q^R_{l,h,t}"],
        ["kv", "scores", "k^R_{l,j}"],
        ["scores", "weighted", "a_{l,h,t}"],
        ["kv", "weighted", "c^{KV}_{l,j}"],
        ["weighted", "out", "o_{l,h,t}"],
      ],
      norm: [
        ["row", "rms", "x_{l,t}"],
        ["row", "normalize", "x_{l,t}"],
        ["rms", "normalize", "r_t"],
      ],
      mhc: [
        ["hc", "pre", "p"],
        ["hc", "post", "q"],
        ["hc", "post", "C"],
        ["hc", "post", "H^{in}_l"],
        ["pre", "post", "o_{l,t}"],
      ],
      csa: [
        ["compressed", "select", "G_l"],
        ["local", "attend", "U^{SWA}_{l,t}"],
        ["select", "attend", "G^{selected}_{l,t}"],
      ],
      balance: [["dispatch", "update", "\\mathrm{load}_e"]],
      ced: [
        ["enc", "cache", "H^{enc}_{20}"],
        ["cache", "dec", "G_{21}"],
        ["cache", "dec", "K^I_{21}"],
      ],
      training: model.id === "v3" ? [] : undefined,
    };
    const ids = new Set(stages.map((s) => s.id));
    const links = (
      dependencies[chapter] ??
      stages
        .slice(1)
        .map((s, i): [string, string, string] => [
          stages[i].id,
          s.id,
          stages[i].output,
        ])
    )
      .filter(([source, target]) => ids.has(source) && ids.has(target))
      .map(([source, target, tex]) => ({ source, target, tex }));
    return { introduction, stages, links, references };
  };
  if (chapter === "cache") return cacheDecodeRecipe(references);
  if (chapter === "overview")
    return result(
      phase === "prefill"
        ? "Prefill 同时计算输入的 N 行；每行只能读取自己及之前的位置。t 是原序列行号。"
        : "Decode 第 k 步只计算新输入的一行，位置 t=P+k。历史来自各层缓存；本步输出分布用于选择下一个 token。",
      [
        stage(
          "tokens",
          "01 · 文本与序列位置",
          <>
            <Data tone="blue">输入文本 → 官方 Tokenizer → token ID 序列</Data>
            <Parallel>
              {["1", "2", "t", "N"].map((t) => (
                <Data key={t} tone={t === "t" ? "rose" : "blue"}>
                  <M tex={`\\mathrm{id}_{${t}}`} />
                  <small>位置 {t}</small>
                </Data>
              ))}
            </Parallel>
            <p>
              这里的 ID 是符号示意；真实分词必须使用当前模型的 tokenizer 确定
              token 边界。
            </p>
          </>,
          "\\mathrm{ids}",
        ),
        stage(
          "embedding",
          "02 · Embedding 查表",
          <>
            <Tensor
              name="E"
              shape={`${c.vocab_size}\\times${d}`}
              rows={[
                "0",
                "1",
                "…",
                "\\mathrm{id}_t",
                "…",
                String(c.vocab_size - 1),
              ]}
              selected="\\mathrm{id}_t"
              tone="amber"
            />
            <Down label="每个 ID 取一行，按序列顺序组成输入矩阵" />
            <Tensor name="H^{in}_1" shape={`${n}\\times${d}`} selected="t" />
            <p>
              位置信息在注意力内部由 RoPE 注入。Decode 输入矩阵只有当前 t 行。
            </p>
          </>,
          "H^{in}_1",
        ),
        stage(
          "stack",
          `03 · ${c.num_hidden_layers} 个主干层`,
          <>
            <Sequence>
              {["1", "2", String(c.num_hidden_layers)].map((l) => (
                <Data key={l}>
                  Layer {l}
                  <Down />
                  <span>
                    {v3
                      ? "RMSNorm → MLA → 残差相加"
                      : "mHC 汇合 → 稀疏 Attention → mHC 回写"}
                  </span>
                  <Down />
                  <span>
                    {v3
                      ? "RMSNorm → FFN → 残差相加"
                      : "mHC 汇合 → MoE → mHC 回写"}
                  </span>
                </Data>
              ))}
            </Sequence>
            <p>
              按箭头顺序执行；第 3 至 {c.num_hidden_layers - 1}{" "}
              层沿用对应层模板，图中省略。
            </p>
            <p>
              {v3
                ? "第 1–3 层是稠密 SwiGLU（中间宽度 18432）；第 4–61 层是 MoE。"
                : model.family === "v41"
                  ? "第 1–20 层是因果编码器，第 21–40 层是解码器；第 2、15 层还有 Engram。"
                  : "每层四路残差；前 3 层采用 token-ID Hash 专家选择，后续层采用得分 Top-6。"}
            </p>
          </>,
          `H_{${c.num_hidden_layers}}^{out}`,
        ),
        stage(
          "head",
          "04 · 输出到词表，再选择下一 token",
          <>
            {!v3 && (
              <>
                <Data>四路残差 → 最终读出权重 → 汇合为一路</Data>
                <Down />
              </>
            )}
            <Data>RMSNorm · 每行独立归一化</Data>
            <Down />
            <Projection
              input="H^{norm}"
              weight="W^{vocab}"
              output="L"
              rows={n}
              from={d}
              to={c.vocab_size}
            />
            <Down
              label={
                phase === "prefill"
                  ? "生成时读取最后一个有效输入位置的 logits"
                  : "读取当前 t 行 logits"
              }
            />
            {vec("L_t", c.vocab_size)}
            <Down label="词表 Softmax → 采样 / 贪心选择" />
            <Data tone="rose">
              下一 token ID → 下一步 Embedding；结束符结束生成
            </Data>
            <p>
              词表 Softmax、Attention Softmax、MoE 路由归一化是三个不同的运算。
            </p>
          </>,
          "\\mathrm{id}_{t+1}",
        ),
      ],
    );
  if (chapter === "mla")
    return result(
      "同一个 MLA 有两种等价计算视角。吸收路径每个位置缓存 512 维潜向量和 64 维旋转 Key，不缓存全部 128 个 Head 的展开 K/V。",
      [
        stage(
          "q",
          "01 · 完整 Query 矩阵 → 当前行 → Head 分块",
          <>
            <Projection
              input="X_l"
              weight="W^{DQ}_l"
              output="C^Q_l"
              rows={n}
              from={d}
              to={1536}
            />
            <Down label="低秩 Query 的 RMSNorm" />
            <Projection
              input="\widehat C^Q_l"
              weight="W^{UQ}_l"
              output="Q_l"
              rows={n}
              from={1536}
              to={128 * 192}
            />
            <Down label="在 Q 矩阵高亮 t 行；每 192 个元素分为一个 Head" />
            <Tensor name="Q_l" shape={`${n}\\times24576`} selected="t" />
            <Parallel>
              {["1", "2", "128"].map((h) => (
                <Data key={h}>
                  Head {h}
                  <Vector name={`q_{l,${h},t}^{noPE}`} size={128} />
                  <Vector name={`q_{l,${h},t}^{R}`} size={64} />
                </Data>
              ))}
            </Parallel>
          </>,
          "q_{l,h,t}",
        ),
        stage(
          "kv",
          "02 · KV 分支与只存一次的共享缓存",
          <>
            <Projection
              input="X_l"
              weight="W^{DKV}_l"
              output="C^{KV+R}_l"
              rows={n}
              from={d}
              to={576}
            />
            <Parallel>
              {[
                <div key="c">
                  <Data>前 512 维 → RMSNorm</Data>
                  <Down />
                  {vec("c^{KV}_{l,t}", 512, "cyan")}
                </div>,
                <div key="r">
                  <Data>后 64 维 → RoPE（位置 t）</Data>
                  <Down />
                  {vec("k^{R}_{l,t}", 64, "rose")}
                </div>,
              ]}
            </Parallel>
            <Tensor
              name="Cache_l"
              shape="t\times(512+64)"
              rows={["1", "2", "…", "t"]}
              columns={["c^{KV}", "k^R"]}
              tone="blue"
            />
          </>,
          "\\{c^{KV}_{l,j},k^R_{l,j}\\}_{j\\leq t}",
        ),
        stage(
          "absorb",
          "03 · 两种等价计算方式",
          <Parallel>
            {[
              <div key="naive">
                <h4>原始展开 · 理解结构</h4>
                {vec("c^{KV}_{l,j}", 512, "cyan")}
                <SplitArrows count={2} />
                <Parallel>
                  {[
                    <div key="k">
                      <Data tone="amber">
                        <M tex="W^{UK}_{l,h}" />
                        <small>512 × 128</small>
                      </Data>
                      <Down />
                      {vec("k^{noPE}_{l,h,j}", 128)}
                    </div>,
                    <div key="v">
                      <Data tone="amber">
                        <M tex="W^{UV}_{l,h}" />
                        <small>512 × 128</small>
                      </Data>
                      <Down />
                      {vec("v_{l,h,j}", 128)}
                    </div>,
                  ]}
                </Parallel>
                <Down />
                <Data>
                  <M tex="q^{noPE}_{l,h,t}\cdot k^{noPE}_{l,h,j}" />
                </Data>
                <p>先还原 K/V，再做注意力。</p>
              </div>,
              <div key="absorbed">
                <h4>吸收路径 · 压缩缓存</h4>
                {vec("q^{noPE}_{l,h,t}", 128)}
                <Down label="× (Wᵁᴷ)ᵀ：128 → 512" />
                {vec("\\widetilde q_{l,h,t}", 512)}
                <Down />
                <Data>
                  <M tex="\widetilde q_{l,h,t}\cdot c^{KV}_{l,j}" />
                </Data>
                <p>把 Key 上投影移到 Query 侧，直接匹配缓存的潜向量。</p>
              </div>,
            ]}
          </Parallel>,
          "z^{noPE}_{l,h,t,j}",
          "q^{noPE}(c^{KV}W^{UK})^\\top=(q^{noPE}(W^{UK})^\\top)(c^{KV})^\\top",
        ),
        stage(
          "scores",
          "04 · 内容分数 + 位置分数 → 因果 Softmax",
          <>
            <Add
              result={
                <Data>
                  <M tex="z_{l,h,t,j}" />
                </Data>
              }
            >
              {[
                <Data key="content">
                  <M tex="\widetilde q_{l,h,t}(c^{KV}_{l,j})^\top" />
                </Data>,
                <Data key="position" tone="rose">
                  <M tex="q^R_{l,h,t}(k^R_{l,j})^\top" />
                </Data>,
              ]}
            </Add>
            <Down label="乘缩放系数；j > t 的位置设为 −∞" />
            <Tensor
              name="z_{l,h,t}"
              shape="1\times t"
              rows={["t"]}
              columns={["1", "2", "…", "t"]}
            />
            <Down label="沿历史位置 j 做 Softmax" />
            {vec("a_{l,h,t}", "t", "rose")}
            <p>
              基础缩放为 1/√192；长上下文 YaRN 配置还影响注意力尺度。每个 query
              行单独归一化。
            </p>
          </>,
          "a_{l,h,t}",
        ),
        stage(
          "weighted",
          "05 · 权重逐行乘缓存 → 方形 Σ → Value 上投影",
          <>
            <Add result={vec("s_{l,h,t}", 512, "cyan")}>
              {["1", "2", "t"].map((j) => (
                <Data key={j} tone="cyan">
                  <M tex={`a_{l,h,t,${j}}\\times c^{KV}_{l,${j}}`} />
                  <small>
                    {j === "t" ? "末项（中间历史项省略）" : `历史位置 ${j}`}
                  </small>
                </Data>
              ))}
            </Add>
            <Down label="× Wᵁⱽ：512 → 128" />
            {vec("o_{l,h,t}", 128)}
            <p>等价于先还原每个位置的 V，再用同一组 a 加权求和。</p>
          </>,
          "o_{l,h,t}",
        ),
        stage(
          "out",
          "06 · 128 Heads 拼接与输出投影",
          <>
            <Parallel>
              {["1", "2", "128"].map((h) => (
                <div key={h}>{vec(`o_{l,${h},t}`, 128)}</div>
              ))}
            </Parallel>
            <Down label="按 Head 顺序拼接；中间 Head 省略" />
            <Projection
              input="O^{concat}_l"
              weight="W^O_l"
              output="O_l"
              rows={n}
              from={16384}
              to={d}
            />
          </>,
          "O_l",
        ),
      ],
    );
  if (chapter === "moe") {
    const weights = routedWeights([0.8, 0.4], [0, 1], c.routed_scaling_factor);
    return result(
      "共享专家独立计算；非共享专家只计算本 token 选中的 Top-K。图中仅展开选中排名第 1、第 2、最后一个专家，省略项仍参与求和。",
      [
        stage(
          "router",
          "01 · Router 投影与正分数",
          <>
            <Projection
              input="Y_l"
              weight="W^R_l"
              output="Z^R_l"
              rows={n}
              from={d}
              to={experts}
            />
            <Down label={v3 ? "逐元素 sigmoid" : "逐元素 √softplus"} />
            <Tensor
              name="S_l"
              shape={`${n}\\times${experts}`}
              selected="t"
              columns={["1", "2", "…", String(experts)]}
            />
            <p>
              {!v3 && model.family === "v4" && layer <= 3
                ? "本层是 Hash MoE：专家 ID 来自 token-ID 查表；分数仍用于选定专家的权重。"
                : `当前行 t：加选择偏置后选 Top-${topk}；其他专家在此 token 不执行。`}
            </p>
            {v3 && (
              <Data tone="violet">
                256 个专家分 8 组 → 每组取最高两项加和 → 选 4 组 → 组内选 Top-8
              </Data>
            )}
          </>,
          "S_{l,t}",
        ),
        stage(
          "gate",
          "02 · 选择与加权系数是两条并行分支",
          <Parallel>
            {[
              <div key="select">
                <Data tone="violet">选择分数 s + bias</Data>
                <Down
                  label={
                    model.family === "v4" && layer <= 3
                      ? "此层改走 token-ID → Hash 表"
                      : `Top-${topk}`
                  }
                />
                <Data tone="violet">专家 ID：e₁、e₂、…、eₖ</Data>
                <div className="muted-experts">
                  未入选的 {experts - topk} 个专家 · 不参与此 token 的计算
                </div>
              </div>,
              <div key="weight">
                <Data tone="rose">读取这些 ID 对应的原始 s</Data>
                <Down label="除以所选分数之和，再乘 routed scale" />
                <Data tone="rose">
                  <M
                    tex={`g_e=${c.routed_scaling_factor}\\frac{s_e}{\\sum_{j\\in I_t}s_j}`}
                  />
                </Data>
                <p>
                  无 Router Softmax。演示仅选两个分数 0.8、0.4：权重{" "}
                  {weights[0].toFixed(3)}、{weights[1].toFixed(3)}。
                </p>
              </div>,
            ]}
          </Parallel>,
          "I_t,\\ g_{l,t,e}",
        ),
        stage(
          "experts",
          "03 · 两类专家在同一层横向并行",
          <Parallel proportions={[1, 3]}>
            {[
              <Expert
                key="shared"
                model={model}
                name="共享专家 · 始终计算"
                coefficient="1"
              />,
              <div key="routed">
                <h4>非共享专家 · 同一个输入 y，独立参数</h4>
                <Parallel>
                  {["1", "2", String(topk)].map((rank) => (
                    <Expert
                      key={rank}
                      model={model}
                      name={`选中排名 ${rank}`}
                      coefficient={`g_{${rank}}`}
                    />
                  ))}
                </Parallel>
              </div>,
            ]}
          </Parallel>,
          "\\{E_{shared},g_e E_e\\}",
        ),
        stage(
          "sum",
          "04 · 每个输出单独接入求和器",
          <Add result={vec("O^{FFN}_{l,t}", d)}>
            {[
              <Data key="shared" tone="cyan">
                <M tex="E_{l,shared}(y_{l,t})" />
                <small>权重 1</small>
              </Data>,
              ...["1", "2", String(topk)].map((rank) => (
                <Data key={rank} tone="cyan">
                  <M tex={`g_{${rank}}E_{l,e_{${rank}}}(y_{l,t})`} />
                </Data>
              )),
            ]}
          </Add>,
          "O_l^{FFN}",
          "O^{FFN}_{l,t}=E_{l,shared}(y_{l,t})+\\sum_{e\\in I_t}g_{l,t,e}E_{l,e}(y_{l,t})",
        ),
      ],
    );
  }
  if (chapter === "balance") {
    references.push({ title: "V3 报告 §2.1.2 · §4.2", url: V3_REPORT });
    return result(
      "辅助损失自由负载均衡首先指 V3 的训练机制：用路由偏置调节流量，偏置不直接进入专家混合权重。训练还包含序列级负载均衡辅助损失。",
      [
        stage(
          "dispatch",
          "01 · 当前训练步：选择专家并统计负载",
          <>
            <Parallel>
              {[
                <div key="selection">
                  <Data tone="violet">原始分数 s + 专家偏置 b</Data>
                  <Down label="Top-K 路由" />
                  <Data>每个专家收到一批 token</Data>
                  <Down />
                  <Data tone="violet">统计每个专家的 token 数</Data>
                </div>,
                <div key="weight">
                  <Data tone="rose">原始分数 s</Data>
                  <Down label="只保留选中项并归一化" />
                  <Data tone="rose">专家输出的混合系数</Data>
                  <p>b 不加入这条权重计算。</p>
                </div>,
              ]}
            </Parallel>
          </>,
          "\\mathrm{load}_e",
        ),
        stage(
          "update",
          "02 · 下一训练步的偏置更新",
          <>
            <Parallel>
              {[
                <div key="over">
                  <Data>专家过载</Data>
                  <Down />
                  <Data tone="violet">
                    <M tex="b_e\leftarrow b_e-\gamma" />
                  </Data>
                  <p>下次更难入选。</p>
                </div>,
                <div key="under">
                  <Data>专家欠载</Data>
                  <Down />
                  <Data tone="violet">
                    <M tex="b_e\leftarrow b_e+\gamma" />
                  </Data>
                  <p>下次更容易入选。</p>
                </div>,
              ]}
            </Parallel>
            <p>
              V3
              偏置更新不靠辅助均衡损失的梯度。普通推理加载训练后的偏置，不在每次生成后运行这条训练更新。
            </p>
          </>,
          "b^{next}",
        ),
        stage(
          "loss",
          "03 · V3 仍有独立的序列级辅助项",
          <>
            <Add result={<Data>训练总目标</Data>}>
              {[
                <Data key="lm">语言建模损失</Data>,
                <Data key="bal" tone="violet">
                  序列级均衡损失<small>α = 0.0001</small>
                </Data>,
                <Data key="mtp" tone="rose">
                  MTP 预测损失
                </Data>,
              ]}
            </Add>
            <p>
              V3：批量级流量主要由偏置机制调节；很小的序列级损失用于约束单序列极端不均衡。这些训练超参数适用于
              V3。
            </p>
          </>,
          "\\mathcal L",
        ),
      ],
    );
  }
  if (chapter === "norm")
    return result(
      "RMSNorm 沿单行的特征轴计算，不混合 token，也不先减均值。参数 γ 在各行共享；ε 取当前模型配置。",
      [
        stage(
          "row",
          "01 · 完整矩阵中取当前行",
          <>
            <Tensor name="X_l" shape={`${n}\\times${d}`} selected="t" />
            <Down label="只展开第 t 行" />
            {vec("x_{l,t}", d, "blue")}
          </>,
          "x_{l,t}",
        ),
        stage(
          "rms",
          "02 · 每个元素平方 → 求和 → 均值 → 平方根",
          <>
            <Add
              result={
                <Data tone="cyan">
                  <M tex="s_t" />
                </Data>
              }
            >
              {["1", "2", String(d)].map((j) => (
                <div key={j}>
                  <Data tone="blue">
                    <M tex={`x_{l,t,${j}}`} />
                  </Data>
                  <Down label="平方" />
                  <Data>
                    <M tex={`x_{l,t,${j}}^2`} />
                  </Data>
                </div>
              ))}
            </Add>
            <Down label={`包含全部 ${d} 项，再除以 ${d}`} />
            <Data>
              <M tex={`r_t=\\sqrt{s_t/${d}+\\epsilon}`} />
            </Data>
            <p>ε = {c.rms_norm_eps}；中间元素只是在图中省略。</p>
          </>,
          "r_t",
        ),
        stage(
          "normalize",
          "03 · r 广播回每个元素，再乘独立 γ",
          <>
            <Parallel>
              {["1", "2", String(d)].map((j) => (
                <div key={j}>
                  <Data tone="blue">
                    <M tex={`x_{l,t,${j}}/r_t`} />
                  </Data>
                  <Down label="× 对应 γ" />
                  <Data tone="amber">
                    <M tex={`\\gamma_${j}`} />
                  </Data>
                  <Down />
                  <Data>
                    <M tex={`y_{l,t,${j}}`} />
                  </Data>
                </div>
              ))}
            </Parallel>
            <Down label="组合成输出行；所有行独立重复" />
            {vec("y_{l,t}", d)}
            <p className="example">
              4 维演示（γ=1，忽略极小 ε）：[1, −1, 3, −3] → RMS=√5 → [0.447,
              −0.447, 1.342, −1.342]。
            </p>
          </>,
          "Y_l",
        ),
      ],
    );
  if (chapter === "rope")
    return result(
      "RoPE 只旋转指定的 64 维位置分量。每两维是一对；位置 t 决定旋转角，Head 编号不决定序列位置。",
      [
        stage(
          "split",
          "01 · 不旋转的内容分量与位置分量分开",
          <>
            <Parallel>
              {[
                <div key="plain">
                  {vec("q^{noPE}_{l,h,t}", v3 ? 128 : 448)}
                  <p>保留原值</p>
                </div>,
                <div key="rotate">
                  {vec("q^{R}_{l,h,t}", 64, "rose")}
                  <Down label="拆成 32 对" />
                  <Parallel>
                    {["0", "1", "31"].map((i) => (
                      <Data key={i} tone="rose">
                        <M tex={`(x_{2\\cdot${i}},x_{2\\cdot${i}+1})`} />
                      </Data>
                    ))}
                  </Parallel>
                </div>,
              ]}
            </Parallel>
          </>,
          "(x_{2i},x_{2i+1})",
        ),
        stage(
          "rotate",
          "02 · 一对元素的真实旋转结构",
          <>
            <Parallel>
              {[
                <Add
                  key="a"
                  result={
                    <Data tone="rose">
                      <M tex="x'_{2i}" />
                    </Data>
                  }
                >
                  {[
                    <Data key="1">
                      <M tex="x_{2i}\cos\theta_{t,i}" />
                    </Data>,
                    <Data key="2">
                      <M tex="-x_{2i+1}\sin\theta_{t,i}" />
                    </Data>,
                  ]}
                </Add>,
                <Add
                  key="b"
                  result={
                    <Data tone="rose">
                      <M tex="x'_{2i+1}" />
                    </Data>
                  }
                >
                  {[
                    <Data key="1">
                      <M tex="x_{2i}\sin\theta_{t,i}" />
                    </Data>,
                    <Data key="2">
                      <M tex="x_{2i+1}\cos\theta_{t,i}" />
                    </Data>,
                  ]}
                </Add>,
              ]}
            </Parallel>
            <p className="example">
              演示：角度 π/2，输入 (1,2) → 输出 (−2,1)。真实角度由位置、频率和
              YaRN 配置计算，不固定为 π/2。
            </p>
          </>,
          "(x'_{2i},x'_{2i+1})",
        ),
        stage(
          "rejoin",
          "03 · 组合回 Head；Key 用自己的位置 j",
          <>
            <Parallel>
              {[
                <Data key="q">Query：位置 t → 32 对旋转 → 64 维 qᴿ</Data>,
                <Data key="k">Key：位置 j → 32 对旋转 → 64 维 kᴿ</Data>,
              ]}
            </Parallel>
            <Down />
            <Data>内容分量和旋转分量共同参与 Q·K；点积编码相对位置差。</Data>
            {!v3 && (
              <p>
                V4 系列的共享 KV 注意力输出还执行逆
                RoPE，再进入分组输出投影；完整 V4.1 层图中可跟踪该路径。
              </p>
            )}
            <p>
              YaRN 调整频率和尺度以扩展上下文；基础频率、压缩 KV
              频率和位置锚点按各自配置计算。
            </p>
          </>,
          "q^R,k^R",
        ),
      ],
    );
  if (chapter === "mhc")
    return result(
      model.family === "v41"
        ? "Single-Pass mHC：当前子层生成的 p 提供给下一子层汇合；q 与 C 用于当前回写。"
        : "V4 mHC 在每个子层入口从四路状态生成 pre/post/comb；pre 汇合当前子层输入，post 与 comb 在当前子层输出后并行回写。",
      [
        stage(
          "hc",
          "01 · 四条平等残差路，始终同排",
          <>
            <Parallel>
              {["1", "2", "3", "4"].map((j) => (
                <div key={j}>{vec(`h^{in}_{l,${j},t}`, d, "blue")}</div>
              ))}
            </Parallel>
            <Down label={`拼成 4×${d}，归一化后投影到 24 个控制量`} />
            <Data tone="amber">
              4 个 pre 权重 · 4 个 post 权重 · 16 个残差混合元素
            </Data>
            <Parallel>
              {[
                <Data key="p" tone="green">
                  p：sigmoid + ε<small>四路输入汇合权重</small>
                </Data>,
                <Data key="q" tone="rose">
                  q：2 × sigmoid<small>子层输出广播权重</small>
                </Data>,
                <div key="c">
                  <Tensor
                    name="C_{l,t}"
                    shape="4\times4"
                    rows={["1", "2", "3", "4"]}
                    columns={["1", "2", "3", "4"]}
                    tone="violet"
                  />
                  <p>Softmax → 行/列交替归一化，共 20 轮。</p>
                </div>,
              ]}
            </Parallel>
          </>,
          "p,\\ q,\\ C",
        ),
        stage(
          "pre",
          "02 · 四路加权汇合，进入 Attention 或 FFN",
          <>
            <Add result={vec("x_{l,t}", d)}>
              {["1", "2", "3", "4"].map((j) => (
                <Data key={j}>
                  <M tex={`p_${j}h^{in}_{l,${j},t}`} />
                </Data>
              ))}
            </Add>
            <Down />
            <Data>RMSNorm → 当前子层（Attention / MoE）</Data>
            <Down />
            {vec("o_{l,t}", d)}
            <p>
              {model.family === "v41"
                ? "这里消费的是进入本子层的 p；首层起始汇合由初始化权重确定。完整层图保留跨子层来源。"
                : "这里消费本次入口生成的 p。o 是该子层的计算输出。"}
            </p>
          </>,
          "o_{l,t}",
        ),
        stage(
          "post",
          "03 · 同一步骤内的两条并行支路，末端相加",
          <Parallel>
            {["1", "2", "3", "4"].map((j) => (
              <div key={j} className="target-lane">
                <h4>目标残差路 {j}</h4>
                <Parallel>
                  {[
                    <div key="mix">
                      <h4>残差混合</h4>
                      <Tensor
                        name="C"
                        shape="4\times4"
                        rows={["1", "2", "3", "4"]}
                        columns={["1", "2", "3", "4"]}
                        tone="violet"
                      />
                      <Add result={vec(`r_${j}`, d, "cyan")}>
                        {["1", "2", "3", "4"].map((k) => (
                          <Data key={k} tone="violet">
                            <M tex={`c_{${k},${j}}h^{in}_{l,${k},t}`} />
                          </Data>
                        ))}
                      </Add>
                    </div>,
                    <div key="broadcast">
                      <h4>子层输出广播</h4>
                      <Data tone="rose">
                        <M tex={`q_${j}`} />
                        <small>来自控制器</small>
                      </Data>
                      <Down label="× 同一子层输出 o" />
                      {vec("o_{l,t}", d)}
                      <Down />
                      {vec(`q_${j}o_{l,t}`, d, "cyan")}
                    </div>,
                  ]}
                </Parallel>
                <Add result={vec(`h^{out}_{l,${j},t}`, d)}>
                  {[
                    <Data key="r" tone="cyan">
                      <M tex={`r_${j}`} />
                    </Data>,
                    <Data key="o" tone="cyan">
                      <M tex={`q_${j}o_{l,t}`} />
                    </Data>,
                  ]}
                </Add>
              </div>
            ))}
          </Parallel>,
          "H_l^{out}",
          "h^{out}_{l,j,t}=\\sum_{k=1}^4c_{kj}h^{in}_{l,k,t}+q_j o_{l,t}",
        ),
      ],
    );
  const ratio = compressionForLayer(model, layer);
  if (chapter === "csa")
    return result(
      `当前 Layer ${layer}：${ratio === 0 ? "SWA-only，本地窗口" : model.family === "v41" ? "CSA2 与跨层共享" : ratio === 4 ? "CSA，压缩比例 4，并使用 Indexer" : "HCA，压缩比例 128，不使用 Indexer"}。压缩缓存和本地窗口是并行来源，合并后才进入注意力。`,
      [
        stage(
          "local",
          "01 · 本地窗口直接从投影后的 KV 取连续行",
          <>
            <Projection
              input="X_l"
              weight="W^{KV}_l"
              output="U_l"
              rows={n}
              from={d}
              to={512}
            />
            <Down label="RMSNorm；旋转末 64 维；写入本层环形缓存" />
            <Tensor
              name="U_l"
              shape="t\times512"
              rows={["1", "2", "…", "r", "r+1", "…", "t"]}
            />
            <section className="window-selection">
              <Tensor
                name="U^{SWA}_{l,t}"
                shape="\min(128,t)\times512"
                rows={["r", "r+1", "…", "t"]}
                columns={["1", "2", "…", "512"]}
              />
            </section>
            <p>
              r=max(1,t−127)。例：t=130 → 保留第 3、4、…、130 行，共 128 行。
            </p>
          </>,
          "U^{SWA}_{l,t}",
        ),
        ...(ratio === 0
          ? []
          : [
              stage(
                "compressed",
                ratio === 1
                  ? "02 · 比例 1：独立投影，不做行池化"
                  : "02 · 压缩支路：特征和门控同时投影",
                ratio === 1 ? (
                  <>
                    <Projection
                      input="H^{enc}_{20}"
                      weight="W^{global}_{21}"
                      output="G_{21}"
                      rows="N"
                      from={d}
                      to={512}
                    />
                    <Down label="RMSNorm → RoPE → 共享全局 KV" />
                    <p>
                      每个位置保留一行；没有 gate 分支，也不把多行合成一行。
                    </p>
                  </>
                ) : (
                  <>
                    <Parallel>
                      {[
                        <div key="value">
                          <Data tone="blue">压缩源隐藏状态</Data>
                          <Down label="× 压缩特征参数" />
                          <Tensor
                            name="F_l"
                            shape={`M\\times${model.family === "v4" && ratio === 4 ? 1024 : 512}`}
                          />
                        </div>,
                        <div key="gate">
                          <Data tone="blue">同一压缩源</Data>
                          <Down label="× 门控参数 + 组内位置参数" />
                          <Tensor name="A_l" shape="M\times d_c" tone="rose" />
                        </div>,
                      ]}
                    </Parallel>
                    <Down label="每组内：按位置做逐通道 Softmax，乘特征后累加" />
                    <Add result={vec("g_{l,m}", 512, "cyan")}>
                      {(ratio === 1
                        ? ["1"]
                        : ratio === 2
                          ? ["1", "2"]
                          : model.family === "v4" && ratio === 4
                            ? ["1", "2", "8"]
                            : ["1", "2", String(ratio)]
                      ).map((j, i) => (
                        <Data key={i} tone="cyan">
                          <M tex={`\\alpha_{${j}}\\odot f_{${j}}`} />
                        </Data>
                      ))}
                    </Add>
                    <p>
                      {model.family === "v4" && ratio === 4
                        ? "CSA4：前一组 4 项的重叠半部 + 当前组 4 项的常规半部，共 8 项门控池化；每 4 个 token 写一行。初始缺失组屏蔽。"
                        : `完整组每 ${ratio} 项形成一行；只有因果上已完成的组可读。`}
                    </p>
                    <Down label="归一化 → 按组的时间锚点 RoPE → 写压缩缓存" />
                    {model.family === "v41" && (
                      <p>
                        V4.1：KV 由指定 Full
                        层写入并跨层复用，解码器压缩源是末编码器状态。
                      </p>
                    )}
                  </>
                ),
                "G_l",
              ),
              stage(
                "select",
                ratio === 128
                  ? "03 · HCA 直接读取完整的因果压缩前缀"
                  : "03 · Indexer 在压缩行上选择",
                ratio === 128 ? (
                  <>
                    <Tensor
                      name="G_l"
                      shape="M\times512"
                      rows={["1", "2", "…", "M_t"]}
                    />
                    <p>
                      所有已完成且不在未来的压缩组都参与；没有 Top-K Indexer。
                    </p>
                  </>
                ) : (
                  <>
                    <Parallel>
                      {[
                        <Data key="q">低秩 Query → 多个索引 Query Head</Data>,
                        <Data key="k">压缩源 → 独立索引 Key（128 维）</Data>,
                      ]}
                    </Parallel>
                    <Down label="每个索引 Head：Q·K → ReLU → 乘 Head 门控" />
                    <Add result={<Data>每个压缩行的最终分数</Data>}>
                      {[
                        "1",
                        "2",
                        String("index_n_heads" in c ? c.index_n_heads : 32),
                      ].map((h) => (
                        <Data key={h}>
                          <M
                            tex={`w_${h}\\operatorname{ReLU}(q^I_${h}(k^I)^\\top)`}
                          />
                        </Data>
                      ))}
                    </Add>
                    <Down
                      label={`因果屏蔽后取 Top-${"index_topk" in c ? c.index_topk : 512} 行`}
                    />
                    <Tensor
                      name="G_l^{selected}"
                      shape="K_t\times512"
                      rows={["i_1", "i_2", "…", "i_{K_t}"]}
                    />
                    <p>
                      行号对应压缩矩阵中的整行。候选不足时只保留实际存在的行。
                    </p>
                  </>
                ),
                "G^{selected}_{l,t}",
              ),
            ]),
        stage(
          "attend",
          "04 · KV 合并 → 打分 → 明确加权求和",
          <>
            <Parallel>
              {[
                <Data key="swa">
                  <M tex="U^{SWA}_{l,t}" />
                </Data>,
                ...(ratio
                  ? [
                      <Data key="global" tone="cyan">
                        <M tex="G^{selected}_{l,t}" />
                      </Data>,
                    ]
                  : []),
              ]}
            </Parallel>
            <Down label="按行拼接到可见 KV 集合" />
            <Tensor name="KV_{l,t}" shape="L_t\times512" />
            <Down label="q 与每行 KV 点积 / √512；加入 attention sink 后 Softmax" />
            <Add result={vec("o_{l,h,t}", 512)}>
              {["1", "2", "L_t"].map((j) => (
                <Data key={j} tone="cyan">
                  <M tex={`a_{l,h,t,${j}} KV_{l,t,${j}}`} />
                </Data>
              ))}
            </Add>
            <p>
              Sink 占据分母质量，但没有实际 Value 加入输出。各 Head 输出逆
              RoPE，再按组低秩投影到模型宽度。
            </p>
          </>,
          "O_l",
        ),
      ],
    );
  if (chapter === "engram")
    return result(
      "Engram 在 V4.1 Flash 的第 2、15 层提供条件记忆。查表由离散 token n-gram 决定；隐藏状态决定如何将取回的记忆注入主干。完整层图可定位这两层。",
      [
        stage(
          "ngrams",
          "01 · token ID → 压缩词表 ID → n-gram",
          <>
            <EngramPurpose />
            <Data tone="blue">当前 token 与前面的 token ID</Data>
            <Down label="tokenizer 规范化对应的压缩 ID 映射" />
            <Parallel>
              {[2, 3, 4].map((size) => (
                <Data key={size} tone="violet">
                  {size}-gram<small>以当前位置 t 结尾的连续 {size} 个 ID</small>
                </Data>
              ))}
            </Parallel>
            <p>
              每个 n-gram 使用 8 个 Hash Head；缺失的左上下文由 padding 处理。
            </p>
          </>,
          "\\mathrm{hashes}_t",
        ),
        stage(
          "lookup",
          "02 · 多 Hash 地址查大表，取回向量",
          <>
            <Parallel>
              {["1", "2", "8"].map((h) => (
                <div key={h}>
                  <Data tone="violet">Hash Head {h} → 表中地址</Data>
                  <Down />
                  {vec(`e_{${h}}`, 256, "violet")}
                </div>
              ))}
            </Parallel>
            <Down label="3 类 n-gram × 8 个 Head × 256 维拼接" />
            {vec("e_t", 6144, "violet")}
            <p>
              E 是独立模型参数表，推理期间固定，只读取被选中的行；KV
              缓存则随当前序列写入，与 E 区分。
            </p>
          </>,
          "e_t",
        ),
        stage(
          "inject",
          "03 · 记忆投影与上下文门控，注入当前隐藏状态",
          <>
            <Parallel>
              {[
                <div key="memory">
                  <Data tone="violet">取回 eₜ</Data>
                  <Down label="Key / Value 投影" />
                  <Data tone="violet">记忆 Key 与 Value</Data>
                </div>,
                <div key="hidden">
                  <Data tone="blue">当前隐藏状态</Data>
                  <Down label="归一化后参与门控相似度" />
                  <Data tone="rose">记忆注入门</Data>
                </div>,
              ]}
            </Parallel>
            <Down label="门控 × 记忆 Value；逐元素加到原残差" />
            <Add result={vec("x^{engram}_{l,t}", d)}>
              {[
                <Data key="x" tone="blue">
                  原隐藏状态 x
                </Data>,
                <Data key="e" tone="violet">
                  门控后的记忆增量
                </Data>,
              ]}
            </Add>
            <p>
              进入「逐层交互」第 2 或 15
              层可看投影矩阵与逐元素门控的全部连接。此版本没有 Engram
              因果卷积分支，注入后 Attention 与 FFN 照常计算。
            </p>
          </>,
          "X_l^{engram}",
        ),
      ],
    );
  if (chapter === "ced")
    return result(
      "20 层因果编码器 + 20 层解码器。全局压缩 KV 的来源是编码器路径；解码器同时保留本层的本地窗口缓存。",
      [
        stage(
          "enc",
          "01 · 因果编码器 1 → 20",
          <>
            <Data tone="blue">Embedding → 四路残差扩展</Data>
            <Down />
            <Data>Layers 1–20 · 自己及此前位置可见</Data>
            <Down />
            <Tensor name="H^{enc}_{20}" shape="N\times5120" />
            <p>第 2、15 层 Engram；第 3、9、15 层建立编码器侧共享 KV。</p>
          </>,
          "H^{enc}_{20}",
        ),
        stage(
          "cache",
          "02 · 编码器输出形成解码器可复用的全局源",
          <>
            <Parallel>
              {[
                <div key="kv">
                  <Data tone="blue">末编码器隐藏状态</Data>
                  <Down label="Layer 21 的 KV 投影与压缩" />
                  <Tensor name="G_{21}" shape="M\times512" />
                </div>,
                <div key="ix">
                  <Data tone="blue">同一全局源</Data>
                  <Down label="Indexer Key 投影" />
                  <Tensor name="K^I_{21}" shape="M\times128" />
                </div>,
              ]}
            </Parallel>
            <p>
              解码器第一 Full 层建立候选池：2048 个块、每块 8
              行；后续重索引限制在候选池内。
            </p>
          </>,
          "G_{21},K^I_{21}",
        ),
        stage(
          "dec",
          "03 · 解码器 21 → 40：Full / Reindex / Reuse",
          <Parallel>
            {[
              <div key="full">
                <Data>Layer 21 · Full</Data>
                <Down />
                <Data>全局 KV + 索引 + 候选池</Data>
              </div>,
              <div key="reindex">
                <Data>25 / 29 / 33 / 37 · Reindex</Data>
                <Down />
                <Data>共享 KV；重新评分和 Top-K</Data>
              </div>,
              <div key="reuse">
                <Data>其余解码器层 · Reuse</Data>
                <Down />
                <Data>共享 KV；复用最近的选中行</Data>
              </div>,
            ]}
          </Parallel>,
          "H^{dec}_{40}",
        ),
        stage(
          "replay",
          "04 · Prefill 与 Decode 的缓存生命周期",
          <Parallel>
            {[
              <div key="prefill">
                <Data>Prefill · 各输入位置并行计算</Data>
                <Down />
                <Data>按层建立窗口与共享压缩缓存</Data>
              </div>,
              <div key="decode">
                <Data>Decode · 新 token 增量计算</Data>
                <Down />
                <Data>有界 SWA replay 重建缺失状态</Data>
                <p>重建范围受 128-token 窗口约束，避免持久保存全部中间状态。</p>
              </div>,
            ]}
          </Parallel>,
          "\\mathrm{cache}_{next}",
        ),
      ],
    );
  if (chapter === "vision")
    return result(
      "V4.1 Flash 的图像编码支路与文本分词支路在序列输入处汇合。视觉 Token 是图像编码器生成的特征向量。",
      [
        stage(
          "patch",
          "01 · 图片 → Patch 序列",
          <>
            <Data tone="blue">图片预处理后的像素网格</Data>
            <Down label="14 × 14 Patch" />
            <Parallel>
              {["1", "2", "P"].map((p) => (
                <Data key={p}>
                  Patch {p}
                  <small>局部像素块</small>
                </Data>
              ))}
            </Parallel>
            <Down label="Patch 投影 → 1024 维" />
            <Tensor name="V_0" shape="P\times1024" />
          </>,
          "V_0",
        ),
        stage(
          "vit",
          "02 · 32 层视觉 Transformer",
          <>
            <Data>2D RoPE：行、列位置</Data>
            <Down />
            <Data>
              每层：归一化 → 16-Head 注意力 → 残差；归一化 → FFN → 残差
            </Data>
            <Down />
            <Tensor name="V_{32}" shape="P\times1024" />
            <p>
              视觉 FFN 中间宽度 2816；视觉位置采用二维坐标，文本位置使用序列索引
              t。
            </p>
          </>,
          "V_{32}",
        ),
        stage(
          "project",
          "03 · 3×3 Pixel-unshuffle 与两层投影",
          <>
            <Parallel>
              {["1", "2", "9"].map((p) => (
                <div key={p}>{vec(`v_${p}`, 1024)}</div>
              ))}
            </Parallel>
            <Down label="空间 3×3 邻域折叠到通道，序列长度约缩为 1/9" />
            {vec("v^{packed}", 9216)}
            <Down label="两层 MLP Projector → 语言模型特征宽度" />
            {vec("v^{text}", 5120)}
          </>,
          "V^{text}",
        ),
        stage(
          "merge",
          "04 · 视觉特征替换图像占位位置",
          <>
            <Parallel>
              {[
                <Data key="text" tone="blue">
                  文本 ID → Embedding
                </Data>,
                <Data key="vision" tone="violet">
                  视觉特征 → 图像占位位置
                </Data>,
              ]}
            </Parallel>
            <Down label="按聊天模板顺序组成同一输入序列" />
            <Tensor name="H^{in}_1" shape="N\times5120" />
          </>,
          "H^{in}_1",
        ),
      ],
    );
  if (chapter === "dspark")
    return result(
      "DSpark 包含草拟和验证两个生成阶段。配置包含 3 个附加预测层和 5 位置块；目标模型验证草稿后确定最终输出。",
      [
        stage(
          "context",
          "01 · 主干提供条件状态",
          <>
            <Parallel>
              {["38", "39", "40"].map((l) => (
                <Data key={l}>Layer {l} 隐藏状态</Data>
              ))}
            </Parallel>
            <Down label="映射到草拟分支" />
            <Data>当前已接受 token + 后续噪声占位</Data>
          </>,
          "H^{condition}",
        ),
        stage(
          "draft",
          "02 · 5 位置块的半自回归草拟",
          <>
            <Parallel>
              {["1", "2", "3", "4", "5"].map((i) => (
                <Data key={i} tone={i === "1" ? "blue" : "rose"}>
                  位置 {i}
                  <small>{i === "1" ? "条件 token" : "待预测位置"}</small>
                </Data>
              ))}
            </Parallel>
            <Down label="3 个附加预测层更新草拟状态" />
            <Data>Markov 草拟模块：低秩 256 · 128 个专家 · 激活 3 个</Data>
            <Down />
            <Data tone="rose">候选 token 与置信度</Data>
          </>,
          "\\mathrm{draft}",
        ),
        stage(
          "verify",
          "03 · 目标模型验证后提交",
          <>
            <Data>候选块 → 目标模型批量验证</Data>
            <Down />
            <Parallel>
              {[
                <div key="accept">
                  <Data tone="green">接受前缀</Data>
                  <Down />
                  <Data>追加到已确认序列</Data>
                </div>,
                <div key="reject">
                  <Data tone="rose">未通过的位置</Data>
                  <Down />
                  <Data>按验证规则修正，重新草拟后续</Data>
                </div>,
              ]}
            </Parallel>
            <p>
              图中演示控制关系；实际置信度阈值与验证策略以官方推理实现为准，不用示意数值冒充默认参数。
            </p>
          </>,
          "\\mathrm{accepted\\ tokens}",
        ),
      ],
    );
  if (chapter === "training") {
    references.push({
      title: "官方模型说明",
      url:
        model.id === "r1"
          ? "https://github.com/deepseek-ai/DeepSeek-R1"
          : `https://huggingface.co/deepseek-ai/${model.source}`,
    });
    return result(
      model.id === "r1"
        ? "这里介绍原始 DeepSeek-R1。R1 的主要差异在训练路线；推理仍使用 V3 系列 MLA / MoE 主干。"
        : model.id === "v31"
          ? "V3.1 的思考开关由聊天模板控制。两种模式共用同一模型权重。"
          : "训练路径和推理主干分开：MTP 在训练中增加未来 token 的预测目标。",
      model.id === "r1"
        ? [
            stage(
              "base",
              "01 · V3-Base → 冷启动 SFT",
              <>
                <Data>V3-Base 主干</Data>
                <Down />
                <Data>少量高质量长推理数据 → 监督微调</Data>
              </>,
              "\\theta_{cold}",
            ),
            stage(
              "rl",
              "02 · 推理强化学习",
              <>
                <Data>同一问题生成一组回答</Data>
                <SplitArrows count={3} />
                <Parallel>
                  {["1", "2", "G"].map((i) => (
                    <Data key={i}>回答 {i} → 可验证奖励</Data>
                  ))}
                </Parallel>
                <Down label="组内相对奖励 → GRPO 优化" />
                <Data>强化推理能力</Data>
              </>,
              "\\theta_{reason}",
            ),
            stage(
              "sft",
              "03 · 拒绝采样，再做 SFT",
              <>
                <Data>筛选推理模型的正确、高质量输出</Data>
                <Down />
                <Data>合并推理与非推理任务数据</Data>
                <Down />
                <Data>重新监督微调</Data>
              </>,
              "\\theta_{sft}",
            ),
            stage(
              "final",
              "04 · 全场景 RL → R1",
              <>
                <Parallel>
                  {[
                    <Data key="r">推理任务 · 正确性奖励</Data>,
                    <Data key="g">通用任务 · 有用性与安全性奖励</Data>,
                  ]}
                </Parallel>
                <Down />
                <Data>最终 DeepSeek-R1</Data>
                <p>
                  R1-Zero 从 V3-Base 直接进行 RL；R1 使用冷启动数据准备
                  初始策略。
                </p>
              </>,
              "\\theta_{R1}",
            ),
          ]
        : model.id === "v31"
          ? [
              stage(
                "base",
                "01 · V3 主干继续长上下文训练",
                <>
                  <Data>V3 Base checkpoint</Data>
                  <Down />
                  <Data>32K / 128K 两阶段长上下文扩展</Data>
                  <Down />
                  <Data>V3.1-Base → 后训练</Data>
                </>,
                "\\theta_{V3.1}",
              ),
              stage(
                "mode",
                "02 · 同权重，两种聊天模板入口",
                <Parallel>
                  {[
                    <div key="think">
                      <Data tone="rose">Assistant 前缀 + &lt;think&gt;</Data>
                      <Down />
                      <Data>思考内容 → &lt;/think&gt; → 回答</Data>
                    </div>,
                    <div key="direct">
                      <Data tone="blue">Assistant 前缀 + &lt;/think&gt;</Data>
                      <Down />
                      <Data>直接回答</Data>
                    </div>,
                  ]}
                </Parallel>,
                "\\mathrm{response}",
              ),
            ]
          : [
              stage(
                "pretrain",
                "01 · 主干语言建模",
                <>
                  <Data>文本序列 → MLA / MoE 主干</Data>
                  <Down />
                  <Data>预测下一个 token → 交叉熵</Data>
                </>,
                "\\mathcal L_{LM}",
              ),
              stage(
                "mtp",
                "02 · MTP 训练分支",
                <>
                  <Parallel>
                    {[
                      <Data key="h">当前位置隐藏状态</Data>,
                      <Data key="e">下一位置 token 的 Embedding</Data>,
                    ]}
                  </Parallel>
                  <Down label="分别归一化 → 拼接 → 投影 → 附加 Transformer" />
                  <Data>预测更后一个 token → MTP 损失</Data>
                  <p>保留因果依赖；可在推理时移除，也可用于投机解码。</p>
                </>,
                "\\mathcal L_{MTP}",
              ),
              stage(
                "post",
                "03 · 后训练",
                <>
                  <Data>监督微调 SFT</Data>
                  <Down />
                  <Data>GRPO 强化学习</Data>
                  <Down />
                  <Data>指令模型</Data>
                </>,
                "\\theta_{V3}",
              ),
            ],
    );
  }
  throw new Error(`没有对应结构模板：${chapter}`);
}
