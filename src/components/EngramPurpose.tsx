import { useId, type ReactNode } from "react";
import { MathFormula as M } from "./diagram-primitives";

// 算子依固定 V4.1 实现；表示效率的解释依 Engram 论文 §6.1，二者分别陈述。
export const ENGRAM_PURPOSE = [
  "固定主干并加入 Engram 会增加查表、投影、归一化、门控和加法。V4.1 Flash 仍执行 40 层 Attention 与 FFN，第 2、15 层各增加一次 Engram；没有少执行任何主干层，也不保证总 FLOPs 或延迟下降。",
  "具体教学片段 I | love | New | York，当前 token 是 York。这里人为按四个词分词，仅说明结构。常规主干用 Attention 混合因果上下文、用 FFN 变换特征；Engram 另用 New York、love New York、I love New York 三个后缀各查 8 行，合计 24 行 × 256 维。参数表 E 是独立参数，推理期间固定；每行保存学习到的向量，词片段与具体知识的对应需实测。",
  "24 行拼接为 6144 维，再乘完整独立投影矩阵，得到四路 5120 维 Key 与一个共享 5120 维 Value。当前残差与 Key 算门控 g，再将 g 乘 Value 加回残差。相同片段在同一 Engram 层复用相同参数行；上下文改变门控。第 2、15 层各有自己的表与投影。",
  "减轻主干负担指表示效率：论文的 Logit Lens 分析发现较早层预测更接近最终预测，CKA 分析发现较浅层表示可对齐基线较深层，作者解释为释放有效网络深度。它们是表示分析，实际网络仍执行全部层。性能比较需使用匹配计算预算、分别训练的基线；结构图本身不足以推断某个词片段省了几层。",
  "稀疏查表让表容量增加时每个 token 仍只读固定数量的行；因此能以受控的激活计算量增加参数容量，存储与带宽仍增加。论文同计算预算的对照涉及重新分配参数容量；V4.1 外挂模块的新增开销须另计。U、G 是序列 KV 状态，E 是固定参数表。V4.1 Flash 的固定实现没有 Engram 因果卷积分支。",
  "注入的数值教学例：只取一条残差的前四维，令 h=(0.2,-0.1,0.4,0.3)、v=(0.5,0.2,-0.3,0.1)，完整门控计算的示意结果取 g=0.6，则 h+g·v=(0.5,0.02,0.22,0.36)。这些是假设值；真实门控依完整 5120 维向量计算。对照图省略常规归一化和残差回写细节，主图下方仍保留完整实现。",
];

function DiagramBox({
  x,
  y,
  w,
  h = 44,
  tone = "green",
  children,
}: {
  x: number;
  y: number;
  w: number;
  h?: number;
  tone?: "green" | "blue" | "indigo";
  children: ReactNode;
}) {
  const colors = {
    green: ["#e1f0e8", "#579881"],
    blue: ["#e4edf7", "#7f9fbf"],
    indigo: ["#ece8f8", "#9889bc"],
  };
  return (
    <foreignObject x={x} y={y} width={w} height={h}>
      <div
        style={{
          boxSizing: "border-box",
          width: "100%",
          height: "100%",
          border: "1px solid " + colors[tone][1],
          borderRadius: 7,
          background: colors[tone][0],
          display: "grid",
          placeContent: "center",
          textAlign: "center",
          fontSize: 15,
          lineHeight: 1.3,
        }}
      >
        {children}
      </div>
    </foreignObject>
  );
}

