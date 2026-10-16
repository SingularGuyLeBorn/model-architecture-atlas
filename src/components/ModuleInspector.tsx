import { memo } from "react";
import {
  BookOpen,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
} from "lucide-react";
import { MathFormula } from "./diagram-primitives";

export type InspectorState = {
  mode: "auto" | "open" | "closed";
  nodeId: string | null;
};
export type InspectorAction =
  | { type: "select"; nodeId: string }
  | { type: "open" }
  | { type: "close" };
export function inspectorReducer(
  state: InspectorState,
  action: InspectorAction,
): InspectorState {
  if (action.type === "close") return { ...state, mode: "closed" };
  if (action.type === "open") return { ...state, mode: "open" };
  return {
    nodeId: action.nodeId,
    mode: state.mode === "closed" ? "closed" : "open",
  };
}
export type ExplainedModule = {
  kind: string;
  layer: number;
  phase?: "prefill" | "decode";
  title?: string;
  tex?: string;
  sublayer?: "A" | "F";
  expertId?: number;
};
type Variable = [symbol: string, shape: string, meaning: string];
type Derivation = { title: string; text: string; formula?: string };
export type ModuleExplanation = {
  title: string;
  summary: string;
  variables: Variable[];
  steps: Derivation[];
};
const SOURCE =
  "https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/5254448103b6254fc646dacbca1cbbf20e9216c1/inference/";

