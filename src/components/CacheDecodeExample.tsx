import type { ReactNode } from "react";
import type { Recipe, Stage } from "../templates/recipes";
import {
  MathFormula as M,
  ParameterColumn,
  StackedSum,
  type DiagramTone,
  tonePalette,
} from "./diagram-primitives";
import { Data, Down, Sequence } from "../templates/structure-blocks";
import { CacheModeLedger } from "./CacheSemantics";

// 固定官方 V4.1 配置：界面层号从 1 开始；3 是 Full，4 是 Reuse。
export function cacheStep(token: 1201 | 1202) {
  const globalRows = Math.floor(token / 2);
  // [OM-FREEPLAY] 教学分数用于展示真实 Top-K 筛选；确定性排列避免并列，非模型运行值。
  const scores = Array.from({ length: globalRows }, (_, index) => ({
    id: index + 1,
    score: ((((index + 1) * 37 + token) % globalRows) + 1) / 100,
  }));
  const ranked = [...scores].sort((a, b) => b.score - a.score);
  const ids = ranked
    .slice(0, 512)
    .map((row) => row.id)
    .sort((a, b) => a - b);
  return {
    scores,
    ranked,
    token,
    previous: token - 1,
    window: 128,
    ratio: 2,
    firstBefore: token - 128,
    firstAfter: token - 127,
    evicted: token - 128,
    globalBefore: Math.floor((token - 1) / 2),
    globalRows,
    appendGlobal: token % 2 === 0,
    localRows: 128,
    readRows: 128 + ids.length,
    ids,
  };
}
export const CACHE_STEPS = [cacheStep(1201), cacheStep(1202)];
type Step = ReturnType<typeof cacheStep>;