export function EngramPurpose({ layer }: { layer?: number }) {
  const marker = "engram-compare-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <section data-engram-purpose style={{ display: "grid", gap: 8 }}>
      <strong style={{ fontSize: 19 }}>Engram · 同一片段，两条路径</strong>
      <svg
        data-engram-comparison
        viewBox="0 0 1000 470"
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="Engram 双路径结构对照"
      >
        <defs>
          <marker
            id={marker}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path
              d="M1 1 L9 5 L1 9"
              fill="none"
              stroke="#347f6c"
              strokeWidth="1.5"
            />
          </marker>
        </defs>
        <g
          fill="none"
          stroke="#347f6c"
          strokeWidth="1.5"
          markerEnd={"url(#" + marker + ")"}
        >
          <path d="M140 65 H190" />
          <path d="M380 65 H430" />
          <path d="M550 65 H600" />
          <path d="M260 180 H300" />
          <path d="M560 180 H610" />
          <path d="M780 180 H825" />
          <path d="M900 202 V240" />
          <path d="M825 270 H780 V260 H730" />
          <path d="M780 270 V330 H730" />
          <path d="M140 322 H250 V260 H300" />
          <path d="M600 260 H450" />
          <path d="M375 284 V300 H335 V310" />
          <path d="M600 330 H370" />
          <path d="M335 354 V390" />
          <path d="M190 322 V412 H313" />
          <path d="M357 412 H430" />
          <path d="M610 412 H650" />
          <path d="M820 412 H860" />
        </g>
        <g fill="#183b36" fontSize="16" fontWeight="700">
          <text x="20" y="23">
            无 Engram
          </text>
          <text x="20" y="130">
            有 Engram · 第 {layer ?? "2、15"} 层
          </text>
        </g>
        <DiagramBox x={20} y={43} w={120} tone="blue">
          <M tex="\mathcal H^{\mathrm{base}}" />
        </DiagramBox>
        <DiagramBox x={190} y={43} w={190}>
          mHC · Attention
        </DiagramBox>
        <DiagramBox x={430} y={43} w={120}>
          FFN
        </DiagramBox>
        <DiagramBox x={600} y={43} w={120} tone="blue">
          <M tex="\mathcal H^{\mathrm{next}}" />
        </DiagramBox>
        <DiagramBox x={20} y={160} w={240} h={40} tone="blue">
          I | love | New | York
        </DiagramBox>
        <DiagramBox x={300} y={145} w={260} h={70} tone="blue">
          <span>New York</span>
          <span>love New York</span>
          <span>I love New York</span>
        </DiagramBox>
        <DiagramBox x={610} y={158} w={170} h={44} tone="indigo">
          <span>Hash → E</span>
          <small>24 行 × 256 维</small>
        </DiagramBox>
        <DiagramBox x={825} y={158} w={150} tone="green">
          <M tex="e\quad1\times6144" />
        </DiagramBox>
        <DiagramBox x={825} y={240} w={150} h={60} tone="indigo">
          <M tex="eW" />
          <small>W: 6144 × 25600</small>
        </DiagramBox>
        <DiagramBox x={600} y={240} w={130}>
          <M tex="k_c\quad1\times5120" />
        </DiagramBox>
        <DiagramBox x={600} y={310} w={130}>
          <M tex="v\quad1\times5120" />
        </DiagramBox>
        <DiagramBox x={20} y={300} w={120} tone="blue">
          <M tex="h_c^{\mathrm{in}}" />
        </DiagramBox>
        <DiagramBox x={300} y={240} w={150}>
          <M tex="g_c=f(h_c,k_c)" />
        </DiagramBox>
        <DiagramBox x={300} y={310} w={70}>
          <M tex="\times" />
        </DiagramBox>
        <rect
          x="313"
          y="390"
          width="44"
          height="44"
          fill="white"
          stroke="#34413b"
          strokeWidth="1.5"
        />
        <text x="335" y="420" textAnchor="middle" fontSize="28">
          +
        </text>
        <DiagramBox x={430} y={390} w={180}>
          <M tex="\mathcal H^E\quad4\times5120" />
        </DiagramBox>
        <DiagramBox x={650} y={390} w={170}>
          mHC · Attention
        </DiagramBox>
        <DiagramBox x={860} y={390} w={110}>
          FFN
        </DiagramBox>
        <g fontSize="12" fill="#45675c">
          <text x="20" y="218">
            教学分词 · York，t = 4
          </text>
          <text x="20" y="289">
            上游残差 · 路 c
          </text>
          <text x="300" y="230">
            门控 · c = 1, 2, 3, 4
          </text>
          <text x="786" y="151">
            拼接
          </text>
          <text x="475" y="453">
            四路堆叠
          </text>
          <text x="650" y="453">
            含残差回写
          </text>
        </g>
        <foreignObject x="367" y="384" width="60" height="24">
          <div style={{ fontSize: 14, textAlign: "center" }}>
            <M tex="h_c^E" />
          </div>
        </foreignObject>
      </svg>
    </section>
  );
}
