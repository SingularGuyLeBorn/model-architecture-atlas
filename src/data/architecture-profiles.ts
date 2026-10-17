import v3 from "./configs/DeepSeek-V3.json" with { type: "json" };
import r1 from "./configs/DeepSeek-R1.json" with { type: "json" };
import v31 from "./configs/DeepSeek-V3.1.json" with { type: "json" };
import v32 from "./configs/DeepSeek-V3.2.json" with { type: "json" };
import mimo from "./configs/MiMo-V2.5.json" with { type: "json" };
import qwen from "./configs/Qwen3.8-Flash-Next.json" with { type: "json" };
import sources from "./sources.json" with { type: "json" };

/** 图中层号、token 行号从 1 开始；官方数组的下标只在这里转换。 */
export type ArchitectureModelId =
  | "v3"
  | "r1"
  | "v31"
  | "v32"
  | "mimo25"
  | "qwen38";
export type AttentionKind =
  | "mla"
  | "dsa"
  | "gqa-full"
  | "gqa-window"
  | "gdn"
  | "qsa";
export type LayerArchitecture = {
  layer: number;
  attention: AttentionKind;
  queryHeads: number;
  kvHeads: number;
  valueHeads: number;
  cacheKind: "latent-rows" | "kv-rows" | "recurrent";
  keyDim: number;
  valueDim: number;
  ropeDim: number;
  window: number | null;
  sink: boolean;
  ffn: "dense" | "moe";
  intermediate: number;
  sharedExperts: number;
  ngram: boolean;
};
export const architectureConfigs = {
  v3,
  r1,
  v31,
  v32,
  mimo25: mimo,
  qwen38: qwen,
};
const sourceNames: Record<ArchitectureModelId, string> = {
  v3: "DeepSeek-V3",
  r1: "DeepSeek-R1",
  v31: "DeepSeek-V3.1",
  v32: "DeepSeek-V3.2",
  mimo25: "MiMo-V2.5",
  qwen38: "Qwen3.8-Flash-Next",
};
export function architectureProfile(id: ArchitectureModelId) {
  const raw = architectureConfigs[id];
  const config = "text_config" in raw ? raw.text_config : raw;
  const source = sources.find((item) => item.id === sourceNames[id]);
  if (!source) throw new Error(`缺少模型来源：${id}`);
  return {
    id,
    name: sourceNames[id],
    source,
    layers: config.num_hidden_layers,
    hidden: config.hidden_size,
    vocab: config.vocab_size,
    context: config.max_position_embeddings,
    routedExperts:
      "num_experts" in config ? config.num_experts : config.n_routed_experts,
    activeExperts: config.num_experts_per_tok,
    residualBranches: id === "qwen38" ? qwen.text_config.hc_count : 1,
    eps:
      "rms_norm_eps" in config ? config.rms_norm_eps : config.layernorm_epsilon,
  };
}

