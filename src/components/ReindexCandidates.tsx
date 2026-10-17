import { rawConfigs } from "../data/models";
import { useMemo } from "react";
import { CacheReference } from "./CacheReference";
import {
  Box,
  MathFormula as M,
  SplitArrows,
  MergeArrows,
} from "./diagram-primitives";

const config = rawConfigs.v41.text_config;
export const CANDIDATE_SOURCE = config.candidate_source_layer_id + 1;
export const REINDEX_LAYERS = config.index_source_layer_ids
  .map((id) => id + 1)
  .filter((layer) => layer > CANDIDATE_SOURCE);

export const REINDEX_EXPLANATION =
  "候选范围就是 G 中本次允许参与后续 Top-K 的行号集合。B₂₁,t 是它的 0、1 标记：1 允许入选，0 在本次筛选中排除；G 本身保留全部历史行。第 25、29、33、37 层对同一个 token 都读 G₂₁、源层索引 Key 和第 21 层的同一份候选掩码 B₂₁,t。G 为 M×512，索引 Key 为 M×128。第 21 层将其分数每 8 行分块、取块内最大值，选最多 2048 块并强制纳入最新可见块；掩码最多允许 16384 行。四个 Reindex 层用各自 Query 和 η 算自己的分数，再屏蔽候选范围外的行，从共同范围中各取最多 512 行。候选范围与大小相同，最终 ID 可不同；后一层重索引从共同候选范围选，前一层的 512 个 ID 不限制它。参考实现先算全量分数再应用掩码，候选限制不等于已省掉范围外的点积。Prefill 的各 token 分别按自己的因果可见行生成一行掩码；Decode 为当前 token 生成一行。";

// [OM-FREEPLAY] 20000 行与教学分数用于显露候选筛选，均非模型实测；按真实块上限推导结果。
export function reindexTeachingExample() {
  const rows = 20000;
  const blockSize = config.candidate_block_size;
  const blocks = Array.from(
    { length: Math.ceil(rows / blockSize) },
    (_, b) => ({
      id: b + 1,
      score:
        b === Math.ceil(rows / blockSize) - 1
          ? Infinity
          : b < config.candidate_topk_blocks - 1
            ? 3
            : 1,
    }),
  );
  const allowedBlocks = new Set(
    blocks
      .sort((a, b) => b.score - a.score || a.id - b.id)
      .slice(0, config.candidate_topk_blocks)
      .map((b) => b.id),
  );
  const candidates = Array.from({ length: rows }, (_, i) => i + 1).filter(
    (id) => allowedBlocks.has(Math.ceil(id / blockSize)),
  );
  const branches = REINDEX_LAYERS.map((layer, branch) => {
    const preferred = new Set(
      branch === 3
        ? candidates.slice(-512)
        : candidates.slice(branch * 512, (branch + 1) * 512),
    );
    const scored = Array.from({ length: rows }, (_, i) => {
      const id = i + 1;
      const allowed = allowedBlocks.has(Math.ceil(id / blockSize));
      const raw = allowed ? (preferred.has(id) ? 3 : 1) : 9;
      return { id, raw, masked: allowed ? raw : -Infinity };
    });
    const ids = [...scored]
      .sort((a, b) => b.masked - a.masked || a.id - b.id)
      .slice(0, config.index_topk)
      .map((item) => item.id)
      .sort((a, b) => a - b);
    return { layer, ids, scored };
  });
  return { rows, candidates, branches };
}

