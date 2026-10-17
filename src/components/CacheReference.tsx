import { MathFormula as M, COLORS } from "./diagram-primitives";

/** 引用同一对象，不复制缓存、不创建本层参数；下标先展示来源再局部简写。 */
export function CacheReference({
  layer,
  source,
  kind,
}: {
  layer: number;
  source: number;
  kind: "G" | "K" | "I" | "B";
}) {
  const symbol = (index: string) =>
    kind === "K"
      ? `K_{${index}}^{I\\prime}`
      : `${kind}_{${index}${kind === "I" || kind === "B" ? ",t" : ""}}`;
  const from = symbol(String(source));
  const explicit = symbol(`${layer}\\leftarrow${source}`);
  const local = symbol(String(layer));
  return (
    <div
      data-cache-reference={kind}
      data-reference-source={source}
      style={{
        display: "grid",
        gap: 7,
        justifyItems: "start",
        fontSize: 14,
        padding: 8,
      }}
    >
      <div
        style={{
          border: `1px solid ${COLORS.blue}`,
          borderRadius: 6,
          padding: "6px 10px",
          background: COLORS.blueSoft,
        }}
      >
        <M tex={`${explicit}:=${from}`} />
        <span>
          {" "}
          · 同一{kind === "I" ? "组行号" : kind === "B" ? "份掩码" : "份缓存"}
        </span>
      </div>
      <div>
        <M tex={`${local}:=${explicit}`} /> · 下文本层简写
      </div>
      <small>
        {kind === "G"
          ? "不生成新 G，不配置本层全局投影参数"
          : kind === "K"
            ? "不生成新索引 Key，不配置本层 Key 投影参数"
            : kind === "I"
              ? "同一 token 的结果；本层不运行 Indexer"
              : "在本层分数上屏蔽候选外行"}
      </small>
    </div>
  );
}