export function explainModule(data: ExplainedModule): ModuleExplanation {
  const { kind, layer: l } = data,
    n = data.phase === "decode" ? "1" : "N",
    sub = data.sublayer ?? (kind === "add2" ? "F" : "A");
  const base: Variable[] = [
    ["t", "1", "token 在序列中的位置，从 1 计数；不是 Head 编号。"],
    [
      "N",
      "1",
      "本次 Prefill 的 token 数。Decode 只计算当前位置一行，历史仍保留在缓存中。",
    ],
  ];
  const result = (
    title: string,
    summary: string,
    variables: Variable[],
    steps: Derivation[],
  ): ModuleExplanation => ({
    title,
    summary,
    variables: [...base, ...variables],
    steps,
  });
  if (
    [
      "hc-mix",
      "hc-pre",
      "add1",
      "add2",
      "hc-expand",
      "tensor",
      "state1",
      "output",
      "next-inputs",
    ].includes(kind)
  ) {
    const names: Record<string, string> = {
      "hc-mix": "mHC · 四路残差怎样生成控制系数",
      "hc-pre": "mHC · 四路怎样汇成子层的一路输入",
      add1: "mHC · Attention 输出回写",
      add2: "mHC · FFN 输出回写",
      "hc-expand": "首层四路残差初始化",
      tensor: "本层的四路残差状态",
      state1: "Attention 之后的四路状态",
      output: "本层返回的两个独立对象",
      "next-inputs": "下一层的输入清单",
    };
    const variables: Variable[] = [
      [
        `\\mathcal H_{${l}}`,
        `${n}\\times4\\times5120`,
        "整层状态：token × 残差路 × 路内元素。四路是并行状态，不是四个顺序层。",
      ],
      [
        `\\mathbf h_{${l},k,t}`,
        "1\\times5120",
        "第 t 个 token 的第 k 路残差；k=1…4。图中元素 hₖ,𝑑 省略共同层号、t 与阶段上标。",
      ],
      [
        "\\mathbf f_t",
        "1\\times20480",
        "同一 token 的四路首尾相接：先放路 1 的 5120 个数，再放路 2、3、4。没有相加。",
      ],
      [
        "m_t, r_t",
        "1",
        "mₜ 是这 20480 个数的平方平均值；rₜ=√(mₜ+ε)，是整个 token 共用的分母。",
      ],
      [
        "\\varepsilon;\\epsilon_{HC}",
        "1;1",
        "ε=10⁻²⁰ 用于均方根；εHC=10⁻⁶ 用于 p 与残差混合的归一化。两者用途不同。",
      ],
      [
        "\\bar{\\mathbf f}_t",
        "1\\times20480",
        "每个 fₜ,𝑑 分别除以 rₜ 后的整行；没有 γ 参数。",
      ],
      [
        `W_{${l}}^{HC,${sub}}`,
        "20480\\times24",
        "本子层可学习投影参数。图按行向量右乘表示，官方 F.linear 存储的是其转置。",
      ],
      [
        `\\mathbf u_{${l},t}^{${sub}}`,
        "1\\times24",
        "一次投影产生的 24 个数，1–4、5–8、9–24 分别进入 p、q、C 分支。",
      ],
      [
        "s_1,s_2,s_3;\\;\\mathbf b",
        "3;\\;24",
        "训练得到的三个缩放标量和 24 个偏置。每组共享一个 s，各元素使用自己的 b。",
      ],
      [
        "a^p_j,a^q_j,A^C_{kj}",
        "1",
        "对 u 对应元素做缩放加偏置后的中间值。上标 p、q、C 仅表示所属分支。",
      ],
      [
        "v^p_j,v^q_j",
        "1",
        "分别等于 σ(aᵖⱼ)、σ(aᑫⱼ)。p 在 vᵖ 上加 εHC，q 把 vᑫ 乘以 2。",
      ],
      [
        "U^C,B^C,A^C,T,C^{(i)}",
        "4\\times4",
        "依次是 u 的第 9–24 项重排、对应偏置、仿射结果、行 Softmax 加 εHC 的结果、第 i 轮行列归一化后的矩阵。",
      ],
      [
        `\\mathbf p_{${l},t}^{${sub}}`,
        "1\\times4",
        "供下一子层汇合的权重。A 侧产生的 p 给本层 FFN；F 侧产生的 p 给下一层 Attention，末层则给输出头。",
      ],
      [
        `\\mathbf q_{${l},t}^{${sub}}`,
        "1\\times4",
        "当前子层的四个回写权重；不是注意力 Query。第 j 路把同一个输出 o 的每个元素乘以 qⱼ。",
      ],
      [
        `C_{${l},t}^{${sub}}`,
        "4\\times4",
        "旧残差的混合系数。行 k 对应来源路，列 j 对应目标路；不能摊平成一个标量。",
      ],
      [
        `\\mathbf o_{${l},t}`,
        "1\\times5120",
        "当前 Attention 输出投影或 FFN 专家加权汇总的第 t 行，不是从 q 生成。",
      ],
      [
        "\\mathbf r_j",
        "1\\times5120",
        "四路旧残差按 C 的第 j 列加权求和；随后与 qⱼ·o 相加。",
      ],
    ];
    const steps: Derivation[] = [
      {
        title: "1 · 拼接不改变每个数",
        text: "把四个 5120 维行向量横向接在一起。所谓特征轴，就是每路内部从第 1 个到第 5120 个元素的方向。",
        formula: "f_{t,(k-1)5120+d}=h_{k,d}",
      },
      {
        title: "2 · 联合归一化与投影",
        text: "四路一起算一个均方根。官方先做线性投影再乘倒均方根；因两者线性等价，图按先归一化再投影展示。ε=10⁻²⁰。",
        formula: `\\bar{\\mathbf f}_t=\\mathbf f_t/r_t,\\quad \\mathbf u_{${l},t}^{${sub}}=\\bar{\\mathbf f}_t W_{${l}}^{HC,${sub}}`,
      },
      {
        title: "均方根的分母来自哪里",
        text: "先对所有 20480 个元素平方求和，再除以元素数；加 ε 后开平方。每个元素都除以这个相同的标量，得到 f̄。",
        formula:
          "m_t=\\frac1{20480}\\sum_{d=1}^{20480}f_{t,d}^2,\\quad r_t=\\sqrt{m_t+\\varepsilon}",
      },
      {
        title: "3 · p、q 使用不同的四个数",
        text: "σ(a)=1/(1+exp(−a))。p 分支加 10⁻⁶ 保持正值；q 分支将每个 sigmoid 结果乘以 2，范围为 (0,2)。两者没有先后依赖。",
        formula:
          "p_j=\\sigma(s_1u_j+b_j)+10^{-6},\\quad q_j=2\\sigma(s_2u_{4+j}+b_{4+j})",
      },
      {
        title: "4 · 16 个数排成 4×4",
        text: "u₉…u₁₂ 是第一行，u₁₃…u₁₆ 是第二行，依次到 u₂₄。先逐行 Softmax，加 εHC，再按列归一化；随后再做 19 轮行、列归一化。行和与列和近似为 1。",
        formula: "A^C_{kj}=s_3u_{8+4(k-1)+j}+b_{8+4(k-1)+j}",
      },
      {
        title: "行 Softmax 与列归一化的分母不同",
        text: "对第 k 行先减最大值 mₖ，取指数 eₖⱼ，再除以该行指数之和并加 εHC，得到 T。第 j 列用该列四个 T 的和加 εHC 作分母，得到第 1 轮 C。后面 19 轮只重复按行、按列除以对应和加 εHC，不再取指数。这里 mₖ 是行最大值，不是前面带 token 下标的均方值 mₜ。",
        formula:
          "T_{kj}=\\frac{e^{A^C_{kj}-\\max_j A^C_{kj}}}{\\sum_v e^{A^C_{kv}-\\max_j A^C_{kj}}}+\\epsilon_{HC},\\quad C^{(1)}_{kj}=\\frac{T_{kj}}{\\sum_v T_{vj}+\\epsilon_{HC}}",
      },
      {
        title: "5 · 当前子层的两个并行回写分支",
        text: "左边用 C 混合旧残差得到 rⱼ；右边让同一个 o 分别乘各路 qⱼ。右边不读取 rⱼ；两边完成后才逐元素相加。",
        formula:
          "\\mathbf h'_j=\\underbrace{\\sum_{k=1}^{4}c_{kj}\\mathbf h_k}_{\\mathbf r_j}+q_j\\cdot\\mathbf o",
      },
      {
        title: "6 · 下一次汇合才使用 p",
        text: "p 和四路 h′ 分别传递，不把 p 加进残差。下一子层每一路乘自己的 p，再逐元素累加。首层 Attention 使用初始化 p=(1,0,0,0)。",
        formula: "\\mathbf h^{pre}_t=\\sum_{j=1}^{4}p_j\\mathbf h'_j",
      },
    ];
    return result(
      names[kind],
      "mHC 同时保留四路残差。系数支路负责生成下一次汇合权重 p，以及当前回写使用的 q、C；它不替代 Attention 或 FFN 的计算。",
      variables,
      steps,
    );
  }
  if (["norm1", "norm2", "query-norm"].includes(kind))
    return result(
      "RMSNorm · 每行怎样归一化",
      "只在同一个 token 的元素之间计算平方平均值，不跨 token 求平均。",
      [
        [
          "\\mathbf z_i",
          `1\\times d`,
          "待归一化的一行；Attention / FFN 输入 d=5120，Query 低秩 d=1280。",
        ],
        ["r_i", "1", "本行均方根；每个元素都除以同一个数。"],
        [
          "\\boldsymbol\\gamma",
          "1\\times d",
          "训练得到的逐元素缩放参数；每个通道一个，所有 token 共用。",
        ],
        [
          "\\mathbf y_i",
          "1\\times d",
          "归一化、缩放后的输出行，所有行堆成输出矩阵。",
        ],
      ],
      [
        {
          title: "平方 → 平均 → 开方",
          text: "平方避免正负抵消，平均消除维度数量影响，ε 防止零分母。",
          formula: "r_i=\\sqrt{\\frac1d\\sum_{j=1}^{d}z_{i,j}^2+\\varepsilon}",
        },
        {
          title: "每个元素除以 r，再乘自己的 γ",
          text: "同一分母用于所有元素，但 γⱼ 随元素索引变化。",
          formula: "y_{i,j}=\\gamma_j z_{i,j}/r_i",
        },
      ],
    );
  if (["projection-q", "query-row"].includes(kind))
    return result(
      "Query · 整段投影、取行、分 Head",
      "Prefill 对 N 行一起投影；图中取第 t 行只是展开其中一个 token 的计算。Decode 才只生成当前一行。",
      [
        [`X_${l}`, `${n}\\times5120`, "本层 Attention 输入归一化后的矩阵。"],
        [
          `Q_${l}^r`,
          `${n}\\times1280`,
          "第一次低秩投影的结果，也是 Indexer 的 Query 来源。",
        ],
        [`W_${l}^{Q\\downarrow}`, "5120\\times1280", "第一阶段参数。"],
        [
          `W_${l}^{Q\\uparrow}`,
          "1280\\times32768",
          "第二阶段参数，将每行展开为 64×512 个数。",
        ],
        [
          `\\widetilde Q_${l}`,
          `${n}\\times32768`,
          "完整宽矩阵；不能等同于单个向量。",
        ],
        [
          `\\mathbf q_{${l},h,t}`,
          "1\\times512",
          "第 t 行的第 h 个连续 512 元素块，h=1…64。",
        ],
      ],
      [
        {
          title: "两级线性映射",
          text: "先降至 1280 维并做 RMSNorm，再升至 64×512 维。",
          formula: `\\widetilde Q_${l}=\\operatorname{RMSNorm}(X_${l}W_${l}^{Q\\downarrow})W_${l}^{Q\\uparrow}`,
        },
        {
          title: "分块不是求和",
          text: "第 h 块对应列 (h−1)×512+1 到 h×512；每个 Head 读取不同块，token 位置 t 不改变。",
        },
      ],
    );
  if (
    [
      "projection-kv",
      "swa-window",
      "swa-output",
      "kv-merge",
      "global-select",
      "compressor",
      "indexer",
    ].includes(kind)
  ) {
    const titles: Record<string, string> = {
      "projection-kv": "本层独立 KV · 投影、归一化与位置旋转",
      "swa-window": "SWA · 当前 Query 的因果窗口",
      "swa-output": "SWA-only · 只读取本地窗口",
      "kv-merge": "KV 拼接 · 本地窗口与选中全局行",
      "global-select": "全局 KV · 用行号取行",
      compressor: "Compressor · 生成共享全局 KV",
      indexer: "Indexer · 生成分数，再选择行号",
    };
    return result(
      titles[kind],
      "本地窗口属于每一层；全局 KV 只由源层生成，后续层按配置复用。Indexer 输出的是行号，向量数据仍来自全局 KV。",
      [
        [`X_${l}`, `${n}\\times5120`, "本层归一化后的输入。"],
        [
          `U_${l}`,
          "N\\times512",
          "本层独立 KV 历史矩阵；Decode 只新生成当前行，追加到本层缓存。",
        ],
        [
          `W_${l}^{KV,\\mathrm{SWA}}`,
          "5120\\times512",
          "本层 KV 投影参数，各层独立。",
        ],
        [
          "r=max(1,t-127)",
          "1",
          "窗口起点；最多读取最近 128 行，不读取 t 之后的行。",
        ],
        [
          `U_{${l},t}^{SWA}`,
          "\\min(128,t)\\times512",
          "从 r 到 t 的本地窗口。",
        ],
        ["G", "M\\times512", "共享全局 KV；M 由已生成的历史行和压缩比决定。"],
        [
          "K^{I\\prime}",
          "M\\times128",
          "Indexer 的全局 Key 缓存，不是注意力的最终 KV。",
        ],
        ["I_t", "1\\times K_t", "当前 Query 选中的最多 512 个全局行号。"],
        [
          `KV_{${l},t}`,
          "L_t\\times512",
          "本次注意力真正读取的行；Lₜ 为本地窗口行数加选中全局行数。",
        ],
      ],
      [
        {
          title: "本地分支",
          text: "每层输入乘自己的参数，逐行 RMSNorm，再对最后 64 个元素按相邻二元组旋转，得到本地 KV。",
        },
        {
          title: "共享全局分支",
          text: "Full 层生成全局 KV；压缩比为 2 时，相邻两行按逐元素 gate 权重池化；比为 1 时不池化，也没有 gate。Reindex 层重选行号，Reuse 层沿用已有行号。",
        },
        {
          title: "行号决定取哪些行",
          text: "Indexer 将 Query 与候选 Key 打分，再跨索引 Head 汇总取 Top-512。分数、行号、选中的 KV 是三个不同对象。",
        },
        {
          title: "沿行拼接",
          text: "先本地窗口、后全局选中行。SWA-only 层只有前者。",
          formula: `KV_{${l},t}=\\operatorname{Concat}_{rows}(U_{${l},t}^{SWA},G_t^{selected})`,
        },
      ],
    );
  }
  if (["heads", "concat"].includes(kind))
    return result(
      kind === "heads"
        ? "Attention · QK 得分与 V 加权"
        : "输出投影 · 64 个 Head 怎样回到 5120 维",
      "这里 K 和 V 读取同一潜向量 KV；不能凭常见 Transformer 习惯虚构两份独立投影。",
      [
        ["\\mathbf q_{h,t}", "1\\times512", "当前 token、当前 Head 的 Query。"],
        ["KV_t", "L_t\\times512", "本地窗口与全局选择得到的 KV。"],
        [
          "\\mathbf z_{h,t},\\mathbf a_{h,t}",
          "1\\times L_t",
          "分别是缩放点积分数和 Softmax 后的读取权重。",
        ],
        ["b_h", "1", "可学习的 attention sink 分数，只加入分母，值向量为零。"],
        [
          "\\mathbf o_{h,t}",
          "1\\times512",
          "对 KV 各行按 a 加权求和，并对旋转部分做逆旋转后的输出。",
        ],
        [
          "C_g;W^{O,A}_g;B_g",
          "4096;4096\\times1024;1024",
          "每组 8 个 Head 拼成 4096 维，经第一阶段参数降到 1024 维。",
        ],
        [
          "B;W^{O,B};O",
          "8192;8192\\times5120;5120",
          "8 个组的结果拼接后，经过第二阶段参数回到 5120 维。A/B 表示两阶段，不是幂。",
        ],
      ],
      [
        {
          title: "点积决定读哪里",
          text: "最后 64 个维度应用位置旋转；其余 448 维保留。每个候选 KV 行产生一个分数。",
          formula: "z_i=\\mathbf q\\cdot\\mathbf k_i/\\sqrt{512}",
        },
        {
          title: "归一化与加权求和",
          text: "sink 消耗一部分概率但贡献零输出。不能用 MoE 的路由规则代替这个 Softmax。",
          formula:
            "a_i=\\frac{e^{z_i}}{e^{b_h}+\\sum_j e^{z_j}},\\quad\\mathbf o=\\sum_i a_i\\mathbf v_i",
        },
        {
          title: "旋转与输出投影",
          text: "位置 p=t−1；对相邻元素对 (a,b) 使用旋转矩阵，输出的旋转部分再逆旋转。各 Head 经分组投影后回到残差宽度。",
          formula:
            "(a',b')=(a\\cos\\theta-b\\sin\\theta,\\ a\\sin\\theta+b\\cos\\theta)",
        },
      ],
    );
  if (
    [
      "router",
      "scores",
      "experts",
      "expert-output",
      "expert-weight",
      "expert-scale",
      "expert-weighted",
      "moe-sum",
      "moe-output",
      "moe-input",
    ].includes(kind)
  )
    return result(
      "MoE · 路由、专家内部与加权汇总",
      "共享专家始终参与；Router 选择非共享专家。图上的分数和专家编号是说明结构的数值示例，不代表真实 token 激活。",
      [
        [
          `Y_${l}`,
          `${n}\\times5120`,
          "FFN 输入归一化结果，同一个输入分别送共享专家、Router 和选中专家。",
        ],
        [
          `W_${l}^{R}`,
          "5120\\times384",
          "Router 投影参数，每一列对应一个非共享专家。",
        ],
        [
          "s_{t,i};g_{t,i}",
          "1;1",
          "s 是 Router 线性结果经 √softplus 得到的正分数；g 是所选分数归一化后乘 1.5 的权重。选择偏置不进入 g。",
        ],
        [
          "z^R_{t,i};b_i^{select};I_t",
          "1;1;6",
          "zᴿ 为 yₜ 乘专家 i 参数列的结果；bˢᵉˡᵉᶜᵗ 只影响 Top-6 选择；Iₜ 是选中的六个专家编号。",
        ],
        ["d_e", "1", "本模型专家中间宽度为 2304。"],
        [
          "W_i^{gate},W_i^{up}",
          "5120\\times d_e",
          "两份独立参数；gate 经过 SiLU，up 不经过。",
        ],
        [
          "Z_i,A_i,B_i,C_i",
          `${n}\\times d_e`,
          "gate 线性结果、SiLU 结果、up 结果、逐元素乘积。",
        ],
        ["W_i^{down}", "d_e\\times5120", "把专家中间宽度投回主干宽度的参数。"],
        [
          "E_i(Y),O^{FFN}",
          `${n}\\times5120`,
          "单个专家输出与最终加权汇总。共享专家也单独接入累加器。",
        ],
      ],
      [
        {
          title: "先变成正分数，再分别选择和加权",
          text: "线性分数 zᴿ 先做 softplus=ln(1+exp(zᴿ)) 再开平方。用 s 加选择偏置取 Top-6；仅取这六个原始 s，除以它们的和再乘 1.5。不是再做一次 Softmax。",
          formula:
            "s_{t,i}=\\sqrt{\\ln(1+e^{z^R_{t,i}})},\\quad g_{t,i}=1.5\\frac{s_{t,i}}{\\sum_{j\\in I_t}s_{t,j}}",
        },
        {
          title: "两条专家分支并行",
          text: "同一 Y 分别乘 gate 与 up 参数；SiLU 是 z·σ(z)，不是把输入直接通过一个黑箱。",
          formula:
            "A_i=Z_i\\odot\\sigma(Z_i),\\ Z_i=YW_i^{gate},\\ B_i=YW_i^{up}",
        },
        {
          title: "逐元素门控与降维",
          text: "A、B 同形状，按相同元素位置相乘，不是矩阵乘法；随后才矩阵乘 down 参数。",
          formula: "E_i(Y)=(A_i\\odot B_i)W_i^{down}",
        },
        {
          title: "逐路加权后求和",
          text: "每个 token 只汇总被选中的 routed experts，加上共享专家。权重由该版本 Router 生成，不额外假设一次 attention Softmax。",
          formula: "O^{FFN}=E_{shared}(Y)+\\sum_{i\\in I_t}g_{t,i}E_i(Y)",
        },
      ],
    );
  if (["engram-lookup", "engram-inject"].includes(kind))
    return result(
      "Engram · token 历史查表与四路注入",
      "仅第 2、15 层使用。它读取 token ID 历史，通过哈希检索记忆，再根据当前残差决定每一路接收多少。不是凭空出现的第五路残差。",
      [
        ["\\mathrm{IDs}", "\\leq4", "当前位置及最多三个历史 token ID。"],
        [
          "\\mathbf k_c,\\mathbf v",
          "1\\times5120",
          "查表结果投影产生四个 Key 和一个共享 Value。",
        ],
        ["\\mathbf h_c", "1\\times5120", "当前 token 的第 c 路残差；共四路。"],
        ["g_c", "1", "由本路残差和对应 Key 的相似度产生的接收权重。"],
        [
          "\\widehat{\\mathbf h}_c,\\widehat{\\mathbf k}_c",
          "1\\times5120",
          "两路分别 RMSNorm 后的向量；各自使用可学习 γ 参数。",
        ],
        [
          "d_c,a_c,s_c",
          "1",
          "归一化点积、绝对值下限保护、保留点积符号的平方根。随后对 s 做 sigmoid 得到 g。",
        ],
      ],
      [
        {
          title: "构造 2/3/4-gram",
          text: "每种长度使用多个哈希表，合计 24 次查表；向量拼接后投影，不需要扫描整张词表。",
        },
        {
          title: "分别计算四路门控",
          text: "每路用自己的归一化残差与 Key 点积并除以 √5120。对 |d| 取至少 10⁻⁶ 后开平方，保留原 d 的符号，再做 sigmoid。Value 是共享来源，但每路乘不同门控；图像位置门控设为 0。",
          formula:
            "d_c=\\widehat{\\mathbf h}_c\\widehat{\\mathbf k}_c^T/\\sqrt{5120},\\quad g_c=\\sigma(\\operatorname{copysign}(\\sqrt{\\max(|d_c|,10^{-6})},d_c))",
        },
        {
          title: "注入不是替换",
          text: "门控 Value 与原残差逐元素相加，之后仍保留四路，再进入 Attention 前的 mHC 汇合。",
          formula: "\\mathbf h_c^E=\\mathbf h_c^{in}+g_c\\mathbf v",
        },
      ],
    );
  if (
    ["tokenizer", "embedding", "prior-layers", "execution-guide"].includes(kind)
  )
    return result(
      "输入链 · 文本、Token ID 与首层状态",
      "t 来自分词后 token 在序列里的位置，不是手工任意挑选的模型参数。",
      [
        [
          "\\mathrm{IDs}",
          "N",
          "分词器产生的离散编号，一个 token 对应一个位置。",
        ],
        ["E", "V\\times5120", "训练得到的 Embedding 表；V 为词表大小。"],
        [
          "H_1",
          "N\\times5120",
          "按 token ID 查出的向量按序排列，作为主干输入。",
        ],
      ],
      [
        {
          title: "Tokenizer → Embedding",
          text: "文本先分成 token 并映射 ID，再按 ID 查表；不是将字符编号直接当作连续特征。",
        },
        {
          title: "首层四路与后续层",
          text: "首层将表示扩展成四路残差；后续层读取上层状态及汇合权重。Prefill 并行处理多行，Decode 只新算当前行。",
        },
      ],
    );
  return result(
    data.title ?? "模块内的矩阵 / 运算",
    "这是所属模块内部的一个具体数据对象或运算。下方连接清单标出真实来源和消费端；公式中的层号与当前所选层一致。",
    data.tex
      ? [
          [
            data.tex,
            "见图中维度",
            "所选框的变量或运算；父模块说明负责解释其生成过程。",
          ],
        ]
      : [],
    [
      {
        title: "阅读顺序",
        text: "沿输入箭头找到操作数，再看乘法、逐元素运算或累加器；框内行列代表张量组成，省略号不参与计算。",
      },
    ],
  );
}