function Down({ label }: { label?: string }) {
  return (
    <div style={{ display: "grid", justifyItems: "center", fontSize: 12 }}>
      {label && <span>{label}</span>}
      <svg aria-hidden viewBox="0 0 20 22" style={{ width: 20, height: 22 }}>
        <path
          d="M10 0 V20 M5 14 L10 20 L15 14"
          fill="none"
          stroke="#347f6c"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

export function CandidateFilter({ layer }: { layer: number }) {
  const source = layer === CANDIDATE_SOURCE;
  return (
    <section
      data-candidate-filter={layer}
      style={{
        display: "grid",
        gap: 4,
        fontSize: 14,
        lineHeight: 1.5,
        width: "100%",
      }}
    >
      <strong>
        {source ? "候选掩码生成 · 第 21 层" : "候选掩码 · 先过滤，再 Top-K"}
      </strong>
      {source ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 32px 1fr 32px 1fr",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Box tone="green">
              <M tex="S_{21,t}\quad 1\times M" />
            </Box>
            <M tex="\longrightarrow" />
            <Box tone="green">
              <M tex="\beta_b=\max_{8b-7\le i\le8b}s_{21,t,i}" />
              <br />每 8 行取最大分数
            </Box>
            <M tex="\longrightarrow" />
            <Box tone="amber">
              Top-2048 块（上限）
              <br />
              最新可见块保留
            </Box>
          </div>
          <Down label="入选块的 8 行标为 1，其余标为 0" />
          <Box tone="amber">
            <M tex="B_{21,t}\in\{0,1\}^{1\times M}" />
            　B₂₁,t → 第 25、29、33、37 层
          </Box>
          <small>第 21 层自己的 Top-512：全部因果可见行。</small>
        </>
      ) : (
        <div
          style={{
            display: "grid",
            justifySelf: "center",
            width: "min(100%,720px)",
          }}
        >
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <div
              data-candidate-score
              style={{
                display: "grid",
                gap: 4,
                alignSelf: "end",
                justifyItems: "center",
              }}
            >
              <span data-candidate-score-caption>本层分数</span>
              <Box tone="green">
                <M tex={"S_{" + layer + ",t}\\quad1\\times M"} />
              </Box>
            </div>
            <CacheReference layer={layer} source={CANDIDATE_SOURCE} kind="B" />
          </div>
          <MergeArrows count={2} />
          <Box tone="amber">
            <M
              tex={`\\widetilde s_{${layer},t,i}=\\begin{cases}s_{${layer},t,i}&B_{${layer},t,i}=1\\\\-\\infty&B_{${layer},t,i}=0\\end{cases}`}
            />
          </Box>
          <Down label="过滤后的分数 → 下方 Top-K" />
        </div>
      )}
    </section>
  );
}

export function ReindexCandidates() {
  const example = useMemo(reindexTeachingExample, []);
  const blockColumns = [
    { id: "1", score: "3", yes: true },
    { id: "2", score: "3", yes: true },
    null,
    { id: "2047", score: "3", yes: true },
    { id: "2048", score: "1", yes: false },
    null,
    { id: "2499", score: "1", yes: false },
    { id: "2500", score: "∞", yes: true },
  ];
  return (
    <section
      data-reindex-candidates
      style={{
        display: "grid",
        gap: 8,
        fontSize: 14,
        lineHeight: 1.5,
        borderTop: "1px solid #b7c9c0",
        paddingTop: 12,
      }}
    >
      <strong style={{ fontSize: 19 }}>候选范围 = 本次允许入选的 G 行</strong>
      <small>教学例：t = 20000，G₂₁ 为 20000 × 512；分数非模型实测。</small>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          alignItems: "center",
        }}
      >
        <Box tone="green">
          <M tex="K_{21}^{I\prime}\quad M\times128" />
          <br />第 21 层的索引 Key
        </Box>
        <Box tone="blue">
          <M tex="Q_{21,t}^{I\prime},\;\eta_{21,t}" />
          <br />第 21 层当前 token
        </Box>
      </div>
      <MergeArrows count={2} />
      <Box tone="green">
        <M tex="S_{21,t}\quad 1\times20000" />
        <br />
        每个 G 行一个分数
      </Box>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 36px 170px",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div
          style={{ border: "1px solid #91b6ab", borderRadius: 7, padding: 8 }}
        >
          <strong>块 1 · G 行 1–8 的分数</strong>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(8,minmax(0,1fr))",
              gap: 5,
              marginTop: 6,
            }}
          >
            {[0.2, 1.1, 3, 0.5, 1.4, 0, 2.2, 0.7].map((score, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <small>行 {i + 1}</small>
                <Box tone={score === 3 ? "amber" : "green"}>{score}</Box>
              </div>
            ))}
          </div>
        </div>
        <M tex="\xrightarrow{\max}" />
        <Box tone="amber">
          <M tex="\beta_1=3" />
          <br />
          块分数
        </Box>
      </div>
      <Down label="2500 块 · 每块 8 行" />
      <div
        data-candidate-blocks
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 22px 1fr 1fr 22px 1fr 1fr",
          gap: 6,
          textAlign: "center",
          alignItems: "center",
        }}
      >
        {blockColumns.map((block, i) =>
          block ? (
            <div key={i}>
              <small>块 {block.id}</small>
              <Box tone={block.yes ? "amber" : "blue"}>{block.score}</Box>
            </div>
          ) : (
            <M key={i} tex="\cdots" />
          ),
        )}
      </div>
      <small style={{ textAlign: "right" }}>
        最新块 2500：强制保留，分数置 +∞
      </small>
      <Down label="Top-2048 块 → 展开到原 G 行号" />
      <div
        data-candidate-mask
        style={{ border: "1px solid #bd9a66", borderRadius: 8, padding: 10 }}
      >
        <strong>B₂₁,t：1 = 允许入选　0 = 本次排除</strong>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
            marginTop: 8,
          }}
        >
          {[
            { rows: "1–16376", value: 1, count: 16376 },
            { rows: "16377–19992", value: 0, count: 3616 },
            { rows: "19993–20000", value: 1, count: 8 },
          ].map(({ rows, value, count }) => (
            <div
              key={rows}
              data-mask-range={rows}
              data-allowed={value}
              style={{
                textAlign: "center",
                background: value ? "#e3f2e8" : "#edf0f2",
                border: "1px solid " + (value ? "#6ea68d" : "#b9c1c8"),
                borderRadius: 6,
                padding: 8,
              }}
            >
              <strong>G 行 {rows}</strong>
              <br />
              <M
                tex={value ? "[1\\;1\\;\\cdots\\;1]" : "[0\\;0\\;\\cdots\\;0]"}
              />
              <br />
              {count} 行
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 8 }}>
          {example.candidates.length} 个 1 · G 仍保留全部 20000 行
        </div>
      </div>
      <Box tone="green">
        <M tex="K_{21}^{I\prime},\;B_{21,t},\;G_{21}" />
        <br />
        四层读取同一份源
      </Box>
      <SplitArrows count={4} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,minmax(0,1fr))",
          gap: 10,
        }}
      >
        {example.branches.map(({ layer, ids }) => {
          const selected = ids[0];
          const other = layer === 25 ? 513 : 1;
          return (
            <div
              key={layer}
              data-reindex-branch={layer}
              style={{
                display: "grid",
                gap: 5,
                alignContent: "start",
                border: "1px solid #9ab8ad",
                borderRadius: 7,
                padding: 8,
                minWidth: 0,
              }}
            >
              <strong style={{ fontSize: 16 }}>第 {layer} 层 · Reindex</strong>
              <Box tone="blue">
                <M
                  tex={
                    "Q_{" + layer + ",t}^{I\\prime},\\;\\eta_{" + layer + ",t}"
                  }
                />
                <br />
                本层重算
              </Box>
              <Down label="与源层 Key 打分" />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "36px repeat(3,minmax(0,1fr))",
                  gap: 3,
                  textAlign: "center",
                  fontSize: 12,
                }}
              >
                {[
                  "G 行",
                  selected,
                  other,
                  16377,
                  "分数",
                  3,
                  1,
                  9,
                  "B",
                  1,
                  1,
                  0,
                  "过滤",
                  3,
                  1,
                  "−∞",
                ].map((value, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "4px 1px",
                      borderBottom: "1px solid #d6dfdb",
                      background: i % 4 === 3 ? "#edf0f2" : undefined,
                    }}
                  >
                    {value}
                  </div>
                ))}
              </div>
              <Down label="Top-512 · 按原行号排序" />
              <Box tone="amber">
                <M tex={"I_{" + layer + ",t}\\quad1\\times512"} />
                <br />
                {layer === 37 ? (
                  <>
                    15873–16376
                    <br />
                    19993–20000
                  </>
                ) : (
                  ids[0] + "–" + ids.at(-1)
                )}
              </Box>
              <Down label="按 ID 从 G₂₁ 取行" />
              <Box tone="green">
                <M tex={"G_{21}[I_{" + layer + ",t}]"} />
                <br />
                512 × 512
              </Box>
              <Down label="同 G、同 ID" />
              <Box tone="blue">
                Reuse · 第 {layer + 1}–{layer + 3} 层
              </Box>
            </div>
          );
        })}
      </div>
      <small>
        同一候选范围 → 四组 ID；未选行仍在 G。详细计算与 Prefill 规则见旁注。
      </small>
    </section>
  );
}