export function layerArchitecture(
  id: ArchitectureModelId,
  layer: number,
): LayerArchitecture {
  const profile = architectureProfile(id);
  if (!Number.isInteger(layer) || layer < 1 || layer > profile.layers)
    throw new Error(`${profile.name} 层号须在 1–${profile.layers} 内`);
  if (id === "mimo25") {
    const swa = mimo.hybrid_layer_pattern[layer - 1] === 1;
    const moe = mimo.moe_layer_freq[layer - 1] === 1;
    const keyDim = swa ? mimo.swa_head_dim : mimo.head_dim;
    return {
      layer,
      attention: swa ? "gqa-window" : "gqa-full",
      queryHeads: swa ? mimo.swa_num_attention_heads : mimo.num_attention_heads,
      kvHeads: swa ? mimo.swa_num_key_value_heads : mimo.num_key_value_heads,
      valueHeads: swa ? mimo.swa_num_key_value_heads : mimo.num_key_value_heads,
      cacheKind: "kv-rows",
      keyDim,
      valueDim: swa ? mimo.swa_v_head_dim : mimo.v_head_dim,
      ropeDim: Math.trunc(keyDim * mimo.partial_rotary_factor),
      window: swa ? mimo.sliding_window_size : null,
      sink: swa
        ? mimo.add_swa_attention_sink_bias
        : mimo.add_full_attention_sink_bias,
      ffn: moe ? "moe" : "dense",
      intermediate: moe ? mimo.moe_intermediate_size : mimo.intermediate_size,
      sharedExperts: mimo.n_shared_experts ?? 0,
      ngram: false,
    };
  }
  if (id === "qwen38") {
    const c = qwen.text_config;
    const linear = c.layer_types[layer - 1] === "linear_attention";
    return {
      layer,
      attention: linear ? "gdn" : "qsa",
      queryHeads: linear ? c.linear_num_key_heads : c.num_attention_heads,
      kvHeads: linear ? c.linear_num_key_heads : c.num_key_value_heads,
      valueHeads: linear ? c.linear_num_value_heads : c.num_key_value_heads,
      cacheKind: linear ? "recurrent" : "kv-rows",
      keyDim: linear ? c.linear_key_head_dim : c.head_dim,
      valueDim: linear ? c.linear_value_head_dim : c.head_dim,
      ropeDim: linear ? 0 : c.head_dim * c.partial_rotary_factor,
      window: null,
      sink: false,
      ffn: "moe",
      intermediate: c.moe_intermediate_size,
      sharedExperts:
        c.shared_expert_intermediate_size / c.moe_intermediate_size,
      ngram: c.ple_layer_ids.includes(layer),
    };
  }
  const c = architectureConfigs[id];
  const moe = layer > c.first_k_dense_replace;
  return {
    layer,
    attention: id === "v32" ? "dsa" : "mla",
    queryHeads: c.num_attention_heads,
    kvHeads: c.num_key_value_heads,
    valueHeads: c.num_key_value_heads,
    cacheKind: "latent-rows",
    keyDim: c.qk_nope_head_dim + c.qk_rope_head_dim,
    valueDim: c.v_head_dim,
    ropeDim: c.qk_rope_head_dim,
    window: null,
    sink: false,
    ffn: moe ? "moe" : "dense",
    intermediate: moe ? c.moe_intermediate_size : c.intermediate_size,
    sharedExperts: moe ? c.n_shared_experts : 0,
    ngram: false,
  };
}

export function tokenWindow(id: ArchitectureModelId, layer: number, t: number) {
  if (!Number.isSafeInteger(t) || t < 1) throw new Error("当前位置须为正整数");
  const { window, cacheKind } = layerArchitecture(id, layer);
  if (cacheKind === "recurrent")
    throw new Error("GDN 读取递归状态，不能画成逐 token 的 KV 窗口");
  const first = window === null ? 1 : Math.max(1, t - window + 1);
  return { first, last: t, count: t - first + 1 };
}

/** QSA 选择完整 4-token 块，尾部 0–3 个可见 token 单独保留。 */
export function qsaSelection(t: number, selectedBlocks: number[]) {
  if (!Number.isSafeInteger(t) || t < 1) throw new Error("当前位置须为正整数");
  const c = qwen.text_config,
    ratio = c.indexer_compress_ratio;
  const complete = Math.floor(t / ratio);
  const count = Math.min(c.indexer_budget / ratio, complete);
  if (
    selectedBlocks.length !== count ||
    new Set(selectedBlocks).size !== count ||
    selectedBlocks.some(
      (block) => !Number.isInteger(block) || block < 1 || block > complete,
    )
  )
    throw new Error(`须提供 ${count} 个互异且可见的完整块行号`);
  const rows = selectedBlocks.flatMap((block) =>
    Array.from({ length: ratio }, (_, j) => ratio * (block - 1) + j + 1),
  );
  const tail = Array.from(
    { length: t % ratio },
    (_, j) => complete * ratio + j + 1,
  );
  return {
    complete,
    blocks: selectedBlocks,
    rows,
    tail,
    visible: [...rows, ...tail],
  };
}

/** GQA 中的查询 Head 读取对应 KV Head；MLA/GDN 的共享方式另行表达。 */
export function kvHeadForQuery(architecture: LayerArchitecture, head: number) {
  if (!["gqa-full", "gqa-window", "qsa"].includes(architecture.attention))
    throw new Error("该层使用 MLA 潜向量或 GDN 状态，不能套 GQA 分组");
  if (!Number.isInteger(head) || head < 1 || head > architecture.queryHeads)
    throw new Error("Query Head 超出范围");
  return (
    Math.floor((head - 1) / (architecture.queryHeads / architecture.kvHeads)) +
    1
  );
}
