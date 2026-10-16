import v41 from "./configs/DeepSeek-V4.1-Flash.json" with { type: "json" };
import flash from "./configs/DeepSeek-V4-Flash.json" with { type: "json" };
import pro from "./configs/DeepSeek-V4-Pro.json" with { type: "json" };
import v3 from "./configs/DeepSeek-V3.json" with { type: "json" };
import v31 from "./configs/DeepSeek-V3.1.json" with { type: "json" };
import r1 from "./configs/DeepSeek-R1.json" with { type: "json" };
import sources from "./sources.json" with { type: "json" };

export type ModelId = "v41" | "v4-flash" | "v4-pro" | "v3" | "v31" | "r1";
export type Chapter =
  | "overview"
  | "layer"
  | "mla"
  | "moe"
  | "balance"
  | "norm"
  | "rope"
  | "mhc"
  | "csa"
  | "engram"
  | "ced"
  | "vision"
  | "dspark"
  | "training";
export const chapterNames: Record<Chapter, string> = {
  overview: "输入 → 全模型 → 输出",
  layer: "逐层交互 · 完整展开",
  mla: "MLA · 压缩与权重吸收",
  moe: "MoE · 路由到加权求和",
  balance: "负载均衡 · 选择与权重分离",
  norm: "RMSNorm · 逐元素",
  rope: "RoPE · 成对旋转",
  mhc: "mHC · 四路残差与回写",
  csa: "稀疏注意力 · 窗口与压缩",
  engram: "Engram · 查表与注入",
  ced: "CED · 编码器与解码器",
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
  r1,
};
const records: {
  id: ModelId;
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
export const models = records.map((record) => {
  const raw = rawConfigs[record.id];
  const config = "text_config" in raw ? raw.text_config : raw;
  const chapters: Chapter[] =
    record.family === "v41"
      ? [
          "overview",
          "layer",
          "ced",
          "csa",
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
        : ["overview", "mla", "moe", "balance", "norm", "rope", "training"];
  return {
    ...record,
    config,
    chapters,
    provenance: sources.find((source) => source.id === record.source)!,
  };
});
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
