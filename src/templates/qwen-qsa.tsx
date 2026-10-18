import type { Recipe, Stage, RecipeLink, Phase } from "./recipes";
import {
  MathFormula as M,
  type DiagramTone,
} from "../components/diagram-primitives";
import { Down } from "./structure-blocks";
import {
  Row,
  Matrix,
  Flow,
  Columns,
  Project,
  Operation,
  Rms,
  Sum,
  Scalar,
  HalfRoPE,
} from "./architecture-blocks";
import { ObjectConnections } from "../components/ObjectConnections";
import { exponentialTex } from "../components/exponential-notation";
import { layerArchitecture } from "../data/architecture-profiles";
import { QWEN_IMPLEMENTATION } from "./qwen-gdn";
import "./architecture-blocks.css";
import { HeadBranches } from "./head-branches";

const reps = (n: number | string) =>
  Number(n) <= 4
    ? Array.from({ length: Number(n) }, (_, i) => String(i + 1))
    : ["1", "2", "…", String(n)];

/** 文本、无 padding 的连续因果位置；位置编号为 token 行号减一。 */
export function qwenQsaRecipe(phase: Phase, layer: number): Recipe {
  if (layerArchitecture("qwen38", layer).attention !== "qsa")
    throw new Error(`第 ${layer} 层使用 GDN，不能套用 QSA 缓存`);
  const l = String(layer),
    x = `x^A_{${l},t}`;
  const qi0 = `\\widehat Q^I_{${l},t}`,
    qi = `Q^I_{${l},t}`,
    ki0 = `\\widehat k^I_{${l},t}`;
  const raw = `\\widehat K^I_{${l},t}`,
    blocks = `K^B_{${l},t}`,
    scores = `s^I_{${l},t}`,
    ids = `i_{${l},t}`;
  const Q0 = `\\widehat Q_{${l},t}`,
    K0 = `\\widehat K_{${l},t}`,
    Q = `Q_{${l},t}`,
    Kt = `K_{${l},t}`,
    Vt = `V_{${l},t}`,
    Z = `Z_{${l},t}`;
  const K = `K^{cache}_{${l},g,t}`,
    V = `V^{cache}_{${l},g,t}`,
    Kr = `K^{read}_{${l},g,t}`,
    Vr = `V^{read}_{${l},g,t}`;
  const A = `a_{${l},h,t}`,
    O = `o_{${l},h,t}`;
  const stages: Stage[] = [],
    links: RecipeLink[] = [];
  const add = (
    id: string,
    title: string,
    body: Stage["body"],
    output: string,
    width = 1700,
  ) => stages.push({ id, title, body, output, width, inlinePorts: true });
  const edge = (
    source: string,
    target: string,
    tex: string,
    sides: Pick<RecipeLink, "sourceSide" | "targetSide"> = {},
  ) => links.push({ source, target, tex, ...sides });
  const heads = (
    name: string,
    n: number,
    d: number,
    tone: DiagramTone,
    direction?: "in" | "out",
    rowTrace?: (row: string) => string | undefined,
    element?: (row: string, column: string) => string,
  ) => (
    <Matrix
      name={name}
      shape={`${n}\\times${d}`}
      rows={reps(n)}
      columns={reps(d)}
      tone={tone}
      direction={direction}
      rowTrace={rowTrace}
      element={element ?? ((h, j) => `(${name})_{${h},${j}}`)}
    />
  );
  const tokenRows = (
    name: string,
    stem: string,
    d: number,
    tone: DiagramTone,
    direction?: "in" | "out",
    selected = false,
  ) => (
    <Matrix
      name={name}
      shape={`t\\times${d}`}
      rows={["1", "2", "…", "t-1", "t"]}
      columns={reps(d)}
      tone={tone}
      direction={direction}
      selected={selected ? "t" : undefined}
      rowTrace={
        selected ? (r) => (r === "t" ? "new-row" : undefined) : undefined
      }
      element={(j, c) => `${stem}_{${l},${j},${c}}`}
    />
  );
  const readRows = (
    name: string,
    stem: string,
    tone: DiagramTone,
    direction?: "in" | "out",
  ) => (
    <Matrix
      name={name}
      shape={"L_t\\times256"}
      rows={["j_1", "j_2", "…", "j_{L_t}"]}
      columns={reps(256)}
      tone={tone}
      direction={direction}
      element={(j, c) => `${stem}_{${l},g,${j},${c}}`}
    />
  );
  add(
    "input",
    `Layer ${l} · QSA 输入：主注意力与索引器并行`,
    <>
      <Row
        name={x}
        size={2560}
        direction="out"
        tone="blue"
        title="本层 Attention 门控残差的读取结果"
      />
      <p className="architecture-note">
        {phase === "prefill"
          ? "Prefill：每个查询 t 独立应用因果选区。"
          : "Decode：当前 t 行追加到本层各自的缓存。"}{" "}
        本图使用无 padding 的连续文本位置；多模态位置另行展开。
      </p>
      <p className="architecture-note">
        各 RMSNorm 的缩放记为 <M tex={"\\gamma=1+w"} />
        ；w 为官方零初始化参数，均方和缩放使用 FP32。
      </p>
    </>,
    x,
    1200,
  );
  add(
    "index-project",
    "索引器投影 · 4 个 Query Head + 1 个原始 Key",
    <>
      <Project
        input={x}
        weight={`W^{I,qk}_{${l}}`}
        output={`c^I_{${l},t}`}
        from={2560}
        to={640}
        inputPort
        tone="teal"
      />
      <Down label="沿特征轴拆成 512 + 128" />
      <Columns>
        {[
          heads(qi0, 4, 128, "teal", "out"),
          <Row key="key" name={ki0} size={128} tone="plum" direction="out" />,
        ]}
      </Columns>
    </>,
    `${qi0},${ki0}`,
  );
  edge("input", "index-project", x);
  add(
    "index-query",
    "索引 Query · 每头 RMSNorm，再旋转前 64 维",
    <>
      {heads(qi0, 4, 128, "teal", "in")}
      <Down label="各头独立归一化；固定 h = 1…4 展开同一计算" />
      <Rms
        input={`\\widehat q^I_{${l},h,t}`}
        output={`n^{I,q}_{${l},h,t}`}
        size={128}
        gamma={`\\gamma^{I,q}_{${l}}`}
        inputTone="teal"
        outputTone="teal"
        eps={1e-6}
      />
      <HalfRoPE
        input={`n^{I,q}_{${l},h,t}`}
        inputTone="teal"
        outputTone="teal"
        output={`q^I_{${l},h,t}`}
        size={128}
        rotary={64}
        theta={10000000}
      />
      {heads(qi, 4, 128, "teal", "out")}
    </>,
    qi,
    2100,
  );
  edge("index-project", "index-query", qi0);
  add(
    "index-cache",
    "索引器原始 Key 缓存 · 先追加，尚未做块均值",
    <>
      <ObjectConnections
        links={[{ from: "current-key", to: "new-row", direction: "right" }]}
      >
        <div className="architecture-cache-transfer">
          <Row
            name={ki0}
            size={128}
            tone="plum"
            direction="in"
            trace="current-key"
          />
          {tokenRows(raw, "\\widehat k^I", 128, "plum", "out", true)}
        </div>
      </ObjectConnections>
      <p className="architecture-note">
        历史原始 Key 保留；均值、RMSNorm 和块起点 RoPE 在索引打分路径中计算。
      </p>
    </>,
    raw,
    1200,
  );
  edge("index-project", "index-cache", ki0);
  add(
    "pool",
    "每 4 个可见原始 Key 成一块 · FP32 求均值",
    <>
      {tokenRows(raw, "\\widehat k^I", 128, "plum", "in")}
      <p className="architecture-note">
        <M tex={"B=\\lfloor t/4\\rfloor,\\quad b=1,\\ldots,B"} /> · 完整块 b
        对应连续四行；尾部不进入均值。
      </p>
      <Sum
        inputs={[3, 2, 1, 0].map((offset) => (
          <Row
            key={offset}
            name={`\\widehat k^I_{${l},4b${offset ? `-${offset}` : ""}}`}
            size={128}
            tone="plum"
          />
        ))}
        result={<Row name={`u^B_{${l},b}`} size={128} tone="lavender" />}
      />
      <div className="architecture-equation">
        <div className="architecture-fraction">
          <Row name={`u^B_{${l},b}`} size={128} tone="lavender" />
          <M tex="4" />
        </div>
        <span className="architecture-operator">=</span>
        <Row name={`p^B_{${l},b}`} size={128} tone="lavender" direction="out" />
      </div>
      <p className="architecture-note">
        均值转回原始 Key 的数据类型，再进入归一化。
      </p>
    </>,
    `p^B_{${l},b}`,
    2100,
  );
  edge("index-cache", "pool", raw);
  add(
    "block-key",
    "块 Key · 均值归一化后，按该块第一行的位置旋转",
    <>
      <Rms
        input={`p^B_{${l},b}`}
        output={`n^B_{${l},b}`}
        size={128}
        gamma={`\\gamma^{I,k}_{${l}}`}
        inputTone="lavender"
        outputTone="lavender"
        eps={1e-6}
        inputPort
      />
      <HalfRoPE
        input={`n^B_{${l},b}`}
        inputTone="lavender"
        outputTone="lavender"
        output={`k^B_{${l},b}`}
        size={128}
        rotary={64}
        theta={10000000}
        position="4b-4"
        positionIndex="b"
      />
      <Down label="每个完整块生成一行，只用于索引器打分" />
      <Matrix
        name={blocks}
        shape={"B\\times128"}
        rows={["1", "2", "…", "B"]}
        columns={reps(128)}
        tone="lavender"
        direction="out"
        element={(b, j) => `k^B_{${l},${b},${j}}`}
      />
    </>,
    blocks,
    2100,
  );
  edge("pool", "block-key", `p^B_{${l},b}`);
  add(
    "index-score",
    "同一块的四个 Query 分数 · ReLU 后求和",
    <>
      <Columns>
        {[
          heads(qi, 4, 128, "teal", "in"),
          <Matrix
            key="blocks"
            name={blocks}
            shape={"B\\times128"}
            rows={reps("B")}
            columns={reps(128)}
            tone="lavender"
            direction="in"
            element={(b, j) => `k^B_{${l},${b},${j}}`}
          />,
        ]}
      </Columns>
      <p className="architecture-note">
        固定块 b；四个索引 Query Head 都读取同一块 Key，没有额外的 Head
        混合权重。
      </p>
      <Sum
        termSelector="[data-score-terminal] .data-box"
        inputs={[1, 2, 3, 4].map((h) => (
          <div key={h}>
            <div className="architecture-equation">
              <Row name={`q^I_{${l},${h},t}`} size={128} tone="teal" />
              <M tex={"\\cdot"} />
              <Row name={`k^B_{${l},b}`} size={128} tone="lavender" />
            </div>
            <Flow>
              {[
                <Operation
                  key="relu"
                  tex={`r^I_{${l},${h},t,b}=\\max(0,q^I_{${l},${h},t}\\cdot k^B_{${l},b})`}
                />,
                <div data-score-terminal key="r">
                  <Scalar tex={`r^I_{${l},${h},t,b}`} tone="ochre" />
                </div>,
              ]}
            </Flow>
          </div>
        ))}
        result={<Scalar tex={`u^I_{${l},t,b}`} tone="ochre" />}
      />
      <div className="architecture-equation">
        <M tex={`u^I_{${l},t,b}/\\sqrt{128}`} />
        <span className="architecture-operator">=</span>
        <Scalar tex={`s^I_{${l},t,b}`} tone="ochre" />
      </div>
      <Row name={scores} size="B" tone="ochre" direction="out" />
    </>,
    scores,
    2500,
  );
  edge("index-query", "index-score", qi);
  edge("block-key", "index-score", blocks);
  add(
    "select",
    "选中完整块 → 每块还原 4 个原 token 行号 → 加入尾部",
    <>
      <div className="architecture-equation">
        <Operation
          tex={"K=\\min(512,B),\\quad L_t=4K+R,\\quad R=t-4B\\in\\{0,1,2,3\\}"}
        />
      </div>
      <p className="architecture-note">
        按块分数取 Top-K；图中 b 按原块位置排列同一选区
      </p>
      <ObjectConnections
        links={["b_1", "b_2", "b_K"].map((b) => ({
          from: `score-${b}`,
          to: `block-${b}`,
        }))}
      >
        <Row
          name={scores}
          size="B"
          direction="in"
          tone="ochre"
          columns={["1", "2", "…", "b_1", "b_2", "…", "b_K", "…", "B"]}
          selectedColumns={["b_1", "b_2", "b_K"]}
          columnTrace={(b) =>
            ["b_1", "b_2", "b_K"].includes(b) ? `score-${b}` : undefined
          }
        />
        <div className="architecture-gate-branches">
          <Columns>
            {["b_1", "b_2", "b_K"].map((b) => (
              <div key={b} className="architecture-cache-branch">
                <div
                  className="architecture-id-anchor"
                  data-trace-object={`block-${b}`}
                >
                  <Scalar tex={b} tone="amber" />
                </div>
                <Down label="展开同一块内四行" />
                <Row
                  name={`i^{(${b})}_{${l},t}`}
                  size={4}
                  columns={reps(4)}
                  tone="amber"
                  element={(j) =>
                    `4${b}${Number(j) === 4 ? "" : `-${4 - Number(j)}`}`
                  }
                />
              </div>
            ))}
          </Columns>
        </div>
      </ObjectConnections>
      <p className="architecture-note">
        中间完整块同构；K = 0 时跳过完整块路径。下面四种尾部情况互斥，只有实际 R
        对应的一种进入结果。
      </p>
      <Columns>
        {[0, 1, 2, 3].map((r) => (
          <div key={r}>
            <p className="architecture-caption">R = {r}</p>
            {r === 0 ? (
              <Operation tex={"\\varnothing"} />
            ) : (
              <Row
                name={`i^{tail}_{${l},t}`}
                size={r}
                tone="sand"
                element={(j) => (Number(j) === r ? "t" : `4B+${j}`)}
              />
            )}
          </div>
        ))}
      </Columns>
      <Down label="完整块的全部行号与尾部行号合成可见集合；保留原 token 位置" />
      <Row
        name={ids}
        size="L_t"
        tone="amber"
        direction="out"
        element={(j) => `j_{${j}}`}
      />
      <p className="architecture-note">
        j₁、j₂、… 表示选中集合中按原位置显示的行号。实现把集合散射为 mask，Top-K
        的分数排名不重排主 K/V。
      </p>
    </>,
    ids,
    1200,
  );
  edge("index-score", "select", scores);
  add(
    "qkv",
    "主注意力 · 三路独立投影",
    <ObjectConnections
      links={[
        { from: "input", to: "q" },
        { from: "input", to: "k" },
        { from: "input", to: "v" },
      ]}
    >
      <Row name={x} size={2560} direction="in" tone="blue" trace="input" />
      <div className="architecture-gate-branches">
        <Columns>
          {[
            <div key="q">
              <Project
                input={x}
                weight={`W^{qz}_{${l}}`}
                inputTrace="q"
                output={`c^{qz}_{${l},t}`}
                from={2560}
                to={12288}
                tone="plum"
                outputPort
              />
            </div>,
            <div key="k">
              <Project
                input={x}
                weight={`W^k_{${l}}`}
                inputTrace="k"
                output={`c^k_{${l},t}`}
                from={2560}
                to={512}
                tone="violet"
              />
              <Down label="2 × 256" />
              {heads(K0, 2, 256, "violet", "out")}
            </div>,
            <div key="v">
              <Project
                input={x}
                weight={`W^v_{${l}}`}
                inputTrace="v"
                output={`c^v_{${l},t}`}
                from={2560}
                to={512}
                tone="coral"
              />
              <Down label="2 × 256；Value 保持原投影" />
              {heads(Vt, 2, 256, "coral", "out")}
            </div>,
          ]}
        </Columns>
      </div>
    </ObjectConnections>,
    `c^{qz}_{${l},t},${K0},${Vt}`,
    2900,
  );
  edge("input", "qkv", x);
  add(
    "qz-split",
    "Query 与输出门 · 每个 Head 内各取 256 维",
    <>
      <Row name={`c^{qz}_{${l},t}`} size={12288} tone="plum" direction="in" />
      <Down label="先重排 24 × 512，每行前 256 维 Q、后 256 维 gate" />
      <ObjectConnections
        links={[
          { from: "combined", to: "q-heads", direction: "right" },
          { from: "combined", to: "z-heads", direction: "right" },
        ]}
      >
        <div className="architecture-cache-transfer">
          <div data-trace-object="combined">
            <Matrix
              name={`C^{qz}_{${l},t}`}
              shape={"24\\times512"}
              rows={reps(24)}
              columns={["1", "256", "257", "…", "512"]}
              tone="plum"
              element={(h, j) => `c^{qz}_{${l},${h},t,${j}}`}
            />
          </div>
          <div>
            <p className="architecture-caption">按每一行拆开，保持 Head 对应</p>
            <div data-trace-object="q-heads">
              {heads(Q0, 24, 256, "plum", "out")}
            </div>
            <div data-trace-object="z-heads">
              {heads(Z, 24, 256, "rose", "out")}
            </div>
          </div>
        </div>
      </ObjectConnections>
    </>,
    `${Q0},${Z}`,
    1000,
  );
  edge("qkv", "qz-split", `c^{qz}_{${l},t}`);
  add(
    "main-rope",
    "主 Q/K · 每头 RMSNorm 与 64 维位置旋转",
    <>
      <div className="rope-kinds">
        {(["Q", "K"] as const).map((kind) => {
          const count = kind === "Q" ? 24 : 2,
            stem = kind.toLowerCase(),
            tone = kind === "Q" ? "blue" : "violet",
            shown = count === 2 ? ["1", "2"] : ["1", "2", "24"];
          return (
            <section key={kind} data-rope-kind={kind}>
              <p className="architecture-caption">
                {kind} · 分 Head 归一化与旋转
              </p>
              <HeadBranches
                sources={heads(
                  kind === "Q" ? Q0 : K0,
                  count,
                  256,
                  kind === "Q" ? "plum" : tone,
                  "in",
                  (h) => `source-${h}`,
                  (h, d) => `\\widehat ${stem}_{${l},${h},t,${d}}`,
                )}
                branches={shown.map((head) => ({
                  head,
                  body: (
                    <ObjectConnections
                      links={[
                        {
                          from: `normalized-source-${head}`,
                          to: `normalized-${head}`,
                          direction: "down",
                        },
                      ]}
                    >
                      <Rms
                        inputTrace={`input-${head}`}
                        input={`\\widehat ${stem}_{${l},${head},t}`}
                        output={`n^${stem}_{${l},${head},t}`}
                        outputTrace={`normalized-source-${head}`}
                        size={256}
                        gamma={`\\gamma^${stem}_{${l}}`}
                        inputTone={kind === "Q" ? "plum" : tone}
                        outputTone={tone}
                        eps={1e-6}
                      />
                      <HalfRoPE
                        input={`n^${stem}_{${l},${head},t}`}
                        output={`${stem}_{${l},${head},t}`}
                        inputTone={tone}
                        outputTone={tone}
                        size={256}
                        rotary={64}
                        theta={10000000}
                        inputTrace={`normalized-${head}`}
                        outputTrace={`output-${head}`}
                      />
                    </ObjectConnections>
                  ),
                }))}
                result={heads(
                  kind === "Q" ? Q : Kt,
                  count,
                  256,
                  tone,
                  "out",
                  (h) => `result-${h}`,
                  (h, d) => `${stem}_{${l},${h},t,${d}}`,
                )}
                links={shown.flatMap((h) => [
                  {
                    from: `source-${h}`,
                    to: `input-${h}`,
                    direction: "right" as const,
                  },
                  {
                    from: `output-${h}`,
                    to: `result-${h}`,
                    direction: "right" as const,
                  },
                ])}
              />
            </section>
          );
        })}
      </div>
    </>,
    `${Q},${Kt}`,
    6500,
  );
  edge("qz-split", "main-rope", Q0);
  edge("qkv", "main-rope", K0);
  add(
    "cache",
    "本层主 K/V 追加当前行 · 每个 KV Head 独立保存",
    <>
      <p className="architecture-note">
        <M tex={"g\\in\\{1,2\\}"} /> · 以下固定同一个 g；两头同构，Key 与 Value
        分库存放。
      </p>
      <Columns>
        {(["K", "V"] as const).map((kind) => (
          <div key={kind} className="architecture-cache-branch">
            {heads(
              kind === "K" ? Kt : Vt,
              2,
              256,
              kind === "K" ? "violet" : "coral",
              "in",
            )}
            <Down label="取第 g 头的当前行" />
            <ObjectConnections
              links={[{ from: "new", to: "row-t", direction: "right" }]}
            >
              <div className="architecture-cache-transfer">
                <Row
                  name={`${kind.toLowerCase()}_{${l},g,t}`}
                  size={256}
                  tone={kind === "K" ? "violet" : "coral"}
                  trace="new"
                />
                <Matrix
                  name={kind === "K" ? K : V}
                  shape={"t\\times256"}
                  rows={["1", "2", "…", "t-1", "t"]}
                  columns={reps(256)}
                  selected="t"
                  tone={kind === "K" ? "violet" : "coral"}
                  direction="out"
                  rowTrace={(j) => (j === "t" ? "row-t" : undefined)}
                  element={(j, d) => `${kind.toLowerCase()}_{${l},g,${j},${d}}`}
                />
              </div>
            </ObjectConnections>
          </div>
        ))}
      </Columns>
    </>,
    `${K},${V}`,
    2300,
  );
  edge("main-rope", "cache", Kt);
  edge("qkv", "cache", Vt);
  add(
    "read",
    "同一组原始行号同时作用于 Key 和 Value",
    <>
      <Columns>
        {[
          <Matrix
            key="k"
            name={K}
            shape={"t\\times256"}
            rows={reps("t")}
            columns={reps(256)}
            tone="violet"
            direction="in"
            element={(j, d) => `k_{${l},g,${j},${d}}`}
          />,
          <Row
            key="ids"
            name={ids}
            size="L_t"
            tone="amber"
            direction="in"
            element={(j) => `j_${j.length > 1 ? `{${j}}` : j}`}
          />,
          <Matrix
            key="v"
            name={V}
            shape={"t\\times256"}
            rows={reps("t")}
            columns={reps(256)}
            tone="coral"
            direction="in"
            element={(j, d) => `v_{${l},g,${j},${d}}`}
          />,
        ]}
      </Columns>
      <Down label="同号选择；两个缓存都读取原 token 行，没有 4 行均值" />
      <Columns>
        {["j_1", "j_2", "j_{L_t}"].map((j) => (
          <ObjectConnections
            key={j}
            links={[
              { from: "id", to: "key" },
              { from: "id", to: "value" },
            ]}
          >
            <div className="architecture-id-anchor" data-trace-object="id">
              <Scalar tex={j} tone="amber" />
            </div>
            <div className="architecture-gate-branches">
              <Columns>
                {[
                  <Row
                    key="k"
                    name={`k_{${l},g,${j}}`}
                    size={256}
                    element={(d) => `k_{${l},g,${j},${d}}`}
                    tone="violet"
                    trace="key"
                  />,
                  <Row
                    key="v"
                    name={`v_{${l},g,${j}}`}
                    size={256}
                    element={(d) => `v_{${l},g,${j},${d}}`}
                    tone="coral"
                    trace="value"
                  />,
                ]}
              </Columns>
            </div>
          </ObjectConnections>
        ))}
      </Columns>
      <Down label="按同一原位置顺序展示可见行，列数仍为 256" />
      <Columns>
        {[
          readRows(Kr, "k", "violet", "out"),
          readRows(Vr, "v", "coral", "out"),
        ]}
      </Columns>
      <p className="architecture-note">
        这是选区内计算的等价展开。官方实现保留原 t 个位置，将选区外 logits 设为
        −∞；对应注意力权重为 0。
      </p>
    </>,
    `${Kr},${Vr}`,
    1950,
  );
  edge("cache", "read", K);
  edge("cache", "read", V);
  edge("select", "read", ids);
  add(
    "attention",
    "24 个 Query Head · 每 12 个共用同一组 K/V",
    <>
      {heads(Q, 24, 256, "blue", "in")}
      <p className="architecture-note">
        <M tex={"g(h)=1+\\lfloor(h-1)/12\\rfloor,\\quad h=1,\\ldots,24"} /> ·
        Q₁…Q₁₂ 读 KV₁，Q₁₃…Q₂₄ 读 KV₂。
      </p>
      <div className="architecture-equation">
        <Row name={`q_{${l},h,t}`} size={256} tone="blue" />
        <span className="architecture-operator">×</span>
        {readRows(Kr, "k", "violet", "in")}
        <M tex={"{}^{\\mathsf T}/\\sqrt{256}"} />
        <span className="architecture-operator">=</span>
        <Row name={`s_{${l},h,t}`} size="L_t" tone="plum" />
      </div>
      <Down label="对选中行归一化；所有 Head 使用本 token 的同一组选区" />
      <div className="architecture-probability-grid">
        <Sum
          termSelector="[data-exponent]"
          ellipsis
          inputs={["1", "2", "L_t"].map((j) => (
            <div key={j} data-exponent>
              <M tex={exponentialTex(`s_{${l},h,t,${j}}`)} />
            </div>
          ))}
          result={<Scalar tex={`D_{${l},h,t}`} tone="gold" />}
        />
        <div>
          <Columns>
            {["1", "2", "L_t"].map((j) => (
              <div key={j} className="architecture-equation">
                <M
                  tex={`\\frac{${exponentialTex(`s_{${l},h,t,${j}}`)}}{D_{${l},h,t}}`}
                />
                <span className="architecture-operator">=</span>
                <Scalar tex={`a_{${l},h,t,${j}}`} tone="orange" />
              </div>
            ))}
          </Columns>
          <Row name={A} size="L_t" tone="orange" direction="out" />
        </div>
      </div>
    </>,
    A,
    1300,
  );
  edge("main-rope", "attention", Q, {
    sourceSide: "bottom",
    targetSide: "left",
  });
  edge("read", "attention", Kr);
  add(
    "weighted",
    "第 r 个权重乘原位置 jᵣ 的 Value 行，再沿可见行求和",
    <>
      <Columns>
        {[
          <Row key="a" name={A} size="L_t" tone="orange" direction="in" />,
          readRows(Vr, "v", "coral", "in"),
        ]}
      </Columns>
      <Sum
        ellipsis
        termSelector="[data-weighted-terminal] [data-expanded-tensor]"
        inputs={["1", "2", "L_t"].map((r) => (
          <div key={r}>
            <div className="architecture-equation">
              <Scalar tex={`a_{${l},h,t,${r}}`} tone="orange" />
              <span className="architecture-operator">×</span>
              <Row
                name={`v_{${l},g,j_{${r}}}`}
                size={256}
                element={(d) => `v_{${l},g,j_{${r}},${d}}`}
                tone="coral"
              />
            </div>
            <Down />
            <div data-weighted-terminal>
              <Row
                name={`p_{${l},h,t,${r}}`}
                size={256}
                tone="cyan"
                element={(d) => `a_{${l},h,t,${r}}v_{${l},g,j_{${r}},${d}}`}
              />
            </div>
          </div>
        ))}
        result={<Row name={O} size={256} tone="coral" direction="out" />}
      />
    </>,
    O,
    1500,
  );
  edge("attention", "weighted", A);
  edge("read", "weighted", Vr);
  add(
    "output",
    "每头输出门 · sigmoid 后逐元素相乘，再拼接投影",
    <>
      <Columns>
        {[
          <Row key="o" name={O} size={256} tone="coral" direction="in" />,
          heads(Z, 24, 256, "rose", "in"),
        ]}
      </Columns>
      <Down label="固定同一个 h；输出与门的 256 个元素一一对应" />
      <div className="architecture-equation">
        <Row name={O} size={256} tone="coral" />
        <span className="architecture-operator">⊙</span>
        <Row
          name={`\\sigma(z_{${l},h,t})`}
          size={256}
          element={(d) => `\\sigma(z_{${l},h,t,${d}})`}
          tone="rose"
        />
        <span className="architecture-operator">=</span>
        <Row name={`y_{${l},h,t}`} size={256} tone="coral" />
      </div>
      <Down label="全部 24 个 Head 沿特征轴拼接，24 × 256 = 6144" />
      {heads(`Y_{${l},t}`, 24, 256, "coral")}
      <Project
        input={`y^{flat}_{${l},t}`}
        weight={`W^o_{${l}}`}
        output={`o^A_{${l},t}`}
        from={6144}
        to={2560}
        outputPort
        tone="coral"
      />
    </>,
    `o^A_{${l},t}`,
    1700,
  );
  edge("weighted", "output", O);
  edge("qz-split", "output", Z);
  return {
    introduction:
      "Qwen3.8-Flash-Next · QSA 机制展开。索引块仅用于选区；主注意力读取原始 K/V。完整逐层图仍在制作。",
    exportName: `Qwen3.8-Flash-Next-L${layer}-QSA-${phase}`,
    stages,
    links,
    references: [
      { title: "固定版本官方 QSA 实现", url: QWEN_IMPLEMENTATION },
      {
        title: "官方模型配置",
        url: "https://huggingface.co/Qwen/Qwen3.8-Flash-Next/blob/de4b8e4d43b917e7706784d8bb445c9af86a3540/config.json",
      },
    ],
  };
}
