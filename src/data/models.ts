import v41 from "./configs/DeepSeek-V4.1-Flash.json" with { type: "json" };
import flash from "./configs/DeepSeek-V4-Flash.json" with { type: "json" };
import pro from "./configs/DeepSeek-V4-Pro.json" with { type: "json" };
import v3 from "./configs/DeepSeek-V3.json" with { type: "json" };
import v31 from "./configs/DeepSeek-V3.1.json" with { type: "json" };
import r1 from "./configs/DeepSeek-R1.json" with { type: "json" };
import v32 from "./configs/DeepSeek-V3.2.json" with { type: "json" };
import sources from "./sources.json" with { type: "json" };
import mimo25 from "./configs/MiMo-V2.5.json" with { type: "json" };
import qwen38 from "./configs/Qwen3.8-Flash-Next.json" with { type: "json" };

export type DeepSeekModelId =
  | "v41"
  | "v4-flash"
  | "v4-pro"
  | "v3"
  | "v31"
  | "v32"
  | "r1";
export type ModelId = DeepSeekModelId | "mimo25" | "qwen38";
export type Chapter =
  | "overview"
  | "layer"
  | "gdn"
  | "qsa"
  | "gr"
  | "ple"
  | "mla"
  | "moe"
  | "balance"
  | "norm"
  | "rope"
  | "mhc"
  | "csa"
  | "engram"
  | "ced"
  | "cache"
  | "vision"
  | "dspark"
  | "training";
export const chapterNames: Record<Chapter, string> = {
  overview: "输入 → 全模型 → 输出",
  layer: "逐层交互 · 完整展开",
  gdn: "GDN · 递归状态更新与读取",
  qsa: "QSA · 选块到原始 K/V 行",
  gr: "门控残差 · 四路层内主路径",
  ple: "PLE · 哈希查表与四路注入",
  mla: "MLA · 压缩与权重吸收",
  moe: "MoE · 路由到加权求和",
  balance: "负载均衡 · 选择与权重分离",
  norm: "RMSNorm · 逐元素",
  rope: "RoPE · 成对旋转",
  mhc: "mHC · 四路残差与回写",
  csa: "稀疏注意力 · 窗口与压缩",
  engram: "Engram · 查表与注入",
  ced: "CED · 编码器与解码器",
  cache: "KV Cache · token 1201、1202",
  vision: "视觉输入 · Patch 到 Token",
  dspark: "DSpark · 多位置草拟",
  training: "训练与推理 · 边界",
};
export const rawConfigs = {
  v41,
  "v4-flash": flash,
  "v4-pro": pro,
  v3,
  v31,
  v32,
  r1,
  mimo25,
  qwen38,
};
const records: {
  id: DeepSeekModelId;
  name: string;
  source: string;
  family: "v3" | "v4" | "v41";
  subtitle: string;
}[] = [
  {
    id: "v41",
    name: "DeepSeek V4.1 Flash",
    source: "DeepSeek-V4.1-Flash",
    family: "v41",
    subtitle: "CSA2 · Single-Pass mHC · Engram",
  },
  {
    id: "r1",
    name: "DeepSeek R1",
    source: "DeepSeek-R1",
    family: "v3",
    subtitle: "V3 主干 · 推理强化学习",
  },
  {
    id: "v3",
    name: "DeepSeek V3",
    source: "DeepSeek-V3",
    family: "v3",
    subtitle: "MLA · DeepSeekMoE · 辅助损失自由均衡",
  },
  {
    id: "v31",
    name: "DeepSeek V3.1",
    source: "DeepSeek-V3.1",
    family: "v3",
    subtitle: "V3 主干 · 混合思考模式",
  },
  {
    id: "v32",
    name: "DeepSeek V3.2",
    source: "DeepSeek-V3.2",
    family: "v3",
    subtitle: "MLA · DSA 原 token 行选择 · MoE",
  },
  {
    id: "v4-flash",
    name: "DeepSeek V4 · Flash",
    source: "DeepSeek-V4-Flash",
    family: "v4",
    subtitle: "CSA / HCA · mHC · Hash MoE",
  },
  {
    id: "v4-pro",
    name: "DeepSeek V4 · Pro",
    source: "DeepSeek-V4-Pro",
    family: "v4",
    subtitle: "同类稀疏主干 · 更宽配置",
  },
];
const deepseekModels = records.map((record) => {
  const raw = rawConfigs[record.id];
  const config = "text_config" in raw ? raw.text_config : raw;
  const chapters: Chapter[] =
    record.family === "v41"
      ? [
          "overview",
          "layer",
          "ced",
          "csa",
          "cache",
          "mhc",
          "engram",
          "moe",
          "balance",
          "norm",
          "rope",
          "vision",
          "dspark",
        ]
      : record.family === "v4"
        ? ["overview", "csa", "mhc", "moe", "balance", "norm", "rope"]
        : [
            "overview",
            "layer",
            "mla",
            "moe",
            "balance",
            "norm",
            "rope",
            "training",
          ];
  return {
    ...record,
    config,
    chapters,
    provenance: sources.find((source) => source.id === record.source)!,
  };
});
export type DeepSeekModel = (typeof deepseekModels)[number];
export const models = [
  ...deepseekModels,
  {
    id: "mimo25" as const,
    family: "mimo" as const,
    name: "小米 MiMo-V2.5",
    source: "MiMo-V2.5",
    subtitle: "Hybrid GQA/SWA · 128-token 窗口 · MoE",
    config: mimo25,
    chapters: ["overview", "layer"] as Chapter[],
    provenance: sources.find((source) => source.id === "MiMo-V2.5")!,
  },
  {
    id: "qwen38" as const,
    family: "qwen" as const,
    name: "Qwen3.8-Flash-Next",
    source: "Qwen3.8-Flash-Next",
    subtitle: "GDN / QSA · 四路门控残差 · N-gram PLE",
    config: qwen38.text_config,
    chapters: ["gr", "ple", "gdn", "qsa"] as Chapter[],
    provenance: sources.find((source) => source.id === "Qwen3.8-Flash-Next")!,
  },
];
export type Model = (typeof models)[number];
export const officialLinks = {
  v3: "https://github.com/deepseek-ai/DeepSeek-V3",
  r1: "https://github.com/deepseek-ai/DeepSeek-R1",
  v31: "https://huggingface.co/deepseek-ai/DeepSeek-V3.1",
  v4: "https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash",
  v41: "https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash",
};
export function compressionForLayer(model: Model, layer: number) {
  const config = model.config;
  return "compress_ratios" in config
    ? (config.compress_ratios[layer - 1] ?? 0)
    : 0;
}
// 路由选择使用加偏置后的分数，混合系数仍取原始正分数；两者不能混为 softmax。
export function routedWeights(
  scores: number[],
  selected: number[],
  scale: number,
) {
  const total = selected.reduce((sum, index) => sum + scores[index], 0);
  if (!(total > 0)) throw new Error("选中专家的原始分数总和必须为正");
  return selected.map((index) => (scale * scores[index]) / total);
}