export type ModuleConnection = {
  id: string;
  direction: "in" | "out";
  label?: string;
  other: string;
};
export const ModuleInspector = memo(function ModuleInspector({
  data,
  connections,
  onClose,
}: {
  data?: ExplainedModule;
  connections: ModuleConnection[];
  onClose: () => void;
}) {
  const explanation = data ? explainModule(data) : null;
  return (
    <aside
      className="module-inspector"
      aria-label="模块解释"
      data-module-inspector
    >
      <header>
        <div>
          <span className="inspector-kicker">
            <BookOpen size={14} /> 结构旁注
          </span>
          <h2 aria-live="polite">
            {explanation?.title ?? "选择一个框开始阅读"}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label="关闭模块解释"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div
        className="inspector-scroll"
        key={data?.kind + ":" + data?.layer + ":" + data?.sublayer}
      >
        {!data ? (
          <p>
            点击图中的框查看说明。关闭后，再点其他框不会自动打开；使用“显示解释”恢复。
          </p>
        ) : (
          <>
            <div className="inspector-meta">
              Layer {data.layer} ·{" "}
              {data.phase === "decode"
                ? "Decode / 当前一行"
                : "Prefill / N 行并行"}
            </div>
            <p className="inspector-summary">{explanation!.summary}</p>
            {connections.length > 0 && (
              <section>
                <h3>实际连接</h3>
                <div className="inspector-connections">
                  {connections.map((connection) => (
                    <div key={connection.id}>
                      <span>
                        {connection.direction === "in" ? (
                          <ArrowDownLeft size={14} />
                        ) : (
                          <ArrowUpRight size={14} />
                        )}{" "}
                        {connection.direction === "in" ? "来自" : "送往"}{" "}
                        {connection.other}
                      </span>
                      {connection.label ? (
                        <MathFormula tex={connection.label} />
                      ) : (
                        <small>操作关系线 · 数据名称见相接的框</small>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
            <section>
              <h3>变量字典</h3>
              <dl className="inspector-variables">
                {explanation!.variables.map(([symbol, shape, meaning]) => (
                  <div key={symbol}>
                    <dt>
                      <MathFormula tex={symbol} />
                      <small>
                        <MathFormula tex={shape} />
                      </small>
                    </dt>
                    <dd>{meaning}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section>
              <h3>计算过程与推导</h3>
              {explanation!.steps.map((step) => (
                <article key={step.title}>
                  <h4>{step.title}</h4>
                  <p>{step.text}</p>
                  {step.formula && (
                    <div className="inspector-formula">
                      <MathFormula tex={step.formula} />
                    </div>
                  )}
                </article>
              ))}
            </section>
            <footer>
              <ExternalLink size={14} />
              <a href={SOURCE + "model.py"} target="_blank" rel="noreferrer">
                官方推理代码
              </a>
              <a href={SOURCE + "kernel.py"} target="_blank" rel="noreferrer">
                mHC 系数与归一化实现
              </a>
              <span>固定版本 5254448 · 图中层号从 1 开始</span>
            </footer>
          </>
        )}
      </div>
    </aside>
  );
});
