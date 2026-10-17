import { Box, MathFormula as M } from "./diagram-primitives";

// 收益按 Engram 论文的机制分析描述；实际算子以固定 V4.1 推理实现为准。
// https://arxiv.org/abs/2601.07372
// https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/5254448103b6254fc646dacbca1cbbf20e9216c1/inference/model.py
export const ENGRAM_PURPOSE = [
  "Engram 把局部词片段的静态模式放进可稀疏访问的独立参数表 E。它的目标是减轻主干反复构造常见局部模式的计算负担，让主干有更多能力处理上下文与推理；论文把这种作用解释为释放有效网络深度。它不保证给同一模型加上模块后总 FLOPs 反而下降，也没有在本版本跳过任何 Attention 或 FFN。",
  "每个 token 用 2、3、4-gram 的离散 ID 确定 24 个哈希地址，只读取表中的 24 行，每行 256 维；不扫描整张表、不对所有记忆行做 Attention。E 是独立模型参数，推理期间固定；KV 缓存则由当前序列的激活计算而来。哈希乘数、模数和桶偏移属于固定地址规则，与注意力权重区分。",
  "读出的 24 行拼成 6144 维向量，乘独立参数矩阵 W 后得到四路 Key 和一个共享 Value。当前残差再与 Key 计算门控 g，决定注入多少 Value；这些投影、归一化、点积、门控和加法每次仍要计算。同样的 n-gram 可查到同样的参数行，但当前残差不同，门控和注入结果就可能不同。",
  "Engram 的代价包括大型参数表的存储与读取，以及查表后的投影和门控。节省的方向是在扩充记忆容量时控制每个 token 激活的计算量，记忆容量仍需相应存储。U、G 是随当前序列产生的 KV 状态，Engram 的 E 是模型自带的参数表；这两类复用各自独立。V4.1 Flash 的固定实现没有 Engram 因果卷积分支。",
];

export function EngramPurpose({ layer }: { layer?: number }) {
  const l = layer === undefined ? "l" : String(layer);
  return (
    <section
      data-engram-purpose
      style={{ display: "grid", gap: 10, fontSize: 14, lineHeight: 1.65 }}
    >
      <strong style={{ fontSize: 19 }}>
        Engram 省什么：把局部模式记忆交给稀疏查表，主干仍照常计算
      </strong>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 10,
        }}
      >
        <Box tone="blue">
          <strong>① 当前及历史 token ID</strong>
          <br />
          2、3、4-gram
          <br />
          每种长度 8 个地址
          <br />
          确定性哈希，不做全表搜索
        </Box>
        <Box tone="indigo">
          <strong>② 按地址读取参数表 E</strong>
          <br />
          独立参数，推理期间固定
          <br />
          只读取 24 行 × 256 维<br />
          不生成、不追加 KV 历史行
        </Box>
        <Box tone="green">
          <strong>③ 取回记忆，结合当前状态</strong>
          <br />
          拼接 → 投影为 Key、Value
          <br />
          当前残差与 Key 算门控 g<br />g 决定接收多少 Value
        </Box>
      </div>
      <Box tone="green">
        <M
          tex={`\\mathbf h_{${l},c,t}^{E}=\\mathbf h_{${l},c,t}^{in}+g_{${l},c,t}\\cdot\\mathbf v_{${l},t}^{E}`}
        />
        <br />
        注入后的四路残差 → 本层 mHC → Attention → mHC 回写 → FFN →
        回写；没有跳过这些模块。
      </Box>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <strong>想减少的负担</strong>
          <br />
          常见局部词片段不必全靠主干多层神经计算反复构造；增加记忆容量时，每个
          token 仍只查固定数量的行。论文把这解释为释放主干的有效深度。
        </div>
        <div>
          <strong>仍然支付的代价</strong>
          <br />
          参数表占存储，查表要读数据；6144 → 25600
          投影与上下文门控仍要计算。Attention 与 FFN 的计算保留，总 FLOPs
          需要计入新增模块，没有固定减幅结论。
        </div>
      </div>
      <div>
        同一 n-gram
        可以复用同样的参数行；上下文残差不同，门控与最终结果仍可不同。CSA
        跨层共享的是 G，历史 KV 缓存保存的是序列激活；这里读取的是固定参数 E。
      </div>
      <div style={{ fontSize: 12 }}>
        机制解释：
        <a
          href="https://arxiv.org/abs/2601.07372"
          target="_blank"
          rel="noreferrer"
        >
          Engram 论文
        </a>
        ；本图算子：
        <a
          href="https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/5254448103b6254fc646dacbca1cbbf20e9216c1/inference/model.py"
          target="_blank"
          rel="noreferrer"
        >
          V4.1 固定版本实现
        </a>
        。
      </div>
    </section>
  );
}