function Rows({
  name,
  rows,
  shape,
  tone = "blue",
  fresh,
}: {
  name: string;
  rows: { tex: string; label: string; tone?: DiagramTone }[];
  shape: string;
  tone?: DiagramTone;
  fresh?: string;
}) {
  const palette = tonePalette(tone);
  return (
    <section
      className="cache-matrix"
      data-cache-matrix
      style={{ borderColor: palette.color }}
    >
      <header>
        <M tex={name} />
        <M tex={shape} />
      </header>
      <div className="cache-rows">
        {rows.map((row, index) =>
          row.tex === "separator" ? (
            <hr key={index} />
          ) : row.tex === "dots" ? (
            <div key={index} className="cache-row-dots">
              <span />
              <span>⋮</span>
            </div>
          ) : (
            <div
              key={index}
              className="cache-row"
              data-new-row={row.tex === fresh || undefined}
            >
              <small>{row.label}</small>
              <span
                style={{
                  background: tonePalette(row.tone ?? tone).background,
                  borderColor: tonePalette(row.tone ?? tone).color,
                }}
              >
                <M tex={row.tex} />
              </span>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
function localRows(layer: number, first: number, last: number) {
  return [first, first + 1, "dots", last].map((i) => ({
    tex: i === "dots" ? "dots" : `\\mathbf u_{${layer},${i}}`,
    label: `token ${i}`,
    tone: "blue" as const,
  }));
}
function globalRows(count: number) {
  return [1, 2, "dots", count - 1, count].map((i) => ({
    tex: i === "dots" ? "dots" : `\\mathbf g_{3,${i}}`,
    label:
      i === "dots"
        ? ""
        : `行 ${i} · token ${Number(i) * 2 - 1}、${Number(i) * 2}`,
  }));
}
function Frame({ children, notes }: { children: ReactNode; notes: string[] }) {
  return (
    <div className="cache-example">
      <div className="cache-structure">{children}</div>
      <aside className="cache-note" aria-label="缓存旁注">
        <h4>对照说明</h4>
        {notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </aside>
    </div>
  );
}
function Weight({ layer, branch }: { layer: number; branch: string }) {
  return (
    <section className="cache-weight">
      <header>
        <M tex={`W_{${layer}}^{${branch}}`} />
        <M tex="5120\times512" />
      </header>
      <div className="cache-inline">
        {["1", "2", "dots", "512"].map((i) =>
          i === "dots" ? (
            <span key={i}>⋯</span>
          ) : (
            <ParameterColumn
              key={i}
              tex={`\\mathbf w_{${layer},${i}}^{${branch}}`}
            />
          ),
        )}
      </div>
      <small>本层独立参数 · 推理时读取</small>
    </section>
  );
}
function Project({
  token,
  layer,
  branch,
  result,
  resultTone = "green",
}: {
  token: number;
  layer: number;
  branch: string;
  result: string;
  resultTone?: DiagramTone;
}) {
  return (
    <div className="cache-inline">
      <Data tone="blue">
        <M tex={`\\mathbf x_{${layer},${token}}`} />
        <small>1 × 5120</small>
      </Data>
      <M tex="\times" />
      <Weight layer={layer} branch={branch} />
      <M tex="=" />
      <Data tone={resultTone}>
        <M tex={result} />
        <small>1 × 512</small>
      </Data>
    </div>
  );
}

function Local({ layer, step }: { layer: number; step: Step }) {
  const { token: t } = step;
  return (
    <>
      <p>
        <M tex={`\\mathbf x_{${layer},${t}}\\in\\mathbb R^{1\\times5120}`} />{" "}
        来自本层 mHC 汇合与 Attention 输入 RMSNorm；局部 KV 与 Query 分支并行。
      </p>
      <div className="cache-projections">
        <section>
          <h4>局部 KV · 当前行新算</h4>
          <Project
            token={t}
            layer={layer}
            branch="KV,\mathrm{SWA}"
            result={`\\widehat{\\mathbf u}_{${layer},${t}}`}
            resultTone="blue"
          />
          <Down label={`RMSNorm → token ${t} 的 RoPE → FP8 存储`} />
          <Data tone="blue">
            <M tex={`\\mathbf u_{${layer},${t}}\\in\\mathbb R^{1\\times512}`} />
          </Data>
        </section>
        <section className="cache-query">
          <h4>主 Query · 当前行新算</h4>
          <M
            tex={`\\mathbf x_{${layer},${t}}W_{${layer}}^{Q\\downarrow}\\ \\xrightarrow{\\mathrm{RMSNorm}}\\ \\mathbf q^r_{${layer},${t}}`}
          />
          <M
            tex={`\\mathbf q^r_{${layer},${t}}W_{${layer}}^{Q\\uparrow}=\\widetilde{\\mathbf q}_{${layer},${t}}`}
          />
          <p>5120 → 1280 → 64 × 512；拆为 64 个 Head，各自做 RoPE。</p>
          <div className="cache-inline">
            {[1, 2, "dots", 64].map((h) =>
              h === "dots" ? (
                <span key={h}>⋯</span>
              ) : (
                <Data key={h} tone="cyan">
                  <M tex={`\\mathbf q'_{${layer},${h},${t}}`} />
                </Data>
              ),
            )}
          </div>
        </section>
      </div>
      <LocalWindow layer={layer} step={step} />
    </>
  );
}
function LocalWindow({ layer, step }: { layer: number; step: Step }) {
  const { token: t, previous, firstBefore, firstAfter, evicted } = step;
  return (
    <>
      <h4>窗口更新 · 旧行直接读，只替换最旧的一行</h4>
      <div className="cache-inline cache-top">
        <div>
          <strong>写入前 · 128 行</strong>
          <Rows
            name={`U_{${layer},${previous}}`}
            shape="128\times512"
            rows={localRows(layer, firstBefore, previous)}
            fresh={`\\mathbf u_{${layer},${evicted}}`}
          />
        </div>
        <div className="cache-window-change">
          <span className="cache-action">淘汰 token {evicted}</span>
          <M
            tex={`\\mathbf u_{${layer},${evicted}}\\ \\longrightarrow\\ \\mathbf u_{${layer},${t}}`}
          />
          <span>同一物理槽位覆盖</span>
          <span>
            保留 token {firstAfter}–{previous}
          </span>
        </div>
        <div>
          <strong>写入后 · 仍是 128 行</strong>
          <Rows
            name={`U_{${layer},${t}}`}
            shape="128\times512"
            rows={localRows(layer, firstAfter, t)}
            fresh={`\\mathbf u_{${layer},${t}}`}
          />
        </div>
      </div>
      <p>
        两边按 token
        时间顺序展开逻辑窗口，不表示物理槽位顺序。框线高亮分别标出被淘汰行和新写入行；其余
        127 行无需重新投影。
      </p>
    </>
  );
}
function Global({ step }: { step: Step }) {
  const { token: t, globalRows: m, appendGlobal } = step;
  return (
    <>
      <h4>当前输入 → 两组独立参数 → 候选内容与分数</h4>
      <div className="cache-projections">
        <Project
          token={t}
          layer={3}
          branch="KV,G"
          result={`\\mathbf v^c_{3,${t}}`}
        />
        <Project
          token={t}
          layer={3}
          branch="\mathrm{gate}"
          result={`\\mathbf a^{\\mathrm{gate}}_{3,${t}}`}
          resultTone="violet"
        />
      </div>
      <Down label="写入第 601 个压缩组 · 每槽保存一行内容和一行分数" />
      <div className="cache-pending" data-pending-step={t}>
        <strong>
          {appendGlobal
            ? "两槽到齐 · 读取上一步暂存 + 本步新算"
            : "只到一槽 · 等待 token 1202，不提前生成全局行"}
        </strong>
        <div className="cache-projections">
          <Data>
            <strong>
              槽 1 · token 1201 · {appendGlobal ? "直接读暂存" : "本步写入"}
            </strong>
            <M tex="\mathbf v^c_{3,1201},\quad\mathbf a^{\mathrm{gate}}_{3,1201}" />
            <small>各为 1 × 512</small>
          </Data>
          {appendGlobal ? (
            <Data>
              <strong>槽 2 · token 1202 · 本步写入</strong>
              <M tex="\mathbf v^c_{3,1202},\quad\mathbf a^{\mathrm{gate}}_{3,1202}" />
              <small>各为 1 × 512</small>
            </Data>
          ) : (
            <Data tone="amber">
              槽 2 未到达
              <br />
              无有效候选内容
            </Data>
          )}
        </div>
      </div>
      {appendGlobal ? (
        <>
          <Down label="组满 · 同列两项 Softmax，再逐列加权合并" />
          <div className="cache-query">
            <M tex="\alpha_{3,601,r,d}=\frac{e^{\boxed{a^{\mathrm{gate}}_{3,1200+r,d}}}}{e^{\boxed{a^{\mathrm{gate}}_{3,1201,d}}}+e^{\boxed{a^{\mathrm{gate}}_{3,1202,d}}}}" />
            <p>
              r=1、2 对应组内两个 token；d=1,…,512。α 是权重，vᶜ 是候选内容。
            </p>
            <div className="cache-inline">
              <StackedSum outputDirection="right">
                {[
                  <Data key="1201" tone="cyan">
                    <M tex="\boldsymbol\alpha_{3,601,1}\odot\mathbf v^c_{3,1201}" />
                  </Data>,
                  <Data key="1202" tone="cyan">
                    <M tex="\boldsymbol\alpha_{3,601,2}\odot\mathbf v^c_{3,1202}" />
                  </Data>,
                ]}
              </StackedSum>
              <div className="cache-normalize">
                <span>RMSNorm</span>
                <M tex="\longrightarrow" />
              </div>
              <Data>
                <M tex="\widehat{\mathbf g}_{3,601}" />
                <small>1 × 512 · RoPE 前</small>
              </Data>
            </div>
          </div>
          <div className="cache-projections">
            <div className="cache-query">
              <strong>由同一压缩潜向量生成索引 Key</strong>
              <M tex="\widehat{\mathbf g}_{3,601}W_3^{IK}\ \xrightarrow{\mathrm{RMSNorm,\ RoPE,\ FP4}}\ \mathbf k^{I\prime}_{3,601}" />
              <p>
                W₃ᴵᴷ 为独立参数，512 × 128。追加索引 Key 第 601 行（1 ×
                128），供本步 Indexer 打分。
              </p>
            </div>
            <div className="cache-query">
              <strong>主分支写入全局 KV</strong>
              <M tex="\widehat{\mathbf g}_{3,601}\ \xrightarrow{\mathrm{RoPE,\ FP4}}\ \mathbf g_{3,601}" />
              <p>
                追加 G 第 601 行（1 × 512），供本步 Attention
                读取。两分支使用组首 token 1201 的位置。
              </p>
            </div>
          </div>
          <p>
            实际调用先生成索引 Key 并选行，再旋转潜向量并写 G；Attention
            在两者就绪后读取。两条分支共享 RoPE 前的来源，不拿旋转后的 G
            再生成索引 Key。
          </p>
        </>
      ) : (
        <p>
          本步不产生新的压缩潜向量，因此 G 与索引 Key 都不追加；已有的第 1–600
          行直接读取。
        </p>
      )}
      <div className="cache-inline cache-top" data-global-state={t}>
        <Rows
          name={`G_3^{\\le${t}}`}
          shape={`${m}\\times512`}
          tone="green"
          rows={globalRows(m)}
          fresh={appendGlobal ? "\\mathbf g_{3,601}" : undefined}
        />
        <Rows
          name={`K_3^{I\\prime,\\le${t}}`}
          shape={`${m}\\times128`}
          tone="cyan"
          rows={globalRows(m).map((row) => ({
            ...row,
            tex: row.tex.replace("\\mathbf g", "\\mathbf k^{I\\prime}"),
          }))}
          fresh={appendGlobal ? "\\mathbf k^{I\\prime}_{3,601}" : undefined}
        />
      </div>
      <p>
        同一个行号 i 对应同一组 token：G 的第 i 行用于主 Attention，索引 Key 第
        i 行用于快速匹配。旧 600 行保持；
        {appendGlobal
          ? "本步新增第 601 行。暂存组已消费，下一组等待 token 1203、1204；物理槽不必清零，下组按位置覆盖。"
          : "候选 token 1201 尚未成为可选的 G 行。"}{" "}
        上标 ≤t 表示同一缓存到该时刻的状态，始终是同一份缓存。
      </p>
    </>
  );
}
function idsTex(step: Step) {
  return `(${step.ids[0]},${step.ids[1]},\\ldots,${step.ids.at(-1)})`;
}

function SelectionEvidence({
  step,
  part = "all",
}: {
  step: Step;
  part?: "all" | "scores" | "rows";
}) {
  const { token: t, globalRows: m, ranked, ids } = step;
  const shownIds = [
    ...new Set([
      1,
      2,
      ids[0],
      ids[1],
      ranked[0].id,
      ranked[511].id,
      ranked[512].id,
      ids[511],
      m,
    ]),
  ].sort((a, b) => a - b);
  return (
    <section
      className="cache-selection-evidence"
      data-score-columns={m}
      data-selected-ids={ids.join(",")}
    >
      <h4>
        {part === "rows"
          ? "已选 ID → 原 G 行 → 拼接位置"
          : "教学分数 → Top-512 → 原 G 行"}
      </h4>
      <p>
        以下数值为教学赋值，用来演示筛选，非模型实测输出。真实分数由 Indexer 的
        η × A 得到；每个候选只有一个最终分数，分数越大越优先。
      </p>
      {part !== "rows" && (
        <div className="cache-projections">
          <section>
            <h4>① 按分数选 512 个 ID</h4>
            <table className="cache-ranking" aria-label={`token ${t} 分数排名`}>
              <thead>
                <tr>
                  <th>名次</th>
                  <th>原 G 行 ID</th>
                  <th>分数</th>
                  <th>本步</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, "dots", 511, 512, "tail", m - 1].map((rank) =>
                  typeof rank === "string" ? (
                    <tr key={rank}>
                      <td colSpan={4}>⋮</td>
                    </tr>
                  ) : (
                    <tr
                      key={rank}
                      data-rank={rank + 1}
                      data-selected={rank < 512}
                    >
                      <td>{rank + 1}</td>
                      <td>{ranked[rank].id}</td>
                      <td>{ranked[rank].score.toFixed(2)}</td>
                      <td>{rank < 512 ? "选中" : "未选"}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            <p>
              第 512 名 {ranked[511].score.toFixed(2)} ＞ 第 513 名{" "}
              {ranked[512].score.toFixed(2)}。本例无并列；上面省略的第 3–511
              名全部入选，第 514–{m - 1} 名全部未选。
            </p>
          </section>
          <section className="cache-query">
            <h4>② 选中的 ID 按原位置排序</h4>
            <Data tone="amber">
              <M tex={`I_{3,${t}}=${idsTex(step)}`} />
              <small>1 × 512 · 共 512 个原 G 行号</small>
            </Data>
            <p>
              排列按行号递增，保留刚才选中的集合；第 1 项 ID={ids[0]}，第 2 项
              ID=
              {ids[1]}，末项 ID={ids.at(-1)}。省略号只省略其余 509 个已选 ID。
            </p>
            <M
              tex={`G^{\\mathrm{selected}}_{3,${t}}\\in\\mathbb R^{512\\times512}`}
            />
            <p>
              选中 512 行，未选 {m - 512} 行。缓存 G 仍有 {m}{" "}
              行；未选行下次仍可参与评分。
            </p>
          </section>
        </div>
      )}
      {part !== "scores" && (
        <>
          <Down label="③ 保留原 G 行号取数 · 琥珀轮廓标出本步选中行" />
          <table
            className="cache-selection-map"
            aria-label={`token ${t} 原 G 行对应`}
          >
            <thead>
              <tr>
                <th>原 G 行 i</th>
                <th>压缩来源 token</th>
                <th>缓存向量 · 1 × 512</th>
                <th>本步分数</th>
                <th>读取去向</th>
              </tr>
            </thead>
            <tbody>
              {shownIds.flatMap((id, index) => {
                const j = ids.indexOf(id) + 1;
                return [
                  index > 0 && id > shownIds[index - 1] + 1 ? (
                    <tr key={`gap-${id}`}>
                      <td>⋮</td>
                      <td>⋮</td>
                      <td>⋮</td>
                      <td>⋮</td>
                      <td>⋮</td>
                    </tr>
                  ) : null,
                  <tr key={id} data-candidate-id={id} data-selected={j > 0}>
                    <td>{id}</td>
                    <td>
                      {2 * id - 1}、{2 * id}
                    </td>
                    <td>
                      <Data>
                        <M tex={`\\mathbf g_{3,${id}}`} />
                      </Data>
                    </td>
                    <td>{step.scores[id - 1].score.toFixed(2)}</td>
                    <td>
                      {j
                        ? `I 第 ${j} 项 → KV 第 ${128 + j} 行`
                        : "未选 · 留在 G 中，本步不读取"}
                    </td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </>
      )}
      <p>
        {part === "scores"
          ? "下方全局 KV 取行模块按这些 ID 展开原 G 行。"
          : "表按原 G 行顺序展开代表行，点串省略中间行。"}
        ID 指 G 的逻辑行号，从 1 开始；代码中使用零基索引和局部区偏移。token {t}{" "}
        的分数向量 s 有 {m} 列，第 i 列就对应表中的 G 行 i。
      </p>
    </section>
  );
}
function IndexSelection({ step }: { step: Step }) {
  const { token: t, globalRows: m } = step;
  return (
    <section className="cache-index-selection" data-index-step={t}>
      <h4>Indexer · 当前 Query 提问，候选是 G 的行</h4>
      <div className="cache-projections">
        <div className="cache-query">
          <strong>查询来源 · 当前 token {t}</strong>
          <M
            tex={`\\mathbf q^r_{3,${t}}W_3^{IQ}\\ \\xrightarrow{\\mathrm{reshape,\\ RoPE}}\\ Q^{I\\prime}_{3,${t}}\\in\\mathbb R^{32\\times128}`}
          />
          <M
            tex={`\\boldsymbol\\eta_{3,${t}}=\\frac{\\mathbf x_{3,${t}}W_3^{IW}}{\\sqrt{32}}\\in\\mathbb R^{1\\times32}`}
          />
          <p>
            W₃ᴵQ：1280 × 4096；W₃ᴵW：5120 × 32，均为独立参数。32 行是索引
            Head；候选轴对应压缩缓存行。
          </p>
        </div>
        <div className="cache-query">
          <strong>候选来源 · 已完成的压缩组</strong>
          <M tex={`K_3^{I\\prime,\\le${t}}\\in\\mathbb R^{${m}\\times128}`} />
          <p>
            读取刚才的索引 Key 缓存；每行对应 G₃ 的同号行。
            {t === 1202
              ? "包含本步新追加的第 601 行。"
              : "只有第 1–600 行，不含尚未压缩完的 token 1201。"}
          </p>
        </div>
      </div>
      <div className="cache-query">
        <M
          tex={`A_{3,${t}}=\\operatorname{ReLU}\\!\\left(\\frac{Q^{I\\prime}_{3,${t}}(K_3^{I\\prime,\\le${t}})^{\\mathsf T}}{\\sqrt{d_I}}\\right),\\quad d_I=128`}
        />
        <div className="cache-inline">
          <Data tone="amber">
            <M tex={`\\boldsymbol\\eta_{3,${t}}`} />
            <small>1 × 32</small>
          </Data>
          <M tex="\times" />
          <Rows
            name={`A_{3,${t}}`}
            shape={`32\\times${m}`}
            tone="cyan"
            rows={[1, 2, "dots", 32].map((h) => ({
              tex: h === "dots" ? "dots" : `\\mathbf a^I_{3,${h},${t}}`,
              label: `Head ${h} · ${m} 个候选分数`,
            }))}
          />
          <M tex="=" />
          <Data tone="green">
            <M tex={`\\mathbf s_{3,${t}}`} />
            <small>1 × {m}</small>
          </Data>
        </div>
        <p>
          A 的行是 32 个 Head，列 i 是候选 G 行 i；权重乘矩阵归约 Head
          轴，不归约候选行轴。
        </p>
      </div>
      <SelectionEvidence step={step} />
      <p>
        S 的完整矩阵按查询 token 排行、按候选缓存排列；Decode 本步只算 s₃,{t}{" "}
        这一行，并不保留历史分数矩阵。本步行号传给第 4 层；下一 token 在第 3
        层重新打分选行。
      </p>
    </section>
  );
}
function ReadAttention({ layer, step }: { layer: number; step: Step }) {
  const { token: t, readRows } = step;
  return (
    <>
      <CacheReadRows layer={layer} step={step} />
      <Down label="当前主 Query 读取 KV · 新算本层 Attention 输出" />
      <div className="cache-query">
        <M
          tex={`\\mathbf z_{${layer},h,${t}}=\\frac{\\mathbf q'_{${layer},h,${t}}K_{${layer},${t}}^{\\mathsf T}}{\\sqrt{d_k}},\\quad d_k=512`}
        />
        <M
          tex={`a_{${layer},h,${t},j}=\\frac{e^{\\boxed{z_{${layer},h,${t},j}}}}{\\sum_{i=1}^{${readRows}}e^{\\boxed{z_{${layer},h,${t},i}}}+e^{\\boxed{b_{${layer},h}}}}`}
        />
        <M
          tex={`\\mathbf o_{${layer},h,${t}}=\\mathbf a_{${layer},h,${t}}V_{${layer},${t}}`}
        />
        <p>
          h=1,…,64；b 是本层各 Head 的独立 sink 参数。此处是主 Attention
          分数，和 Indexer 用于选行的 s 不同。
        </p>
      </div>
      <Sequence>
        {[
          <Data key="a">64 Head 输出逆 RoPE、拼接与分组投影 → mHC 回写</Data>,
          <Data key="f">FFN 汇合、归一化、MoE → mHC 回写</Data>,
          <Data key="h" tone="blue">
            <M
              tex={`H_{${layer},${t}}^{\\mathrm{out}}=H_{${layer + 1},${t}}^{\\mathrm{in}}`}
            />
            <small>1 × 4 × 5120 · 同一 token 进入下一层</small>
          </Data>,
        ]}
      </Sequence>
    </>
  );
}
function CacheReadRows({ layer, step }: { layer: number; step: Step }) {
  const { token: t, firstAfter, readRows } = step;
  return (
    <>
      <h4>按行拼接 · 本层窗口 + 选中的 G 行</h4>
      <div className="cache-inline">
        <Rows
          name={`KV_{${layer},${t}}`}
          shape={`${readRows}\\times512`}
          tone="green"
          rows={[
            ...localRows(layer, firstAfter, t),
            { tex: "separator", label: "" },
            ...[0, 1, "dots", 511].map((j) => ({
              tex:
                j === "dots" ? "dots" : `\\mathbf g_{3,${step.ids[Number(j)]}}`,
              label:
                j === "dots"
                  ? ""
                  : `结果行 ${129 + Number(j)} · 原 G 行 ${step.ids[Number(j)]}`,
            })),
          ]}
        />
        <div className="cache-read-labels">
          <p>
            上段 128 行：本层 U{layer}，token {firstAfter}–{t}。
          </p>
          <p>
            下段 512 行：按 I 的顺序读取 G₃；第 j 个选中 ID 为 iⱼ，原 G 行 iⱼ
            位于结果行 128+j。j=1,…,512。
          </p>
          <M tex={`K_{${layer},${t}}=V_{${layer},${t}}=KV_{${layer},${t}}`} />
          <p>
            {readRows} 个表示 ≠ {readRows} 个不同
            token；局部与压缩表示覆盖的历史可以重叠。
          </p>
        </div>
      </div>
    </>
  );
}
export function cacheDecodeRecipe(references: Recipe["references"]): Recipe {
  const stages: Stage[] = [
    {
      id: "history1200",
      title: "起点 · 前 1200 个 token 已完成",
      output: "\\mathrm{cached\\ state}",
      body: (
        <Frame
          notes={[
            "固定官方 V4.1 场景：第 3 层 Full，第 4 层 Reuse；SWA 容量 128，压缩比 2，索引 Top-K 上限 512。图中层、token、G 行号从 1 开始。",
            "蓝色 U 是每层自己的局部 KV，绿色 G 是第 3 层生成的全局表示，青色索引 Key 用于候选匹配。全局指序列范围可超出窗口，所属序列和源层明确。",
            "只展开第 3、4 层；token 1201 仍须通过其余层并完成本步，才进入 token 1202 的处理。两个 token 的层内输入各走自己的前向路径。",
          ]}
        >
          <CacheModeLedger layer={3} />
          <div className="cache-inline cache-top">
            {[3, 4].map((l) => (
              <Rows
                key={l}
                name={`U_${l}^{\\mathrm{SWA},\\le1200}`}
                shape="128\times512"
                rows={localRows(l, 1073, 1200)}
              />
            ))}
            <Rows
              name="G_3^{\le1200}"
              shape="600\times512"
              tone="green"
              rows={globalRows(600)}
            />
          </div>
          <p>
            U₃ 与 U₄ 来自不同层的输入和本层独立投影参数，分别保存。G₃ 的第 1–600
            行已经生成，后续直接读取，不重新压缩这些旧组。
          </p>
          <div className="cache-inline">
            <Data tone="cyan">
              <M tex="K_3^{I\prime,\le1200}\in\mathbb R^{600\times128}" />与 G₃
              的 600 行一一对应
            </Data>
            <Data tone="amber">
              压缩暂存：第 600 组已完成
              <br />
              下一组等待 token 1201、1202
            </Data>
          </div>
          <p>
            每个新 token 经前两层来到 H₃ᶦⁿ，再经第 3 层 mHC 汇合与输入 RMSNorm
            得到 x₃,t。以下图中各分支均保留当前 token 的下标。
          </p>
        </Frame>
      ),
    },
  ];
  const links: Recipe["links"] = [];
  for (const step of CACHE_STEPS) {
    const { token: t, globalRows: m, previous } = step;
    stages.push(
      {
        id: `local${t}`,
        title: `t=${t} · 第 3 层 Full · 局部窗口更新`,
        output: `U_3^{\\mathrm{SWA},\\le${t}}`,
        body: (
          <Frame
            notes={[
              `新算 u₃,${t}，覆盖 token ${step.evicted} 的槽位；写后为 token ${step.firstAfter}–${t}，仍是 128 行。`,
              "当前行第一次计算；旧 127 行直接保留。Full 也复用自己的历史局部缓存，旧行无需再次投影。",
              "本层主 Query 新算；低秩 Query 同时供 Indexer 使用。局部 KV 与全局候选使用不同投影参数，分别生成 U 与候选 vᶜ。",
            ]}
          >
            <Local layer={3} step={step} />
          </Frame>
        ),
      },
      {
        id: `global${t}`,
        title: `t=${t} · 第 3 层 Full · ${step.appendGlobal ? "组满追加第 601 行" : "暂存候选，G 仍 600 行"}`,
        output: `G_3^{\\le${t}},\\ I_{3,${t}}`,
        body: (
          <Frame
            notes={[
              "Full 自己持有并更新 G，但仍保留历史 G；只为当前输入生成候选内容与 gate 分数。",
              t === 1201
                ? "第 601 组只收到 token 1201。暂存只有在组完成后才成为 G 的有效候选行；索引 Key 仍为 600 行。"
                : "直接读取上一步暂存的 token 1201 候选和分数，不重算。token 1202 到齐后，两槽逐列加权压成一行，G 与索引 Key 均增至 601 行。",
              "vᶜ 保存候选内容；α 是沿组内行方向 Softmax 得到的逐元素权重。它们是输入相关结果，W 是独立参数。",
              "Indexer 筛选对象是 G 的候选行。Query 是发起匹配的当前 token，32 个 Head 是不同匹配分支；候选对应压缩缓存行。",
              `当前有 ${m} 个可见全局行，选 512 行，另 ${m - 512} 行本步未选。分数为教学赋值；下一 token 重新匹配，选中集合可以变化。`,
            ]}
          >
            <Global step={step} />
            <IndexSelection step={step} />
          </Frame>
        ),
      },
      {
        id: `attend${t}`,
        title: `t=${t} · 第 3 层 · 读缓存并计算输出`,
        output: `H_{4,${t}}^{\\mathrm{in}}`,
        body: (
          <Frame
            notes={[
              `128 行本地窗口与 512 行选中全局表示沿行拼接，共 ${step.readRows} 行；列维保持 512。第 j 个选中项的原 G 行号 iⱼ 继续保留，读取结果行号为 128+j。`,
              "未选中的 G 行仍保留在缓存中；Top-K 只决定当前读取集合。局部窗口淘汰与全局候选未选中是两种不同操作。",
              "当前主 Query 重新给这些 KV 打分并得到输出。再经过本层 FFN 和残差回写，才把同一 token 交给第 4 层。",
            ]}
          >
            <ReadAttention layer={3} step={step} />
          </Frame>
        ),
      },
      {
        id: `reuse${t}`,
        title: `t=${t} · 第 4 层 Reuse · 本地更新，G 与 ID 同用第 3 层`,
        output: `H_{4,${t}}^{\\mathrm{out}}`,
        body: (
          <Frame
            notes={[
              `第 4 层用自己的输入新算 u₄,${t} 和主 Query。自己的窗口也淘汰 token ${step.evicted}，但 U₄ 与 U₃ 数值通常不同。`,
              "该配置的第 4 层不创建全局 Compressor 和 Indexer，也没有对应独立参数；直接读取源层 G 和本 token 的选行结果。",
              `I₄,${t} := I₃,${t} 表示同一步的跨层复用；I₃,${previous} 属于上一步，当前步另算。不生成 G₄，不复制一套 G₃。`,
              "本层主 Attention、输出投影、mHC 和 FFN 照常计算。缓存可以驻留显存或按系统设计卸载；图示逻辑对象，不假定常驻 CPU。",
            ]}
          >
            <Local layer={4} step={step} />
            <div
              className="cache-shared"
              data-selected-ids={step.ids.join(",")}
            >
              <strong>跨层直接读 · 同一个 G，同一步的行号</strong>
              <div className="cache-inline">
                <Data>
                  <M tex={`G_3^{\\le${t}}\\in\\mathbb R^{${m}\\times512}`} />
                </Data>
                <Data tone="amber">
                  <M tex={`I_{4,${t}}:=I_{3,${t}}=${idsTex(step)}`} />
                  <small>同一份 512 个 ID · 原行号与顺序不变</small>
                </Data>
              </div>
              <p>
                第 4 层跳过全局压缩和 Indexer，直接读以上 ID 对应的 G 行。它的主
                Query 仍重新给这 512 行及本层窗口打 Attention 分数；本层
                Attention 权重另算。
              </p>
            </div>
            <ReadAttention layer={4} step={step} />
          </Frame>
        ),
      },
    );
    links.push(
      {
        source: t === 1201 ? "history1200" : "local1201",
        target: `local${t}`,
        tex: `U_3^{\\mathrm{SWA},\\le${previous}}\\quad\\text{历史}`,
      },
      {
        source: t === 1201 ? "history1200" : "global1201",
        target: `global${t}`,
        tex:
          t === 1201
            ? "G_3^{\\le1200},\\ K_3^{I\\prime,\\le1200}"
            : "G_3^{\\le1201},\\ K_3^{I\\prime,\\le1201},\\ \\mathbf v^c_{3,1201},\\ \\mathbf a^{\\mathrm{gate}}_{3,1201}",
      },
      {
        source: `local${t}`,
        target: `global${t}`,
        tex: `\\mathbf x_{3,${t}},\\ \\mathbf q^r_{3,${t}}\\quad\\text{输入代理}`,
      },
      {
        source: `local${t}`,
        target: `attend${t}`,
        tex: `U_3^{\\mathrm{SWA},\\le${t}},\\ \\mathbf q'_{3,h,${t}}`,
      },
      {
        source: `global${t}`,
        target: `attend${t}`,
        tex: `G_3^{\\le${t}},\\ I_{3,${t}}`,
      },
      {
        source: `attend${t}`,
        target: `reuse${t}`,
        tex: `H_{4,${t}}^{\\mathrm{in}}`,
      },
      {
        source: `global${t}`,
        target: `reuse${t}`,
        tex: `G_3^{\\le${t}},\\ I_{3,${t}}\\quad\\text{直接读}`,
      },
      {
        source: t === 1201 ? "history1200" : "reuse1201",
        target: `reuse${t}`,
        tex: `U_4^{\\mathrm{SWA},\\le${previous}}\\quad\\text{历史}`,
      },
    );
  }
  return {
    exportName: "V41-token-1201-1202-layer-3-4-decode",
    introduction:
      "Decode 连续两步：t=1201 与 t=1202，每步对照第 3 层 Full → 第 4 层 Reuse。蓝色为本层 U，绿色为全局 G，青色为索引 Key，琥珀色标记权重、ID 与被选行。上标 ≤t 仅标记缓存时刻。选择左侧步骤可定位；各框右侧同步旁注。",
    stages: stages.map((stage, layoutLevel) => ({
      ...stage,
      layoutLevel,
      width: 1500,
    })),
    references,
    links,
  };
}
