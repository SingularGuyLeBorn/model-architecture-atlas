import { Box, MathFormula as M } from "./diagram-primitives";

// 算子依固定 V4.1 实现；表示效率的解释依 Engram 论文 §6.1，二者分别陈述。
export const ENGRAM_PURPOSE = [
  "固定主干并加入 Engram 会增加查表、投影、归一化、门控和加法。V4.1 Flash 仍执行 40 层 Attention 与 FFN，第 2、15 层各增加一次 Engram；没有少执行任何主干层，也不保证总 FLOPs 或延迟下降。",
  "具体教学片段 I | love | New | York，当前 token 是 York。这里人为按四个词分词，仅说明结构。常规主干用 Attention 混合因果上下文、用 FFN 变换特征；Engram 另用 New York、love New York、I love New York 三个后缀各查 8 行，合计 24 行 × 256 维。参数表 E 是独立参数，推理期间固定；每行保存学习到的向量，词片段与具体知识的对应需实测。",
  "24 行拼接为 6144 维，再乘完整独立投影矩阵，得到四路 5120 维 Key 与一个共享 5120 维 Value。当前残差与 Key 算门控 g，再将 g 乘 Value 加回残差。相同片段在同一 Engram 层复用相同参数行；上下文改变门控。第 2、15 层各有自己的表与投影。",
  "减轻主干负担指表示效率：论文的 Logit Lens 分析发现较早层预测更接近最终预测，CKA 分析发现较浅层表示可对齐基线较深层，作者解释为释放有效网络深度。它们是表示分析，实际网络仍执行全部层。性能比较需使用匹配计算预算、分别训练的基线；结构图本身不足以推断某个词片段省了几层。",
  "稀疏查表让表容量增加时每个 token 仍只读固定数量的行；因此能以受控的激活计算量增加参数容量，存储与带宽仍增加。论文同计算预算的对照涉及重新分配参数容量；V4.1 外挂模块的新增开销须另计。U、G 是序列 KV 状态，E 是固定参数表。V4.1 Flash 的固定实现没有 Engram 因果卷积分支。",
];

export function EngramPurpose({ layer }: { layer?: number }) {
  return (
    <section
      data-engram-purpose
      style={{ display: "grid", gap: 12, fontSize: 14, lineHeight: 1.65 }}
    >
      <strong style={{ fontSize: 19 }}>
        Engram 对照：增加记忆入口，主干计算仍保留
      </strong>
      <Box tone="blue">
        <strong>
          同一输入片段：I | love | New | York → 现在处理 York（t = 4）
        </strong>
        <br />
        教学分词 · 结构对照 · 非模型实测
      </Box>
      <div
        data-engram-comparison
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
          gap: 14,
        }}
      >
        <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <strong style={{ fontSize: 17 }}>无 Engram · 常规主干路径</strong>
          <Box tone="blue">
            I、love、New、York 的 ID → Embedding
            <br />→ 前面各层 → 当前 York 的残差 h
          </Box>
          <div style={{ textAlign: "center" }}>↓ h 进入本层主干</div>
          <Box tone="green">
            mHC 汇合 → Attention
            <br />
            按上下文权重混合 York 与可见历史的特征
          </Box>
          <div style={{ textAlign: "center" }}>↓ 注意力输出与残差回写</div>
          <Box tone="green">
            FFN → 残差回写 → 后续层
            <br />
            局部搭配和其他上下文特征均由主干学习形成
          </Box>
          <Box tone="blue">
            最终隐藏状态 → LM Head → 下一个 token 分布
            <br />
            具体是否识别出地名 “New York”，要测实际模型。
          </Box>
        </div>
        <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <strong style={{ fontSize: 17 }}>有 Engram · 增加局部片段入口</strong>
          <Box tone="blue">
            主路径仍产生当前 York 的残差 h<br />
            旁路读取离散 ID，构造以下三个后缀
          </Box>
          <Box tone="indigo">
            <strong>New York · love New York · I love New York</strong>
            <br />
            每个后缀 → 8 个固定哈希地址 → 各读 8 行 E<br />共 24 行 × 256
            维；独立参数，推理期间固定
          </Box>
          <div style={{ textAlign: "center" }}>↓ 24 行拼接 → e（1 × 6144）</div>
          <Box tone="indigo">
            <M tex="eW=[k_1\mid k_2\mid k_3\mid k_4\mid v]" />
            <br />
            W：6144 × 25600；每个 k 和 v 均为 5120 维<br />
            6144 → 25600：完整矩阵投影，每次仍要算
          </Box>
          <Box tone="green">
            当前 h 与对应 k → 门控 g<br />
            <M tex="h^E=h+g\cdot v" />
            <br />
            注入片段相关特征 → 本层 Attention、FFN → 后续层 → LM Head
          </Box>
        </div>
      </div>
      <Box tone="green">
        <strong>把“注入”算一次：只截取一条残差的前 4 个元素</strong>
        <br />
        教学值 h = (0.2, −0.1, 0.4, 0.3)，v = (0.5, 0.2, −0.3,
        0.1)，门控计算结果取 g = 0.6。
        <br />
        <M tex="h^E_{1:4}=(0.2,-0.1,0.4,0.3)+0.6\cdot(0.5,0.2,-0.3,0.1)" />
        <br />
        <M tex="h^E_{1:4}=(0.5,0.02,0.22,0.36)" />
        <br />
        数值仅为教学示意；真实 g 由完整 5120 维 h、k
        算出。向量各元素的语义需实测，表中不直接存一段文字答案。
      </Box>
      <Box tone="blue">
        <strong>计算账本 · 固定 40 层主干作结构对照</strong>
        <br />
        无 Engram：40 次 Attention + 40 次 FFN。
        <br />
        有 Engram：同样 40 次 Attention + 40 次 FFN，再加第 2、15
        层的查表、投影与门控。没有跳过这些模块。
        <br />
        公平性能比较：匹配预算，分别训练。
      </Box>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Box tone="blue">
          Logit Lens
          <br />
          较早层预测 → 更接近最终预测
        </Box>
        <Box tone="blue">
          CKA 表示相似性
          <br />
          较浅层表示 → 对齐基线更深层
        </Box>
      </div>
      <small>
        表示效率的证据；实际执行层数保留。论文分析与开销边界见旁注。
      </small>
      <div>第 {layer ?? "l"} 层：同片段 → 同 E 行；不同上下文 → g 可不同。</div>
      <div style={{ fontSize: 12 }}>
        表示效率依据：
        <a
          href="https://arxiv.org/html/2601.07372v1#S6.SS1"
          target="_blank"
          rel="noreferrer"
        >
          Engram 论文 §6.1
        </a>
        ；算子依据：
        <a
          href="https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/5254448103b6254fc646dacbca1cbbf20e9216c1/inference/model.py"
          target="_blank"
          rel="noreferrer"
        >
          V4.1 固定实现
        </a>
        。
      </div>
    </section>
  );
}
