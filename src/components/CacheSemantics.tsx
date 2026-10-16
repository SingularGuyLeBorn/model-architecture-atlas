import { rawConfigs } from "../data/models";
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

export function cacheExplanation(layer: number) {
  const p = cachePolicy(layer);
  return [
    `U 是本层逐 token 的 KV 表示；Decode 只缓存最近最多 128 行，称为本层 SWA 局部窗口缓存。$X_{${layer}}$ 乘本层独立参数 $W_{${layer}}^{KV,\\mathrm{SWA}}$，再经 RMSNorm、RoPE 生成 U。每种模式都为当前 token 新算本地 KV，历史窗口行直接读取；窗口满后覆盖最旧行。`,
    "G 是全局分支 KV 缓存：全局表示可覆盖局部窗口之外的因果历史，只在指定层间共享，压缩表示会损失部分原始信息。只有 Full 来源层独立生成 G；指定后续层读取同一对象。压缩比 2 时由候选内容与 gate 权重逐列合并两行，比例 1 时仅投影和归一化、不做行池化；随后主分支做 RoPE 并存储。",
    p.mode === "SWA-only"
      ? `第 ${layer} 层是 SWA-only：只有自己的 U，没有 G 分支。`
      : `第 ${layer} 层是 ${p.mode}：${p.mode === "Full" ? `维护自己的 $G_{${p.kv}}$，生成当前新增的全局行并计算本次选行结果` : `读取来源 Full 层的 $G_{${p.kv}}$，不生成独立的 $G_{${layer}}$；${p.mode === "Reindex" ? `读取源层索引 Key，用当前层输入重新打分，生成 $I_{${layer},t}$` : `同时沿用第 ${p.index} 层为当前 token 算出的 $I_{${p.index},t}$`}`}。主 Query、局部 KV、Attention 权重与输出仍由本层计算。`,
    "Full 不跨层借用别人的 G，但同样沿 token 复用自己的历史 G。Decode 保留旧行，只计算当前 token 的候选；组完成才追加新行，未完成只暂存，不重算全部历史。Full 表示完整全局生成与索引路径，仍按稀疏选行读取。Prefill 则为输入序列建立缓存并应用因果可见性。",
    "G 的来源与选行结果的来源分开追踪：第 3、9、15、21 层生成 G；第 25、29、33、37 层只重新选行，不生成新 G。后续 Reuse 读取最近来源 Full 的 G 和最近索引来源的行号。G、U 是 KV 表示；索引 Key、Top-K 行号及压缩暂存是不同对象。",
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
