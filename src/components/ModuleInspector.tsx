import { memo } from "react";
import { BookOpen, X, ExternalLink } from "lucide-react";
import { MathFormula } from "./diagram-primitives";
import type { InternalSelection } from "./internal-selection";
import { cacheExplanation, cachePolicy } from "./CacheSemantics";
import { ENGRAM_PURPOSE } from "./EngramPurpose";

export type InspectorState = {
  mode: "auto" | "open" | "closed";
  preview?: boolean;
  nodeId: string | null;
  detail?: InternalSelection;
};
export type InspectorAction =
  | { type: "select"; nodeId: string; detail?: InternalSelection }
  | { type: "open" }
  | { type: "preview" }
  | { type: "leave" }
  | { type: "context-change" }
  | { type: "close" };
export function inspectorReducer(
  state: InspectorState,
  action: InspectorAction,
): InspectorState {
  const persistent = {
    mode: state.mode,
    nodeId: state.nodeId,
    ...(state.detail ? { detail: state.detail } : {}),
  };
  if (action.type === "close") return { ...persistent, mode: "closed" };
  if (action.type === "open") return { ...persistent, mode: "open" };
  if (action.type === "preview")
    return state.mode === "open" ? state : { ...persistent, preview: true };
  if (action.type === "leave") return state.preview ? persistent : state;
  if (action.type === "context-change")
    return {
      mode: state.mode,
      nodeId: state.nodeId,
    };
  return {
    nodeId: action.nodeId,
    ...(action.detail ? { detail: action.detail } : {}),
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

export type ModuleExplanation = { title: string; paragraphs: string[] };
const SOURCE =
  "https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/5254448103b6254fc646dacbca1cbbf20e9216c1/inference/";
const TITLES: Record<string, string> = {
  "hc-mix": "mHC · 四路残差怎样生成控制系数",
  "hc-pre": "mHC · 四路怎样汇成子层的一路输入",
  add1: "mHC · Attention 输出回写",
  add2: "mHC · FFN 输出回写",
  "hc-expand": "首层四路残差初始化",
  tensor: "本层的四路残差状态",
  state1: "Attention 之后的四路状态",
  output: "本层返回的两个独立对象",
  "next-inputs": "下一层的输入清单",
  norm1: "RMSNorm · 每行怎样归一化",
  norm2: "RMSNorm · 每行怎样归一化",
  "query-norm": "RMSNorm · Query 的低秩结果",
  "projection-q": "Query · 整段投影、取行、分 Head",
  "query-row": "Query · 第 t 行怎样分成 Head",
  "projection-kv": "本层独立 KV · 投影、归一化与位置旋转",
  "swa-window": "SWA · 当前 Query 的因果窗口",
  "swa-output": "局部窗口 · 所选 KV 行组成 U",
  "kv-merge": "KV 拼接 · 本地窗口与选中全局行",
  "global-select": "全局 KV · 用行号取行",
  compressor: "Compressor · 生成共享全局 KV",
  indexer: "Indexer · 生成分数，再选择行号",
  heads: "Attention · QK 得分与 V 加权",
  concat: "输出投影 · 64 个 Head 怎样回到 5120 维",
  router: "MoE · 路由怎样选择和加权",
  scores: "MoE · 专家分数与 Top-6",
  experts: "MoE · 专家内部的两条并行投影",
  "expert-output": "MoE · 专家输出",
  "expert-weight": "MoE · 专家混合权重",
  "expert-scale": "MoE · 专家混合权重",
  "expert-weighted": "MoE · 加权后的专家输出",
  "moe-sum": "MoE · 专家输出加权汇总",
  "moe-output": "MoE · 专家输出加权汇总",
  "moe-input": "MoE · 输入怎样分给各专家",
  "engram-lookup": "Engram · token 历史怎样查表",
  "engram-inject": "Engram · 检索结果怎样注入四路残差",
  tokenizer: "输入链 · 文本怎样变成 Token ID",
  embedding: "输入链 · Embedding 与首层状态",
  "prior-layers": "输入链 · 前序层与当前状态",
  "execution-guide": "输入链 · Prefill 与 Decode",
  "cache-sharing": "40 层缓存共享 · G 与选行 ID 的独立来源链",
};
const MODULE_GROUP: Record<string, keyof typeof PARAGRAPHS> = {
  "hc-mix": "mhc",
  "hc-pre": "mhc",
  add1: "mhc",
  add2: "mhc",
  "hc-expand": "initialization",
  tensor: "mhc",
  state1: "mhc",
  output: "mhc",
  "next-inputs": "mhc",
  norm1: "norm",
  norm2: "norm",
  "query-norm": "norm",
  "projection-q": "query",
  "query-row": "query",
  "projection-kv": "kv",
  "swa-window": "kv",
  "swa-output": "kv",
  "kv-merge": "kv",
  "global-select": "kv",
  compressor: "kv",
  indexer: "kv",
  heads: "attention",
  concat: "attention",
  router: "moe",
  scores: "moe",
  experts: "moe",
  "expert-output": "moe",
  "expert-weight": "moe",
  "expert-scale": "moe",
  "expert-weighted": "moe",
  "moe-sum": "moe",
  "moe-output": "moe",
  "moe-input": "moe",
  "engram-lookup": "engram",
  "engram-inject": "engram",
  tokenizer: "input",
  embedding: "input",
  "prior-layers": "input",
  "execution-guide": "input",
  "cache-sharing": "kv",
};
// 旁注以完整段落讲解，变量和公式在其首次参与计算的位置解释，不另铺词条或步骤卡片。
const PARAGRAPHS = {
  initialization: [
    "首层初始化把 Embedding 输出矩阵 $E$ 完整复制四份。$E$ 的形状为 $@N\\times5120$，每一行对应一个 token 的全部 5120 个特征；复制后的 $H_{1,1}^{in}$、$H_{1,2}^{in}$、$H_{1,3}^{in}$、$H_{1,4}^{in}$ 都等于 $E$，每份仍为 $@N\\times5120$。新增的四路轴把状态组织为 $@N\\times4\\times5120$，每一路保留完整特征和原有 token 顺序。",
    "第 1 层 Attention 首次汇合使用 $\\mathbf p_t^{init}=(1,0,0,0)$，因此取第 1 路作为输入；四路此时完全相同，所以汇合结果仍等于原来的 Embedding 输出。Attention 对汇合后的输入只计算一次，FFN 也对自己的汇合输入只计算一次；多头注意力和 MoE 专家的内部并行各自按模块结构执行。",
    "每个子层回写时，系数矩阵 $C$ 混合四路旧状态，接收权重 $q$ 把同一个子层输出按不同权重加入各路，四路内容由此逐步分化。后续汇合使用的 $p$ 由前一子层的 mHC 系数分支生成，其数值取决于残差内容和训练得到的参数。四路完整状态沿后续各层继续传递。",
  ],
  mhc: [
    "四路残差的汇合可以直接看成矩阵乘法。固定 token t，把这个位置的四路完整行向量按路号排成 $4\\times5120$ 的矩阵 $H_{@L,t}$；它的每一行对应一路，每一列对应同一个特征。左边的权重行向量 $\\mathbf p$ 为 $1\\times4$，因此 $\\mathbf p H_{@L,t}$ 得到一个 $1\\times5120$ 的汇合行向量。输出的第 d 项等于 p 与 H 第 d 列的点积，即 $\\sum_{c=1}^4p_c h_{c,d}$。H 的阶段上标沿用输入框，Attention 汇合读取层输入或 Engram 注入后的状态，FFN 汇合读取 Attention 回写后的状态。",
    "汇合生成的新值单独记名：Attention 前的结果为 $\\mathbf z_{@L,t}^{A}$，FFN 前的结果为 $\\mathbf z_{@L,t}^{F}$。各 token 使用各自的权重独立汇合，所得行按 token 顺序组成 $Z_{@L}^{A}$ 或 $Z_{@L}^{F}$，形状均为 $@N\\times5120$。这两个矩阵分别经 RMSNorm 得到 $X_{@L}$、$Y_{@L}$，再进入 Attention、FFN。四路残差 $\\mathcal H$ 保持独立的状态与回写路径；汇合结果 Z 则只有一路，三个符号对应不同的数据对象。",
    "mHC 在第 @L 层同时保留四路残差，每一路都是完整的 5120 维向量。四路最初由 Embedding 完整复制得到，随后经混合与回写逐步分化。整个状态 $\\mathcal H_{@L}$ 的形状为 $@N\\times4\\times5120$，三个轴依次对应 token、残差路和路内元素。固定位置 $t$ 后，$\\mathbf h_{@L,k,t}$ 表示第 $k$ 路的行向量，$k$ 从 1 到 4。四路先按 $p$ 汇合成一个 5120 维输入，Attention 对汇合后的输入只计算一次；FFN 也对自己的汇合输入只计算一次，再把各自的输出回写四路。",
    "每个子层计算前，mHC 系数分支读取这一时刻的四路残差，生成 $p$、$q$、$C$。其中 $q$ 和 $C$ 用于当前子层回写，$p$ 留给下一次汇合：本层 Attention 生成的 $p$ 供本层 FFN 使用，本层 FFN 生成的 $p$ 供下一层 Attention 使用，末层则供输出头前的汇合。首层 Attention 首次使用初始化权重 $(1,0,0,0)$。系数生成所用的参数在训练中学习、推理时固定，具体系数随层、token 和残差内容动态计算，各路可以采用不同权重。",
    "计算系数时，先把同一 token 的四个行向量首尾相接，得到 $1\\times20480$ 的 $\\mathbf f_t$。前 5120 个位置来自第 1 路，接下来依次放第 2、3、4 路，因此拼接只改变排列，不对元素求和。将这 20480 个数平方后取平均，得到 $m_t$；再计算 $r_t=\\sqrt{m_t+\\varepsilon}$，其中 $\\varepsilon=10^{-20}$。每个原元素都除以同一个 $r_t$，组成归一化后的 $\\bar{\\mathbf f}_t$，这里没有可学习的 $\\gamma$。",
    "随后，$\\bar{\\mathbf f}_t$ 右乘本子层的可学习参数 $W_{@L}^{HC,@SUB}$。这个参数矩阵是 $20480\\times24$，所以结果 $\\mathbf u_{@L,t}^{@SUB}$ 是含 24 个数的一行。图按“先归一化、再投影”展开；官方实现先线性投影再乘倒均方根，与此等价，参数存储方向则是图中矩阵的转置。这 24 个数分成互不依赖的三组：第 1–4 项生成 $p$，第 5–8 项生成 $q$，第 9–24 项生成 $C$。",
    "三组各有一个训练得到的缩放标量 $s_1$、$s_2$、$s_3$，24 个位置则各有自己的偏置 $b$。缩放加偏置后得到中间量 $a$，例如 $a^p_j=s_1u_j+b_j$，而 $a^q_j=s_2u_{4+j}+b_{4+j}$。上标只是在区分分支。对每个 $a$ 计算 $\\sigma(a)=1/(1+e^{-a})$，得到 $v^p_j$ 或 $v^q_j$；再分别计算 $p_j=v^p_j+10^{-6}$ 与 $q_j=2v^q_j$。因此 $p$ 保持正值，四项之和可以随输入变化；$q$ 落在 0 到 2 之间。每个 token、每条路分别生成系数，同一路的标量权重用于该路全部 5120 个元素。",
    "生成 $C$ 时，把 $u$ 的第 9–24 项每四个排成一行，组成 $4\\times4$ 的 $U^C$；相应偏置组成同形状的 $B^C$，从而得到 $A^C=s_3U^C+B^C$。先对每一行减去该行最大值、取指数，再除以本行指数之和并加 $\\epsilon_{HC}=10^{-6}$，得到矩阵 $T$。接着，每列除以本列四个数之和加 $\\epsilon_{HC}$，得到 $C^{(1)}$；再做 19 轮行、列归一化，不重复取指数，最后得到行和与列和都接近 1 的 $C$。行号 $k$ 代表来源路，列号 $j$ 代表目标路；这里的稳定项与前面均方根使用的 $\\varepsilon$ 不同。",
    "回写时有两个并行计算。一个计算用 $C$ 的第 $j$ 列混合四路旧残差，得到 $\\mathbf r_j=\\sum_{k=1}^{4}c_{kj}\\mathbf h_k$；另一个计算把当前子层的输出 $\\mathbf o$ 乘以 $q_j$。这里 $\\mathbf o$ 是 Attention 输出投影或 FFN 专家汇总所得的 5120 维行向量；$q_j$ 是目标路 $j$ 的接收权重。两项完成后才逐元素相加，得到 $\\mathbf h'_j=\\mathbf r_j+q_j\\cdot\\mathbf o$。",
    "输出的四路状态与 $1\\times4$ 的 $\\mathbf p_{@L,t}^{@SUB}$ 分开传递。下一次汇合才用每个 $p_j$ 乘对应的 $\\mathbf h'_j$，然后把四项逐元素相加，组成子层的一路输入。Attention 侧产生的 $p$ 给本层 FFN，FFN 侧产生的 $p$ 给下一层 Attention，末层则给输出头；首层 Attention 使用初始化权重 $(1,0,0,0)$。",
  ],
  norm: [
    "RMSNorm 对每个 token 行向量独立调整数值尺度。设当前行是 $\\mathbf z_i$，含 $d$ 个元素；这里的 $i$ 是行号，$d$ 是图中标出的实际宽度。先计算这一行各元素的平方平均值，再加稳定项 $\\varepsilon$ 并开平方，得到 $r_i=\\sqrt{\\frac1d\\sum_jz_{i,j}^2+\\varepsilon}$。平方避免正负数抵消，除以 $d$ 取平均，而稳定项避免零分母。",
    "整条输入行直接除以标量 $r_i$，得到同样长度的向量；有独立缩放参数时再做 $\\mathbf y_i=\\frac{\\mathbf z_i}{r_i}\\odot\\boldsymbol\\gamma$。⊙ 表示对应元素相乘，γ 在不同 token 之间共享。图按一次向量运算表示，不需要先拆成标量再拼回；其逐元素含义仍是 $y_{i,j}=\\gamma_jz_{i,j}/r_i$。批量输入时，各行独立计算并按原顺序组成输出矩阵。",
    "mHC 的联合归一化将同一 token 的四路残差拼接后计算均方根，各原元素除以这个均方根即得到归一化结果。",
  ],
  query: [
    "第 @L 层的 Query 来自 Attention 输入归一化后的 $X_{@L}$，形状是 $@N\\times5120$。每行先乘 $5120\\times1280$ 的可学习参数 $W_{@L}^{Q\\downarrow}$，得到未归一化低秩结果 $\\widehat Q_{@L}^r$；经过 RMSNorm 后得到 $Q_{@L}^r$，同时送往 Indexer 和主 Attention 的升维投影。后者再乘 $1280\\times32768$ 的 $W_{@L}^{Q\\uparrow}$，得到完整矩阵 $\\widetilde Q_{@L}$。",
    "32768 等于 $64\\times512$，因此完整矩阵的每一行可以按连续列切成 64 块，每块 512 个元素。第 $t$ 行对应序列中位置为 $t$ 的 token。第 $h$ 块对应列 $(h-1)\\times512+1$ 到 $h\\times512$，组成 $1\\times512$ 的 $\\mathbf q_{@L,h,t}$，送给对应 Head。分块保持元素数值和顺序。",
    "在 Prefill 中，$N$ 个 token 的行一起完成上述投影，每个位置都产生自己的 64 个 Query 向量；在 Decode 中，只为当前新增位置生成一行。$t$ 始终来自 token 在序列中的位置，$h$ 才是 Head 编号，所以“完整矩阵”“第 $t$ 行”和“第 $h$ 块”是三个不同层次。",
  ],
  kv: [
    "固定当前层与 token，令 W、x、y 分别指图中当前分支带完整下标的参数、输入和结果。参数矩阵中的列满足 $(\\mathbf w_j)_d=W_{d,j}$，因此 $\\mathbf x\\times\\mathbf w_j=y_j$ 得到第 j 个标量，$\\mathbf x\\times W=\\mathbf y$ 得到完整输出行；KV 与 Gate 两个分支各自使用自己的 W。缓存更新的历史矩阵与本步新行是两个数据输入，框外分别标注历史直接读取和组满追加条件。",
    "Indexer 的三路输入有明确的共同来源：四路残差先经 mHC 汇合成 $Z_{@L}^{A}$，再归一化得到 $X_{@L}$。X 的每一行对应一个查询 token；一条支路经低秩 Query 投影和归一化得到 $Q_{@L}^{r}$，另一条直接生成该 token 的 32 个 Head 权重 eta。图中的 X 输入线来自 Attention 输入归一化框。",
    "三路投影使用不同独立参数：主 Query 的 $W_{@L}^{Q\\downarrow}$ 为 5120×1280，$W_{@L}^{Q\\uparrow}$ 为 1280×32768；本地 $W_{@L}^{KV,\\mathrm{SWA}}$ 与全局 $W_{@L}^{KV,G}$ 虽同为 5120×512，却分别存储和优化，互不派生。各自的归一化参数也独立。图的矩阵采用右乘记法，形状是官方线性层权重存储方向的转置。",
    "Full 层的 Compressor 读取上游计算结果 X。$W_{@L}^{KV,G}$ 是独立参数，压缩比为 2 时另有一份独立参数 $W_{@L}^{\\mathrm{gate}}$；两者分别存储和优化，彼此没有计算依赖。本层所有 token 使用同一份参数。这里的独立指参数来源独立，两份参数仍随整个模型联合训练。",
    "每个 $1\\times5120$ 输入行乘完整的 $5120\\times512$ 参数矩阵 $W_{@L}^{KV,G}$，得到 $1\\times512$ 候选 KV 行；压缩比为 2 时，同一输入还并行乘 $W_{@L}^{\\mathrm{gate}}$，得到 512 个 gate 分数。这些输出是随输入变化的运行时计算结果。图中每个 w 框只是原 W 的列切片，所有分量都来自原矩阵；输入行乘单列得到一个标量，乘全部 512 列组成完整输出行。",
    "压缩比为 2 时，相邻两行的 gate 分数逐列做 Softmax，所得权重分别乘候选 KV 的对应元素后相加，再归一化为一条压缩行；压缩比为 1 时，每个投影行直接归一化。所得 RoPE 前矩阵记作 $\\bar G$，分支投影生成索引 Key；另一分支做位置旋转得到全局缓存 G。两条分支保留同样的候选行号 i。Reindex 层读取源层已生成的索引 Key，Reuse 层直接沿用已有行号。",
    "分数矩阵 S 的行 t 表示发起查询的 token，列 i 表示被评价的压缩缓存行。固定 t，将 32 个 Head 未加权的分数行按 Head 顺序组成 $A^I_{@L,t}\\in\\mathbb R^{32\\times M}$，元素对应 $(A^I_{@L,t})_{h,i}:=a^I_{h,t,i}$；排列保留原有分数。权重行 $\\boldsymbol\\eta_{@L,t}\\in\\mathbb R^{1\\times32}$ 左乘它，得到 $\\mathbf s_{@L,t}=\\boldsymbol\\eta_{@L,t}\\times A^I_{@L,t}$，形状是 $1\\times M$。下方 i=1、2、M 的求和器分别展开这次矩阵乘法的三列，与上方矩阵乘法表达同一次计算。",
    "每个 token 的 Query 不同，因此各自的 $A^I_{@L,t}$ 和权重行也不同。Prefill 对各 token 分别做上述乘法，所得分数行按 token 顺序组成 $S_{@L}$；Decode 只计算当前新增 token 的一行。整个过程按查询 token 分批完成，每批使用对应的 A。每个 Query token 对因果可见候选分别打分，屏蔽不可见候选后，Top-K 沿每一行的缓存列选择；查询 token 本身保持原来的顺序与数量。",
    "Decode 的 Full 层只对本步新增压缩行（若有）乘 $W_{@L}^{IK}$，生成一条索引 Key，再归一化、位置旋转和量化。已有的索引 Key 原样保留，新行接在末尾，与 G 的新增行一一对应。压缩组尚未完成时，G 和索引 Key 都不追加；历史行不会重新乘投影矩阵。",
    "本地 KV 从第 @L 层归一化后的输入 $X_{@L}$ 生成。它右乘本层独立的 $5120\\times512$ 参数 $W_{@L}^{KV,\\mathrm{SWA}}$，经逐行 RMSNorm 和位置旋转后，形成本批新算 KV 矩阵 $T_{@L}$。每一行对应一个 token 的 512 维潜向量，其中前 448 个元素原样保留，最后 64 个元素按相邻二元组旋转。",
    "位置 $t$ 的 Query 只能读取自己的因果窗口。窗口起点为 $r=\\max(1,t-127)$，因此 $U_{@L,t}$ 包含从 $r$ 到 $t$ 的行，形状为 $\\min(128,t)\\times512$，最多保留最近 128 行。Prefill 中不同 Query 行各有自己的窗口；Decode 则只生成当前新增行，并更新缓存。",
    "全局分支使用另一份共享矩阵 $G$，形状为 $M\\times512$，其中 $M$ 取决于已生成的历史行和压缩比。Full 层负责生成它；压缩比为 2 时，相邻两行的分数沿行方向归一化成逐元素 gate 权重，分别乘候选 KV 后相加；压缩比为 1 时没有这一步池化，也没有 gate 分支。后续层按配置复用同一个全局缓存。",
    "压缩器中，$\\mathbf v^c_{@L,t}=\\mathbf x_{@L,t}W^{KV,G}_{@L}$ 是准备被压缩的候选 KV 内容。另一条分支计算 $\\mathbf a^{gate}_{@L,t}=\\mathbf x_{@L,t}W^{gate}_{@L}$，提供 gate 原始分数。两份 W 是独立参数，v 和 a 都随输入计算。第 i 组的 token 2i−1 与 2i，在每一列 d 上分别对两个 a 做 Softmax，得到 $\\alpha_{@L,i,1,d}$ 与 $\\alpha_{@L,i,2,d}$。图中 e 的指数小框就是这些原始 a 分数，来自上方 Gate 投影；每个 α 的分子为本行的 e 的幂，分母为同列两行的指数之和。α、候选 v 的首、次、末格沿同一特征列对齐。这两个数才是压缩权重，同列之和为 1；512 列各有自己的权重对。每个权重乘同 token、同列的候选 v，再将两项相加，形成压缩行的第 d 个元素，随后归一化并写入缓存。",
    "Indexer 使用 Query 与 $M\\times128$ 的索引 Key 缓存 $K^{I\\prime}$ 为候选行打分，汇总各索引 Head 的加权分数，再选出最多 512 个行号，组成 $I_t$。根据这些行号，才从 $G$ 中读取对应的向量。Reindex 层重新选择行号，Reuse 层沿用已有行号；分数、行号和取出的 KV 是不同对象。",
    "Indexer 是正式 Attention 前的低成本筛选器：输入当前 token 的低秩 Query 行、归一化输入行，以及历史压缩位置的索引 Key。Query 投影为 32 个 128 维 Head；每个 Head 与各候选 Key 做点积，按 $\\sqrt{128}$ 缩放并经过 ReLU，得到分数 $a^I_{h,t,i}$。这里的 a 是拉丁字母，t 是当前 token 位置，i 是压缩缓存行号，h 是 Head 编号。",
    "权重 $\\eta_{@L,t,h}$（eta）由当前输入行乘可学习投影生成，再按 $\\sqrt{32}$ 缩放；它没有经过 Softmax，可正可负，总和也没有归一化为 1。同一候选行的最终分数是 $s_{@L,t,i}=\\sum_{h=1}^{32}\\eta_{@L,t,h}\\cdot a^I_{h,t,i}$。一个 token 得到一条长度 M 的分数行，各 token 的结果行组成 S。屏蔽不可见位置后按分数选 Top-K，再按位置顺序排列行号；后续真正的 Attention 读取对应 KV，重新计算自己的注意力权重。",
    "点积在学到的特征空间中衡量匹配，多个 Head 提供多组匹配信号，当前 token 产生的 eta 决定如何组合这些信号。ReLU 把各 Head 的负点积置零，但 eta 可以为负，因此最终分数仍可能为负。这里的分数用于候选排序；读取权重与最终输出由后续 Attention 计算。128 维索引与 FP4 计算降低筛选成本，随后只让入选的全局位置参与更昂贵的 Attention。这套打分公式是该模型在筛选能力与计算成本之间的设计选择。",
    "最终的 $KV_{@L,t}$ 沿行方向拼接：上段原样放入本地窗口从 $r=\\max(1,t-127)$ 到 t 的 $m_t=\\min(128,t)$ 行；下段接上按选中行号排序的 K 条全局缓存行。选中矩阵的第 j 行成为结果的第 $m_t+j$ 行，仍保留原缓存向量的符号、512 个元素值和列顺序。结果形状为 $L_t\\times512$，其中 $L_t=m_t+K$，K 是当前查询选中的全局行数。拼接仅改变行位置，后续 Attention 再计算打分和加权。SWA-only 层的读取矩阵仅含本地窗口行。",
  ],
  attention: [
    "当前 Head 读取位置 $t$ 的 Query 行向量 $\\mathbf q_{h,t}$，以及本地窗口和全局选择组成的 $KV_{@L,t}$。这里 $K=V=KV_{@L,t}$：同一潜向量用于 Key 打分与 Value 加权。每个 Head 的特征维度 $d_k=512$，KV 有 $L_t$ 行。第 $i$ 行的分数为 $z_i=\\frac{\\sum_{d=1}^{d_k}q'_d k_{i,d}}{\\sqrt{d_k}}$。图中第 1、2、末项是同一 Head 的特征乘积，省略号代表中间特征；本层 Head 总数为 64。",
    "Softmax 把分数变为读取权重。每个分数先取指数，分母 $D$ 是所有 $e^{z_i}$ 之和再加 $e^{b_h}$，其中 $b_h$ 是这个 Head 可学习的 attention sink 分数。于是每行权重为 $a_i=\\frac{e^{z_i}}{D}$；sink 会占用一部分概率，其值向量为零，对输出的贡献为零。将各 $a_i$ 分别乘对应 Value 行并累加，就得到加权结果。",
    "位置旋转作用于最后 64 个维度，前 448 维保留。位置索引为 $t-1$；对一对相邻元素 $(a,b)$，旋转结果分别是 $a'=a\\cos\\theta-b\\sin\\theta$ 与 $b'=a\\sin\\theta+b\\cos\\theta$，$\\theta$ 是该位置与该元素对对应的旋转角。加权输出的旋转部分还会做逆旋转，得到 $\\mathbf o_{h,t}$，每个 Head 最终仍输出 512 个数。",
    "64 个 Head 按原始顺序分为 8 组。第 $g$ 组将 $O_{@L,8(g-1)+1}$ 至 $O_{@L,8g}$ 横向拼成 $C_g$，token 行不变，列数为 $8d_k=4096$；元素对应 $c^{(g)}_{t,(j-1)d_k+d}=o_{@L,8(g-1)+j,t,d}$，$j=1,\\ldots,8$。这一步只改变索引。随后右乘第一阶段参数 $W_g^{O,A}$，得到宽 $r=1024$ 的 $B_g$。八个原始块拼为 $B=[B_1\\mid B_2\\mid\\cdots\\mid B_8]$，原元素保留组上标：$B_{t,(g-1)r+j}=b^{(g)}_{t,j}$。宽 $8r=8192$ 的 B 再乘第二阶段参数 $W^{O,B}$，得到宽 5120 的 $O_{@L}$，进入 mHC 回写。A、B 表示训练得到的两级投影参数。",
  ],
  moe: [
    "第 @L 层的 FFN 以归一化结果 $Y_{@L}$ 为输入，每行宽 5120。同一个输入送往共享专家、Router 和被选中的非共享专家；共享专家始终参与。Router 的参数 $W_{@L}^{R}$ 形状为 $5120\\times384$，每列对应一个非共享专家。某个 token 行乘第 $i$ 列，得到线性分数 $z^R_{t,i}$，再经过 softplus 和开平方，得到正分数 $s_{t,i}=\\sqrt{\\ln(1+e^{z^R_{t,i}})}$。",
    "选择专家与计算混合权重是两件事。选择时，给 $s_{t,i}$ 加上选择偏置 $b_i^{select}$，取 Top-6，得到专家编号集合 $I_t$；计算权重时，只取这六个专家原本的 $s$，除以它们的总和，再乘 1.5。因此 $g_{t,i}=1.5s_{t,i}/\\sum_{j\\in I_t}s_{t,j}$。专家编号和分数为演示数值。",
    "每个专家内部有并行的 gate 与 up 两条投影。它们分别用独立的 $W_i^{gate}$ 和 $W_i^{up}$ 把输入从 5120 维映射到中间宽度 $d_e=2304$，得到 $Z_i$ 和 $B_i$。gate 分支再逐元素做 SiLU：输入 $z$ 一路保留原值，另一路计算 $\\sigma(z)=1/(1+e^{-z})$，两路相乘得到 $a=z\\cdot\\sigma(z)$，组成矩阵 $A_i$；up 分支不经过 SiLU。",
    "随后，$A_i$ 和 $B_i$ 在相同元素位置相乘，得到 $C_i$。逐元素乘法完成后，让 $C_i$ 右乘 $2304\\times5120$ 的 $W_i^{down}$，得到专家输出 $E_i(Y)$。这些中间矩阵的行数都跟随输入 token 数，只有列宽在投影时改变。",
    "最后，各个被选中的专家输出分别乘自己的 $g_{t,i}$，再与共享专家输出一起汇入累加器，形成宽度为 5120 的 $O^{FFN}$。每个 token 使用自己的专家选择和权重。这个汇总结果随后进入 FFN 的 mHC 回写，与旧残差的混合结果会合。",
  ],
  engram: [
    ...ENGRAM_PURPOSE,
    "三个哈希分支各产生一个 8 行的地址列，沿行拼成 $\\mathbf b_{@L,t}\\in\\mathbb Z^{24\\times1}$。拼接前后的元素保留 $b_{n,h}$ 原符号。中间地址列的每个展开行号向左右各连一根线，分别选中 FP8 数值表和缩放系数表的同号行；每组展示第 1、2、8 个头。左右取出的数值行与系数行继续进入下方反量化。",
    "哈希图区固定本层与当前位置 $t$。蓝色 $c$ 是压缩后的 token ID，各自乘紫色固定乘数 $a$ 后汇入按位异或节点（⊕ 表示二进制逐位异或），得到青色 $u$。相同 $u$ 分给 8 个头：各头取模 $p$，再加桶起始偏移 $o$，得到琥珀色行号 $b$。第 1、2、8 个头展开，中间省略同构的第 3–7 个头。2/3/4-gram 共输出 24 个行号；每个行号同时读取下方 FP8 数值表及缩放系数表的同一行。$a$、$p$、$o$ 由初始化确定并固定，负责寻址。",
    "Engram 位于第 2、15 层。它读取当前位置及最多三个历史 token ID，构成以当前位置结束的 2-gram、3-gram 和 4-gram，再用多个哈希表完成合计 24 次查表。查出的向量拼接后经过投影，产生四个各为 5120 维的 Key $\\mathbf k_c$，以及一个共享的 5120 维 Value $\\mathbf v$。",
    "查表同时读取两份存储：FP8 数值表 $E_{@L}^{\\mathrm{FP8}}$ 与对应缩放系数表 $S_{@L}^E$，两者使用相同的 24 个哈希行号。每行有 256 个数值和 8 个系数，每连续 32 列共用一个系数。图中固定本层，令 $b=b_{n,h}$：$\\hat e_{n,h,d}=\\operatorname{FP32}(\\bar e_{b,d})\\operatorname{FP32}(s_{b,\\lceil d/32\\rceil})$，再令 $e_{n,h,d}=\\operatorname{BF16}(\\hat e_{n,h,d})$。第 1 块覆盖 1–32 列，第 2 块覆盖 33–64 列，第 8 块覆盖 225–256 列；按原列序组成 256 维向量。缩放系数随量化权重保存，描述数值尺度；图中没有将其当作 Attention 权重或当前输入生成的门控。反量化只近似恢复数值，无法找回量化损失的精度。24 条向量沿特征轴拼成 6144 维，随后才乘投影矩阵。",
    "每一路用自己的当前残差 $\\mathbf h_c$ 决定接收多少记忆。残差与对应 Key 分别做带可学习缩放的 RMSNorm，得到 $\\widehat{\\mathbf h}_c$ 和 $\\widehat{\\mathbf k}_c$，再点积并除以 $\\sqrt{5120}$，得到标量 $d_c$。随后取 $|d_c|$ 与 $10^{-6}$ 的较大值作为 $a_c$，开平方并恢复原点积的正负号，得到 $s_c$；对它做 sigmoid 才得到门控 $g_c$。四路分别用自己的门控对共享 Value 加权。",
    "把 $g_c$ 乘到共享 Value 的每个元素上，再与这一支原残差逐元素相加，得到 $\\mathbf h_c^E=\\mathbf h_c^{in}+g_c\\mathbf v$。图像位置的门控设为零，对应的 Value 加权结果为零。注入之后仍是四路残差，它们继续进入 Attention 前的 mHC 汇合；Engram 将检索到的信息加到原有状态中。",
  ],
  input: [
    "输入文本先经过 Tokenizer，被切成 token 并映射为离散 ID。$t$ 是某个 token 在这个序列中的位置，从 1 开始计数。得到 ID 后，模型按编号查找训练得到的 Embedding 表 $E$，这张表有 $V$ 行、5120 列，$V$ 是词表大小，每个 ID 对应一个 5120 维向量。",
    "将查出的向量按 token 顺序排列，就得到 $N\\times5120$ 的首层输入 $H_1$。这里的 $N$ 是本次 Prefill 的 token 数，主干处理的数据是查表所得的连续向量。首层再将表示扩展为四路残差；后续层读取上一层四路状态和下一次汇合所需的权重。",
    "Prefill 同时处理整段输入的多行；Decode 每步只新增当前位置的一行，并读取已经建立的历史缓存。完整矩阵包含所有 token 行，第 $t$ 行对应其中一个位置的运算。",
  ],
};

export function explainModule(data: ExplainedModule): ModuleExplanation {
  const group = MODULE_GROUP[data.kind];
  const sub = data.sublayer ?? (data.kind === "add2" ? "F" : "A");
  const phase =
    data.phase === "decode"
      ? "当前是 Decode：只为新增位置计算一行，历史信息从缓存读取。"
      : "当前是 Prefill：N 表示本次输入的 token 数，图中第 t 行用于展开其中一个位置的计算。";
  const paragraphs = group
    ? PARAGRAPHS[group]
    : [
        "所选框是所属模块内部的数据对象或运算。沿输入线可以找到它的操作数，沿输出线可以找到后续使用它的模块；框内的行列表示张量组成，省略号只省略同构项，不参与计算。",
        data.tex
          ? "图中用 $" +
            data.tex +
            "$ 标记这个对象，形状由框角的维度说明。阅读时先确认它来自哪一个输入或参数，再对照相邻的乘法、逐元素运算或累加器，区分原值与计算结果。"
          : "阅读时先确认相邻输入框，再看运算如何把这些输入变成输出；嵌套框只说明组成关系，只有连线表示数据流向。",
      ];
  return {
    title:
      data.kind === "compressor"
        ? `全局 KV · ${cachePolicy(data.layer).mode} · G 来源第 ${cachePolicy(data.layer).kv} 层`
        : (TITLES[data.kind] ?? data.title ?? "模块内的矩阵与运算"),
    paragraphs: [
      ...(["swa-window", "swa-output"].includes(data.kind) &&
      data.phase !== "decode"
        ? [
            "Prefill 中，本批每个位置先各自生成一条 u 行，组成矩阵 T。对当前位置 t，r=max(1,t−127)，只取 T 的第 r 到 t 行组成 U；U 内保留原来的 u 行与元素下标。这是多行的集合命名，被选行直接读取。每个 Query 都按自己的位置取因果窗口。",
          ]
        : []),
      ...(["kv", "attention", "query"].includes(group ?? "")
        ? [
            "小写粗体 u 表示一个 token 在本层生成的单条 KV 行，形状为 1×512；大写 U 表示多个这样的行组成的窗口矩阵，形状为 min(128,t)×512。U 的每一行保留该行的 u 名称与元素下标，因此新行追加是增加一行数据，没有把单个向量改名成整个矩阵。",
            "当前 token t 的上一层输出成为本层输入，经过本层汇合与归一化得到 $\\mathbf x_{@L,t}$。它乘本层独立参数 $W_{@L}^{KV,\\mathrm{SWA}}$，经 KV 的 RMSNorm 与 RoPE 得到新行 $\\mathbf u_{@L,t}$。上一层的本地 KV 不拼进本层；W 的 SWA 上标只标识参数所属分支。",
            "窗口已满时，更新前 $U_{@L,t-1}$ 保存 t−128 到 t−1 的 128 条本层 KV。淘汰 t−128，原样保留 t−127 到 t−1，再追加当前新行，得到 $U_{@L,t}$。当前窗口是 127 条历史加当前行，总共 128 行；历史行不重新投影、归一化或旋转。序列不足 128 个位置时只读取已有行。",
            data.layer <= 2
              ? "第 1、2 层没有 G 和 Indexer。当前 Query 只给本层更新后窗口的 K 行打分，经含 sink 的 softmax，再加权同一窗口的 V 行。图按 token 时间顺序排列，窗口位置 j 对应 token r+j−1，其中 r=max(1,t−127)。"
              : "当前 Query 与局部 KV 均由本层新算。Indexer 只筛选 G 行；U 的当前窗口整段保留：当前 token 生成索引 Query 与 Head 系数，对与 G 一一对应的索引 Key 打分，得到 1×M 的分数行。Top-K 保留最多 512 个因果可见 G 行号并按原行号排序；没选中的历史 G 行不会被删除。Reuse 直接读来源层为同一 token 选出的行号。",
          ]
        : []),
      ...(["kv", "attention", "query"].includes(group ?? "")
        ? cacheExplanation(data.layer)
        : []),
      ...(data.kind === "concat"
        ? [
            "每组先把 8 个 Head 的 O 沿特征列拼接。中间结构保留原来的 O 标题和 o 行向量，第 1、2、8 个块分别对应列 1–512、513–1024、3585–4096。token 行位置不变，也没有乘法或相加。随后才将同一拼接结果命名为 C：c 的列号只是把 Head 号与 Head 内的特征号合成一个列号，数值不变。",
          ]
        : []),
      ...(data.kind === "kv-merge"
        ? [
            "拼接区每条展示的 u、g 行都展开第 1、2、…、512 个元素。右侧保留左侧相同的元素和原下标：局部窗口放上段，全局选中行接在下段。KV 是整体矩阵的名字，拼接只改变行位置，元素值保持原样。",
          ]
        : []),
      ...paragraphs,
    ].map((paragraph, index) =>
      (index === 0 ? phase + paragraph : paragraph)
        .replaceAll("@L", String(data.layer))
        .replaceAll("@N", data.phase === "decode" ? "1" : "N")
        .replaceAll("@SUB", sub),
    ),
  };
}

// 段落中的成对 $ 仅标记行内公式，正文仍按完整句子连续排版。
function ExplanationParagraph({ text }: { text: string }) {
  return (
    <p>
      {text.split(/(\$[^$]+\$)/g).map((part, index) =>
        part.startsWith("$") && part.endsWith("$") ? (
          <span className="inspector-inline-math" key={index}>
            <MathFormula tex={part.slice(1, -1)} />
          </span>
        ) : (
          part
        ),
      )}
    </p>
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
  detail,
  connections,
  onClose,
}: {
  data?: ExplainedModule;
  detail?: InternalSelection;
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
        key={
          data?.kind +
          ":" +
          data?.layer +
          ":" +
          data?.sublayer +
          ":" +
          data?.phase
        }
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
            <article className="inspector-prose" aria-label="模块讲解正文">
              {detail && (
                <p data-internal-explanation>
                  当前选中{detail.kind === "wire" ? "内部连线" : "内部对象"}
                  {detail.tex && (
                    <>
                      {" "}
                      <MathFormula tex={detail.tex} />
                    </>
                  )}
                  。{detail.description}
                </p>
              )}
              {explanation!.paragraphs.map((text, index) => (
                <ExplanationParagraph key={index} text={text} />
              ))}
              {(["in", "out"] as const).map((direction) => {
                const items = connections.filter(
                  (connection) => connection.direction === direction,
                );
                return (
                  items.length > 0 && (
                    <p className="inspector-connection-prose" key={direction}>
                      {items.map((connection) => (
                        <span key={connection.id}>
                          {direction === "in"
                            ? "当前连接中，本模块从“"
                            : "本模块向“"}
                          {connection.other}
                          {direction === "in" ? "”接收" : "”传递"}
                          {connection.label ? (
                            <span className="inspector-inline-math">
                              <MathFormula tex={connection.label} />
                            </span>
                          ) : (
                            "相接框所示的数据或运算结果"
                          )}
                          。
                        </span>
                      ))}
                    </p>
                  )
                );
              })}
            </article>
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
