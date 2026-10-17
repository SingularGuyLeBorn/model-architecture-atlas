import { rawConfigs } from "../data/models";
import { ReindexCandidates, REINDEX_EXPLANATION } from "./ReindexCandidates";
import { MathFormula as M, Box, RowMatrix } from "./diagram-primitives";

// 层号在界面从 1 开始，来源配置从 0 开始；图和旁注共用同一份关系。
export function cachePolicy(layer: number) {
  const c = rawConfigs.v41.text_config;
  const source = (ids: number[]) => ids.filter((id) => id < layer).at(-1);
  const kv = source(c.kv_source_layer_ids);
  const index = source(c.index_source_layer_ids);
  return {
    mode: !c.compress_ratios[layer - 1]
      ? "SWA-only"
      : kv === layer - 1
        ? "Full"
        : index === layer - 1
          ? "Reindex"
          : "Reuse",
    kv: kv === undefined ? null : kv + 1,
    index: index === undefined ? null : index + 1,
  };
}

// G 的所有者与选行 ID 的所有者是两条独立关系，分段由固定版本配置推导。
export function cacheSharingSegments() {
  const segments: { start: number; end: number; kv: number; index: number }[] =
    [];
  for (
    let layer = 1;
    layer <= rawConfigs.v41.text_config.num_hidden_layers;
    layer++
  ) {
    const { kv, index } = cachePolicy(layer);
    if (kv === null || index === null) continue;
    const previous = segments.at(-1);
    if (previous?.kv === kv && previous.index === index) previous.end = layer;
    else segments.push({ start: layer, end: layer, kv, index });
  }
  return segments;
}

export function cacheSourceSummary(layer: number) {
  const p = cachePolicy(layer);
  if (p.kv === null) return `第 ${layer} 层：仅本层 U，无全局 G 和选行 ID`;
  const segments = cacheSharingSegments();
  const kvEnd = segments.filter((s) => s.kv === p.kv).at(-1)!.end;
  const indexEnd = segments.find((s) => s.index === p.index)!.end;
  return `第 ${layer} 层 ${p.mode}：G 来自第 ${p.kv} 层（供 ${p.kv}–${kvEnd} 层）；ID 来自第 ${p.index} 层（供 ${p.index}–${indexEnd} 层）；U 始终本层计算`;
}

export function CacheOutputScope({
  layer,
  kind,
}: {
  layer: number;
  kind: "G" | "I";
}) {
  const spans = cacheSharingSegments().filter(
    (s) => (kind === "G" ? s.kv : s.index) === layer,
  );
  if (!spans.length) return null;
  return (
    <div
      data-cache-output-scope={kind}
      style={{ fontSize: 13, textAlign: "center" }}
    >
      <M tex={kind === "G" ? `G_{${layer}}` : `I_{${layer},t}`} /> → 第 {layer}–
      {spans.at(-1)!.end} 层共用{kind === "I" ? "本 token 行号" : "全局缓存"}
    </div>
  );
}

