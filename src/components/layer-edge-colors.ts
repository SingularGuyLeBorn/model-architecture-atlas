import type { DiagramTone } from "./diagram-primitives";

// 以真实边的职责登记身份，不按公式字符串或消费者的颜色猜测。
const EDGE_TONES: Readonly<Record<string, DiagramTone>> = {
  "tokenizer-embedding": "blue",
  "embedding-expand": "blue",
  "expand-first-input": "blue",
  "first-input-prior-layers": "blue",
  "prior-layers-input": "blue",
  "tokens-engram": "blue",
  "engram-state": "blue",
  "residual-pre-a": "blue",
  "residual-mix-a": "blue",
  "norm-q": "blue",
  "norm-kv": "blue",
  "norm-compressor": "blue",
  "query-matrix-row": "blue",
  "query-row-split": "blue",
  "q-low-rank-indexer": "blue",
  "add1-state": "blue",
  "state-pre-f": "blue",
  "state-mix-f": "blue",
  "norm2-moe-input": "blue",
  "moe-input-router": "blue",
  "router-scores": "olive",
  "add2-output": "blue",
  "merge-heads": "neutral",
};

export function layerEdgeTone(id: string): DiagramTone {
  if (id.startsWith("query-head-")) return "blue";
  if (id.startsWith("expert-result-") || id.startsWith("expert-row-"))
    return "green";
  if (id.startsWith("expert-product-") || id.startsWith("expert-sum-"))
    return "cyan";
  return EDGE_TONES[id] ?? "green";
}
