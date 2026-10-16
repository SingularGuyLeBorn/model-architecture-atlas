import type { ReactNode } from "react";
import type { Recipe, Stage } from "../templates/recipes";
import {
  MathFormula as M,
  ParameterColumn,
  type DiagramTone,
  tonePalette,
} from "./diagram-primitives";
import { Data, Down, Sequence } from "../templates/structure-blocks";
import { CacheModeLedger } from "./CacheSemantics";

// 固定官方 V4.1 配置：界面层号从 1 开始；3 是 Full，4 是 Reuse。
export const CACHE_101 = {
  token: 101,
  previous: 100,
  window: 128,
  ratio: 2,
  globalRows: 50,
  localRows: 101,
  readRows: 151,
} as const;

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
function localRows(layer: number, current = false) {
  return [1, 2, "dots", 100, ...(current ? [101] : [])].map((i) => ({
    tex: i === "dots" ? "dots" : `\\mathbf u_{${layer},${i}}`,
    label: `token ${i}${i === 101 ? " · 新增" : ""}`,
    tone: "blue" as const,
  }));
}
const globalRows = [
  { tex: "\\mathbf g_{3,1}", label: "行 1 · token 1、2" },
  { tex: "\\mathbf g_{3,2}", label: "行 2 · token 3、4" },
  { tex: "dots", label: "" },
  { tex: "\\mathbf g_{3,50}", label: "行 50 · token 99、100" },
];
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
  layer,
  branch,
  result,
  resultTone = "green",
}: {
  layer: number;
  branch: string;
  result: string;
  resultTone?: DiagramTone;
}) {
  return (
    <div className="cache-inline">
      <Data tone="blue">
        <M tex={`\\mathbf x_{${layer},101}`} />
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
function Local({ layer }: { layer: number }) {
  return (
    <>
      <h4>新算 · 本层 KV 与 Query</h4>
      <p>
        <M tex={`\\mathbf x_{${layer},101}`} /> 来自本层四路残差经 mHC
        汇合、Attention 输入 RMSNorm；并行送两条支路。
      </p>
      <Project
        layer={layer}
        branch="KV,\mathrm{SWA}"
        result={`\\widehat{\\mathbf u}_{${layer},101}`}
      />
      <Down label="RMSNorm → 位置 101 的 RoPE → FP8 存储" />
      <Data tone="blue">
        <M tex={`\\mathbf u_{${layer},101}\\in\\mathbb R^{1\\times512}`} />
      </Data>
      <div className="cache-inline">
        <span className="cache-action">追加本层一行</span>
        <M tex="\longrightarrow" />
        <Rows
          name={`U_{${layer}}^{\\mathrm{SWA},\\le101}`}
          shape="101\times512"
          rows={localRows(layer, true)}
          fresh={`\\mathbf u_{${layer},101}`}
        />
      </div>
      <p>
        旧行 1–100 直接保留，不再投影；容量
        128，此刻尚未覆盖旧行。这里按时间顺序展开逻辑内容，不代表物理槽位。
      </p>
      <div className="cache-query">
        <strong>另一支路 · 当前 Query 也新算</strong>
        <M
          tex={`\\mathbf x_{${layer},101}W_{${layer}}^{Q\\downarrow}\\ \\xrightarrow{\\mathrm{RMSNorm}}\\ \\mathbf q^r_{${layer},101}\\ \\xrightarrow{\\times W_{${layer}}^{Q\\uparrow}}\\ \\widetilde{\\mathbf q}_{${layer},101}`}
        />
        <p>5120 → 1280 → 64 × 512；分成 64 个 Head，各自做 RoPE。</p>
        <div className="cache-inline">
          {[1, 2, "dots", 64].map((h) =>
            h === "dots" ? (
              <span key={h}>⋯</span>
            ) : (
              <Data key={h} tone="cyan">
                <M tex={`\\mathbf q'_{${layer},${h},101}`} />
              </Data>
            ),
          )}
        </div>
      </div>
    </>
  );
}
function ReadAttention({ layer }: { layer: number }) {
  return (
    <>
      <h4>读取并拼接 · 本层窗口在上，共享 G 在下</h4>
      <div className="cache-inline">
        <Rows
          name={`KV_{${layer},101}`}
          shape="151\times512"
          tone="green"
          rows={[
            ...localRows(layer, true),
            { tex: "separator", label: "" },
            ...globalRows.map((r, i) => ({
              ...r,
              label:
                r.tex === "dots"
                  ? ""
                  : `结果行 ${[102, 103, 0, 151][i]} · 原 G 行 ${[1, 2, 0, 50][i]}`,
            })),
          ]}
        />
        <div className="cache-read-labels">
          <p>
            上段 101 行：
            <M tex={`U_{${layer}}^{\\mathrm{SWA},\\le101}`} />
          </p>
          <p>
            下段 50 行：同一份 <M tex="G_3" />
          </p>
          <p>拼接不相加、不改值；G 行 i 位于结果行 101+i。</p>
          <M tex={`K_{${layer},101}=V_{${layer},101}=KV_{${layer},101}`} />
        </div>
      </div>
      <Down label="每个 Head 新算打分与加权；不复用上一层的注意力结果" />
      <div className="cache-query">
        <M
          tex={`\\mathbf z_{${layer},h,101}=\\frac{\\mathbf q'_{${layer},h,101}K_{${layer},101}^{\\mathsf T}}{\\sqrt{d_k}},\\quad d_k=512`}
        />
        <M
          tex={`a_{${layer},h,101,j}=\\frac{\\exp(z_{${layer},h,101,j})}{\\sum_{i=1}^{151}\\exp(z_{${layer},h,101,i})+\\exp(b_{${layer},h})}`}
        />
        <M
          tex={`\\mathbf o_{${layer},h,101}=\\mathbf a_{${layer},h,101}V_{${layer},101}`}
        />
        <p>
          h=1,…,64；j=1,…,151；b 是本层该 Head 的独立 sink 参数。64
          路输出拼接、分组低秩投影得到本层 Attention 输出。
        </p>
      </div>
    </>
  );
}

export function cacheDecodeRecipe(references: Recipe["references"]): Recipe {
  const stages: Stage[] = [
    {
      id: "history101",
      title: "01 · 进入第 3 层前：缓存已有什么",
      output: "\\mathrm{historical\ state}",
      body: (
        <Frame
          notes={[
            "固定场景：前 100 个 token 已处理完成，缓存正常保留，当前首次处理新增位置 t=101。",
            "蓝色 U 是每层自己的本地 KV；绿色 G 是第 3 层生成、指定后续层共享的全局分支。全局不表示所有层或用户共用。",
            "缓存保留供 Attention 读取的表示。压缩会合并信息；Q、历史注意力权重、FFN 中间结果不在这两类 KV 缓存里。",
          ]}
        >
          <CacheModeLedger layer={3} />
          <div className="cache-inline cache-top">
            <Rows
              name="U_3^{\mathrm{SWA},\le100}"
              shape="100\times512"
              rows={localRows(3)}
            />
            <Rows
              name="U_4^{\mathrm{SWA},\le100}"
              shape="100\times512"
              rows={localRows(4)}
            />
            <Rows
              name="G_3"
              shape="50\times512"
              rows={globalRows}
              tone="green"
            />
          </div>
          <p>
            U₃ 与 U₄ 的行都对应历史
            token，但来自不同层的输入和独立参数，数值通常不同。
          </p>
          <p>
            G₃：第 3 层把每对候选 KV 逐列加权压成一行；前 100 个 token 对应 50
            个已完成的组。
          </p>
          <Data tone="cyan">
            <M tex="K_3^{I\prime}\in\mathbb R^{50\times128}" />
            <p>
              已有索引 Key 缓存：与 G₃ 一一对应的 50 行。各组完成时，由 RoPE
              前的压缩潜向量经索引投影、归一化和位置旋转生成；供 Indexer
              匹配；Attention 的 K 来自右上方的 G₃。
            </p>
          </Data>
          <p>
            当前 token 从前两层得到{" "}
            <M tex="H_{3,101}^{\mathrm{in}}\in\mathbb R^{1\times4\times5120}" />
            ； 第 3 层 mHC 汇合与输入 RMSNorm 得到{" "}
            <M tex="\mathbf x_{3,101}\in\mathbb R^{1\times5120}" />
            ，送往本地与全局两条投影支路。
          </p>
        </Frame>
      ),
    },
    {
      id: "local101",
      title: "02 · 第 3 层 Full：新算并追加本地 KV",
      output: "U_3^{\\mathrm{SWA},\\le101}",
      body: (
        <Frame
          notes={[
            "时间方向复用：处理 token 101 时，读取 token 1–100 留下的 u₃，不重新运行它们的投影。",
            "当前 u₃,₁₀₁ 是第一次生成。Q 也依赖当前输入，需要为 token 101 新算；历史 token 的 KV 则直接读取。",
            "这里同一个 512 维潜向量兼作 K 和 V，没有两份独立的本地 Wᴷ、Wⱽ。矩阵乘整份 W 得到向量，乘单列只能得到标量。",
          ]}
        >
          <Local layer={3} />
        </Frame>
      ),
    },
    {
      id: "global101",
      title: "03 · 第 3 层 Full：暂存候选，读取 50 行 G",
      output: "G_3",
      body: (
        <Frame
          notes={[
            "Full 不跨层复用其他层的 G，但保留并读取自己的历史 G。前 100 个 token 的 G 原样保留，只有 token 101 的候选内容和分数是新算的。",
            "每两个 token 完成一组。第 101 个 token 只填入第 51 组的第一个槽位；此刻 G₃ 仍是 50 行，索引 Key 缓存也不追加新行。",
            "vᶜ 是待压缩的候选内容，aᵍᵃᵗᵉ 是原始分数。组满后，两行分数逐列 Softmax 得到权重 α，再对同列候选内容加权。",
            "到 token 102 时才合成第 51 行，归一化后分支生成索引 Key，主分支做 RoPE、量化并追加到 G₃。旧 50 行不用重算。",
            "本例仅有 50 个可见全局行，小于 Top-512 上限，因此全部选中；实际选中数量为 min(512, 50)=50。",
          ]}
        >
          <h4>与本地 KV 并行 · 另一组独立参数</h4>
          <div className="cache-projections">
            <Project layer={3} branch="KV,c" result="\mathbf v^c_{3,101}" />
            <Project
              layer={3}
              branch="\mathrm{gate}"
              result="\mathbf a^{\mathrm{gate}}_{3,101}"
              resultTone="violet"
            />
          </div>
          <Down label="写入压缩器暂存；组满后才写入 G" />
          <div className="cache-pending">
            <strong>第 51 组 · 等待 token 102</strong>
            <div className="cache-inline">
              <Data>
                <M tex="\mathbf v^c_{3,101}" />
                候选内容
              </Data>
              <Data tone="violet">
                <M tex="\mathbf a^{\mathrm{gate}}_{3,101}" />
                原始分数
              </Data>
              <span>第二槽位：未到达</span>
            </div>
          </div>
          <div className="cache-inline">
            <span className="cache-action">直接读历史</span>
            <Rows
              name="G_3"
              shape="50\times512"
              tone="green"
              rows={globalRows}
            />
            <div>
              <M tex="M=\left\lfloor\frac{101}{2}\right\rfloor=50" />
              <p>此步不追加全局行。</p>
            </div>
          </div>
          <h4>新算 Indexer 分数，产生当前行号</h4>
          <Sequence>
            {[
              <Data key="q" tone="cyan">
                <M tex="\mathbf q^r_{3,101},\ \mathbf x_{3,101}" />
              </Data>,
              <Data key="s">
                <M tex="\mathbf s_{3,101}\in\mathbb R^{1\times50}" />
                读取已有索引 Key，32 个索引 Head 打分并加权
              </Data>,
              <Data key="i" tone="amber">
                <M tex="I_{3,101}=(1,2,\ldots,50)" />
                Top-512 上限；本例全选
              </Data>,
            ]}
          </Sequence>
          <p>第 102 个 token 到达后才会发生：</p>
          <M tex="\widehat{\mathbf g}_{3,51}=\operatorname{RMSNorm}\!\left(\boldsymbol\alpha_{3,51,1}\odot\mathbf v^c_{3,101}+\boldsymbol\alpha_{3,51,2}\odot\mathbf v^c_{3,102}\right)" />
        </Frame>
      ),
    },
    {
      id: "attend101",
      title: "04 · 第 3 层 Attention：读缓存，但新算输出",
      output: "H_{3,101}^{\\mathrm{out}}",
      body: (
        <Frame
          notes={[
            "151 行 = 101 行本层窗口 + 50 行全局表示。两种表示覆盖的历史可以重叠，不代表 151 个不同 token。",
            "K、V 内容复用不等于注意力分数复用。当前 Q 给读出的行重新打分，得到当前 token 的注意力输出。",
            "Attention 输出还要经过第 3 层 mHC 回写、FFN 与再次回写，才得到 H₃ᵒᵘᵗ；第 4 层再汇合、归一化成 x₄,₁₀₁。",
          ]}
        >
          <ReadAttention layer={3} />
          <Down label="继续执行第 3 层，不跳过 FFN" />
          <Sequence>
            {[
              <Data key="a">Attention 输出 → mHC 回写</Data>,
              <Data key="f">FFN 汇合、归一化、MoE → mHC 回写</Data>,
              <Data key="h" tone="blue">
                <M tex="H_{3,101}^{\mathrm{out}}=H_{4,101}^{\mathrm{in}}" />
                <M tex="1\times4\times5120" />
              </Data>,
            ]}
          </Sequence>
        </Frame>
      ),
    },
    {
      id: "reuse101",
      title: "05 · 第 4 层 Reuse：本地新算，全局直接读",
      output: "H_{4,101}^{\\mathrm{out}}",
      body: (
        <Frame
          notes={[
            "跨层复用：第 4 层读取第 3 层持有的同一份 G₃，不生成 G₄，也不把第 3 层的本地 U₃ 当作 U₄。",
            "Reuse 沿用第 3 层为当前 token 101 算出的 I₃,₁₀₁。第 4 层跳过全局 Compressor 与 Indexer，直接读取其结果。",
            "第 4 层依然计算自己的 Query、本地 KV、注意力权重、输出和 FFN。复用没有把整层跳过去。",
            "如果缓存曾被释放，恢复时才需要重新计算缺失状态。这个例子假设缓存完整，不包含恢复流程；实际存储可以在显存或系统内存，图表示逻辑对象。",
          ]}
        >
          <p>
            <M tex="H_{4,101}^{\mathrm{in}}" /> → 第 4 层 mHC 汇合、输入归一化 →{" "}
            <M tex="\mathbf x_{4,101}" />
          </p>
          <Local layer={4} />
          <div className="cache-shared">
            <strong>直接读取 · 不复制生成另一份 G</strong>
            <div className="cache-inline">
              <Data>
                <M tex="G_3\in\mathbb R^{50\times512}" />第 3 层持有
              </Data>
              <Data tone="amber">
                <M tex="I_{4,101}:=I_{3,101}=(1,2,\ldots,50)" />
              </Data>
            </div>
          </div>
          <ReadAttention layer={4} />
          <p>
            本层 Attention 后继续 mHC 回写、FFN 和最终回写，产生{" "}
            <M tex="H_{4,101}^{\mathrm{out}}" />。
          </p>
        </Frame>
      ),
    },
  ];
  return {
    exportName: "V41-token-101-layer-3-4-decode",
    introduction:
      "固定 Decode 示例：t=101，前 100 个 token 已缓存。第 3 层 Full → 第 4 层 Reuse；区分时间复用与跨层复用。左侧步骤可定位，框内右侧是同步旁注。",
    stages,
    references,
    links: [
      {
        source: "history101",
        target: "local101",
        tex: "U_3^{\\mathrm{SWA},\\le100},\\ \\mathbf x_{3,101}",
      },
      {
        source: "history101",
        target: "global101",
        tex: "G_3,\\ K_3^{I\\prime},\\ \\mathbf x_{3,101}",
      },
      {
        source: "local101",
        target: "global101",
        tex: "\\mathbf q^r_{3,101}\\quad\\text{供 Indexer}",
      },
      {
        source: "local101",
        target: "attend101",
        tex: "U_3^{\\mathrm{SWA},\\le101},\\ \\mathbf q'_{3,h,101}",
      },
      { source: "global101", target: "attend101", tex: "G_3,\\ I_{3,101}" },
      {
        source: "attend101",
        target: "reuse101",
        tex: "H_{4,101}^{\\mathrm{in}}",
      },
      {
        source: "global101",
        target: "reuse101",
        tex: "G_3,\\ I_{3,101}\\quad\\mathrm{read\\ only}",
      },
      {
        source: "history101",
        target: "reuse101",
        tex: "U_4^{\\mathrm{SWA},\\le100}",
      },
    ],
  };
}