export function CacheSharingMap({ layer }: { layer: number }) {
  const segments = cacheSharingSegments();
  const owners = [...new Set(segments.map((s) => s.kv))];
  return (
    <section
      data-cache-sharing-map
      style={{ display: "grid", gap: 14, fontSize: 15, lineHeight: 1.5 }}
    >
      <strong data-sharing-current>{cacheSourceSummary(layer)}</strong>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "220px 52px 1fr",
          gap: 8,
        }}
      >
        <strong>全局 KV 与索引 Key</strong>
        <span />
        <strong>计算选行 ID → 后续 Reuse</strong>
      </div>
      {owners.map((owner) => {
        const group = segments.filter((s) => s.kv === owner);
        return (
          <div
            key={owner}
            style={{
              display: "grid",
              gridTemplateColumns: "220px 52px 1fr",
              gap: 8,
              alignItems: "stretch",
            }}
          >
            <div
              data-sharing-g={owner}
              style={{ alignSelf: "center", justifySelf: "end" }}
            >
              <Box tone="green">
                <strong>Full · 第 {owner} 层</strong>
                <br />
                <M
                  tex={"G_{" + owner + "}\\quad K_{" + owner + "}^{I\\prime}"}
                />
                <br />第 {owner}–{group.at(-1)!.end} 层共用
              </Box>
            </div>
            <svg
              aria-hidden
              viewBox="0 0 52 100"
              preserveAspectRatio="none"
              style={{
                width: "100%",
                height: "100%",
                minHeight: 60,
                overflow: "visible",
              }}
            >
              <path
                d={
                  "M-8 50 H24 " +
                  group
                    .map((_, i) => {
                      const y = ((i + 0.5) * 100) / group.length;
                      const tip = 5 / group.length;
                      return (
                        "M24 50 V" +
                        y +
                        " H66 M60 " +
                        (y - tip) +
                        " L66 " +
                        y +
                        " L60 " +
                        (y + tip)
                      );
                    })
                    .join(" ")
                }
                fill="none"
                stroke="#347f6c"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div style={{ display: "grid", gap: 6 }}>
              {group.map((s) => (
                <div
                  key={s.start}
                  data-sharing-segment={s.start + "-" + s.end}
                  data-active-sharing={
                    (layer >= s.start && layer <= s.end) || undefined
                  }
                  style={{
                    display: "grid",
                    gridTemplateColumns: "300px 36px 1fr",
                    alignItems: "center",
                    gap: 8,
                    background:
                      layer >= s.start && layer <= s.end
                        ? "#e4f0eb"
                        : undefined,
                    borderRadius: 6,
                    padding: 6,
                  }}
                >
                  <div
                    data-sharing-index={s.index}
                    style={{
                      border: "1px solid #b6c8bd",
                      borderRadius: 6,
                      padding: "6px 10px",
                    }}
                  >
                    <strong>
                      第 {s.index} 层 · {s.index === s.kv ? "Full" : "Reindex"}
                    </strong>
                    <br />
                    <M
                      tex={
                        "S_{" +
                        s.index +
                        ",t}\\xrightarrow{\\mathrm{TopK}}I_{" +
                        s.index +
                        ",t}"
                      }
                    />
                    {s.index > 21 && <span> · B₂₁,t 约束</span>}
                  </div>
                  <svg
                    aria-hidden
                    viewBox="0 0 36 18"
                    style={{ width: 36, height: 18, overflow: "visible" }}
                  >
                    <path
                      d="M-8 9 H44 M38 3 L44 9 L38 15"
                      fill="none"
                      stroke="#a36b24"
                      strokeWidth="1.5"
                    />
                  </svg>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {Array.from(
                      { length: s.end - s.start },
                      (_, j) => s.start + j + 1,
                    ).map((target) => (
                      <span
                        key={target}
                        data-sharing-consumer={target}
                        style={{
                          border: "1px solid #9cb7c9",
                          borderRadius: 5,
                          padding: "2px 6px",
                          fontWeight: target === layer ? 800 : 500,
                        }}
                      >
                        第 {target} 层
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div data-sharing-local>
        各层独立：X → 本层 U、主 Query → Attention → FFN　·　第 1、2 层仅 SWA
      </div>
      <ReindexCandidates />
    </section>
  );
}

export function cacheExplanation(layer: number) {
  const p = cachePolicy(layer);
  return [
    REINDEX_EXPLANATION,
    `T 是本批新算的本地 KV 矩阵，行向量记为 u；U 只表示当前局部窗口缓存，最多 128 行。$X_{${layer}}$ 乘本层独立参数 $W_{${layer}}^{KV,\\mathrm{SWA}}$，再经 RMSNorm、RoPE 生成当前新行，按时间顺序写入 U。每种模式都为当前 token 新算本地 KV，历史窗口行直接读取；窗口满后覆盖最旧行。`,
    "本层的 U 与选中 G 行沿行拼成 KV，主 Query 对拼接后的全部行做 Attention 打分与 Value 加权。Indexer 只给 G 的行打分，不筛选 U。第 1、2 层没有 G，也没有 Indexer；它们的 Attention 仅使用本层 U，U 始终表示局部窗口。第 3–20 层的 G 每两个 token 合成一行；第 21–40 层读第 21 层比例 1 的 G，每个 token 一行，但仍只选最多 512 个全局行。都不等于读取每层所有原始历史 KV。",
    "t=129 的窗口图把 token 1 的本层 KV 变灰，表示已退出有效 U；token 2–128 直接保留，当前 token 129 新算一行并追加，括号内恰好 128 行。灰行只是淘汰示意，实际窗口不持久保留全部旧行。退出 U 不代表对应信息从 G 或当前隐藏状态中也被删除；后续 token 不再经本层局部窗口直接读取该原始 KV。",
    "G 是全局分支 KV 缓存：全局表示可覆盖局部窗口之外的因果历史，只在指定层间共享，压缩表示会损失部分原始信息。只有 Full 来源层独立生成 G；指定后续层读取同一对象。压缩比 2 时由候选内容与 gate 权重逐列合并两行，比例 1 时仅投影和归一化、不做行池化；随后主分支做 RoPE 并存储。",
    p.mode === "SWA-only"
      ? `第 ${layer} 层是 SWA-only：只有自己的 U，没有 G 分支。`
      : `第 ${layer} 层是 ${p.mode}：${p.mode === "Full" ? `维护自己的 $G_{${p.kv}}$，生成当前新增的全局行并计算本次选行结果` : `读取来源 Full 层的 $G_{${p.kv}}$，定义本层引用别名 $G_{${layer}\\leftarrow${p.kv}}:=G_{${p.kv}}$，随后简写为 $G_{${layer}}$；没有独立的本层全局参数或新存储；${p.mode === "Reindex" ? `读取源层索引 Key，用当前层输入重新打分，生成 $I_{${layer},t}$` : `同时沿用第 ${p.index} 层为当前 token 算出的 $I_{${p.index},t}$`}`}。主 Query、局部 KV、Attention 权重与输出仍由本层计算。`,
    "Full 不跨层借用别人的 G，但同样沿 token 复用自己的历史 G。Decode 保留旧行，只计算当前 token 的候选；组完成才追加新行，未完成只暂存，不重算全部历史。Full 表示完整全局生成与索引路径，仍按稀疏选行读取。Prefill 则为输入序列建立缓存并应用因果可见性。",
    "G 的来源与选行结果的来源分开追踪：第 3、9、15、21 层生成 G；第 25、29、33、37 层只重新选行，不生成新 G。后续 Reuse 读取最近来源 Full 的 G 和最近索引来源的行号。G、U 是 KV 表示；索引 Key、Top-K 行号及压缩暂存是不同对象。",
    cacheSourceSummary(layer) +
      "。各层真实入口定义来源别名，出口标明共享范围，不再在主图另外放全层共享大块。第 21–40 层一直读取 G₂₁；第 25、29、33、37 层分别更新选行 ID，其后 Reuse 层沿用最近一组 ID。切换到新 Full 不会销毁前一个 Full 留给下一 token 的历史缓存。",
  ];
}

export function CacheModeLedger({ layer }: { layer: number }) {
  const p = cachePolicy(layer);
  const rows = [
    ["Full", "自己维护 G · 历史保留，新行追加", "自己计算本次行号"],
    [
      "Reindex",
      "读取来源 Full 的 G · 不生成新 G",
      "读取索引 Key，重新打分选行",
    ],
    ["Reuse", "读取来源 Full 的 G · 不生成新 G", "沿用来源层本次行号"],
  ];
  return (
    <section
      data-cache-ledger
      style={{ fontSize: 13, lineHeight: 1.6, minWidth: 0 }}
    >
      <strong>
        CSA2 · 第 {layer} 层为 {p.mode}
      </strong>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          tableLayout: "fixed",
        }}
      >
        <thead>
          <tr>
            <th style={{ width: "16%" }}>模式</th>
            <th>全局 KV：G</th>
            <th>选哪些行：I</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([mode, kv, index]) => (
            <tr
              key={mode}
              data-current-mode={p.mode === mode || undefined}
              style={{ background: p.mode === mode ? "#e4f0eb" : undefined }}
            >
              {[mode, kv, index].map((text) => (
                <td
                  key={text}
                  style={{
                    padding: "5px 8px",
                    borderBottom: "1px solid #d2ded8",
                  }}
                >
                  {text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: "6px 0" }}>
        三种模式都新算当前 token 的本层 U、主 Query 与 Attention
        输出；局部历史窗口直接读。
      </p>
      <p style={{ margin: "6px 0" }}>
        <strong>Full 也复用自己的历史 G，不会每步重算全部历史。</strong>{" "}
        全局指可覆盖远处历史；局部指最近 128
        个位置，都不读取未来。缓存属于当前序列，仅指定层共享。
      </p>
      {p.kv !== null && (
        <div data-cache-source>
          当前 G 来源：第 {p.kv} 层 Full · 当前选行来源：第 {p.index} 层。
          只有来源 Full 层维护独立的 G。
          <br />
          {cacheSourceSummary(layer)}
        </div>
      )}
    </section>
  );
}

export function GlobalCacheHistory({
  layer,
  ratio,
}: {
  layer: number;
  ratio: number;
}) {
  return (
    <section
      data-global-history
      style={{ display: "grid", gap: 8, fontSize: 13 }}
    >
      <strong>Decode 缓存写入 · 旧行原样保留，新行沿行维追加</strong>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <div>
          <RowMatrix
            tex={`G_{${layer}}^{<t}`}
            shape="M_{old}\times512"
            rows={[
              `\\mathbf g_{${layer},1}`,
              `\\mathbf g_{${layer},2}`,
              "\\vdots",
              `\\mathbf g_{${layer},M_{old}}`,
            ]}
            tone="green"
          />
          <M
            tex={`M_{old}=\\left\\lfloor\\frac{t-1}{${ratio}}\\right\\rfloor`}
          />
          <div>进入本步前已有 · 直接保留，不重算</div>
        </div>
        <span>与</span>
        <Box tone="green">
          <M tex={`\\mathbf g_{${layer},i}\\in\\mathbb R^{1\\times512}`} />
          <div>来自上方全局生成分支</div>
          <div>
            {ratio === 2
              ? "偶数 t：组满才生成；奇数 t：仅暂存，不追加"
              : "比例 1：每个新 token 生成一行"}
          </div>
        </Box>
      </div>
      <div style={{ textAlign: "center" }}>
        <M tex="\downarrow" />
      </div>
      <div style={{ textAlign: "center" }}>
        下方 G = 原历史行，末尾接本步新行（若有）；供当前选行及后续指定层读取
      </div>
    </section>
  );
}
