import {
  architectureConfigs,
  architectureProfile,
  layerArchitecture,
} from "../data/architecture-profiles";
import type { Recipe, RecipeLink, Stage, Phase } from "./recipes";
import { MathFormula as M } from "../components/diagram-primitives";
import { Tensor, Down } from "./structure-blocks";
import { ObjectConnections } from "../components/ObjectConnections";
import { exponentialTex } from "../components/exponential-notation";
import {
  Row,
  Matrix,
  Flow,
  Columns,
  Project,
  Operation,
  Rms,
  Sum,
  SwiGlu,
  HalfRoPE,
  Scalar,
} from "./architecture-blocks";
import "./architecture-blocks.css";
import { HeadBranches } from "./head-branches";
import { RecipePort } from "./RecipePorts";

const reps = (last: string | number) =>
  Number(last) <= 3
    ? Array.from({ length: Number(last) }, (_, i) => String(i + 1))
    : ["1", "2", "…", String(last)];

export function mimoLayerRecipe(phase: Phase, layer: number): Recipe {
  const p = architectureProfile("mimo25"),
    a = layerArchitecture("mimo25", layer),
    c = architectureConfigs.mimo25;
  const d = p.hidden,
    l = String(layer),
    swa = a.window !== null;
  const h = `h_{${l},t}`,
    x = `x_{${l},t}`,
    y = `y_{${l},t}`,
    z = `z_{${l},t}`,
    f = `f_{${l},t}`;
  const Q0 = `\\widehat Q_{${l},t}`,
    K0 = `\\widehat K_{${l},t}`,
    V0 = `\\widehat V_{${l},t}`;
  const Q = `Q_{${l},t}`,
    Kt = `K_{${l},t}`,
    Vt = `V_{${l},t}`;
  const K = `K^{read}_{${l},g,t}`,
    V = `V^{read}_{${l},g,t}`,
    A = `A_{${l},t}`,
    O = `O_{${l},t}`;
  const start = swa ? "r" : "1",
    length = swa ? "m_t" : "t";
  const stages: Stage[] = [],
    links: RecipeLink[] = [];
  const add = (
    id: string,
    title: string,
    body: Stage["body"],
    output: string,
    width = 1600,
  ) => stages.push({ id, title, body, output, width, inlinePorts: true });
  const edge = (
    source: string,
    target: string,
    tex: string,
    sides: Pick<RecipeLink, "sourceSide" | "targetSide"> = {},
  ) => links.push({ source, target, tex, ...sides });
  const heads = (
    name: string,
    stem: string,
    count: number,
    width: number | string,
    tone: "blue" | "violet" | "coral" | "orange",
    direction?: "in" | "out",
    rowTrace?: (row: string) => string | undefined,
  ) => (
    <Matrix
      name={name}
      shape={`${count}\\times ${width}`}
      rows={reps(count)}
      columns={width === length && swa ? ["r", "r+1", "…", "t"] : reps(width)}
      tone={tone}
      direction={direction}
      rowTrace={rowTrace}
      element={(b, j) => `${stem}_{${l},${b},t,${j}}`}
    />
  );
  const readCache = (
    kind: "K" | "V",
    direction: "in" | "out" | undefined,
    trace = false,
    highlightedRows: string | readonly string[] = "t",
  ) => (
    <Matrix
      name={kind === "K" ? K : V}
      shape={`${length}\\times${kind === "K" ? a.keyDim : a.valueDim}`}
      rows={swa ? ["r", "r+1", "…", "t-1", "t"] : ["1", "2", "…", "t-1", "t"]}
      columns={reps(kind === "K" ? a.keyDim : a.valueDim)}
      selected={highlightedRows}
      tone={kind === "K" ? "violet" : "coral"}
      direction={direction}
      rowTrace={trace ? (row) => `read-${row}` : undefined}
      element={(j, v) => `${kind.toLowerCase()}_{${l},g,${j},${v}}`}
    />
  );

  add(
    "input",
    `Layer ${layer} · 归一化与输入旁路`,
    <ObjectConnections
      links={
        phase === "prefill"
          ? [{ from: "input-row", to: "norm-input", direction: "left-down" }]
          : []
      }
    >
      <p className="architecture-note">
        {phase === "prefill"
          ? "Prefill：N 行同时计算；以下固定当前查询 t 展开。"
          : "Decode：本步计算 t 行；历史 K/V 从本层缓存读取。"}
      </p>
      {phase === "prefill" && (
        <>
          <Matrix
            name={`H_{${l}}`}
            shape={`N\\times${d}`}
            rows={["1", "2", "…", "t", "…", "N"]}
            columns={reps(d)}
            selected="t"
            rowTrace={(row) => (row === "t" ? "input-row" : undefined)}
            tone="blue"
            element={(r, j) => `h_{${l},${r},${j}}`}
          />
          <p className="architecture-caption">第 t 行</p>
        </>
      )}
      <Rms
        input={h}
        output={x}
        size={d}
        gamma={`\\gamma^A_{${l}}`}
        eps={p.eps}
        inputSource
        inputTrace="norm-input"
        outputPort
      />
    </ObjectConnections>,
    x,
  );
  add(
    "qkv",
    "一次 fused QKV 投影 · 按特征轴分三段，再分 Head",
    <>
      <Project
        input={x}
        weight={`W^{QKV}_{${l}}`}
        output={`u^{QKV}_{${l},t}`}
        from={d}
        to={a.queryHeads * a.keyDim + a.kvHeads * (a.keyDim + a.valueDim)}
        inputPort
      />
      <Down label="同一输出的三个连续切片" />
      <p className="architecture-note">
        <M
          tex={`u^{QKV}_{${l},t}=[\\operatorname{vec}(${Q0});\\operatorname{vec}(${K0});\\operatorname{vec}(${V0})]`}
        />
      </p>
      <Columns>
        {[
          <div key="q">
            <p className="architecture-caption">Q · 64 × 192</p>
            {heads(Q0, "\\widehat q", 64, 192, "blue", "out")}
          </div>,
          <div key="k">
            <p className="architecture-caption">K · {a.kvHeads} × 192</p>
            {heads(K0, "\\widehat k", a.kvHeads, 192, "violet", "out")}
          </div>,
          <div key="v">
            <p className="architecture-caption">V · {a.kvHeads} × 128</p>
            {heads(V0, "\\widehat v", a.kvHeads, 128, "coral", "out")}
          </div>,
        ]}
      </Columns>
    </>,
    Q0,
    1900,
  );
  edge("input", "qkv", x);
  add(
    "rope",
    "Q/K · 前 64 维成对旋转，后 128 维直通",
    <>
      <div className="rope-kinds">
        {(["Q", "K"] as const).map((kind) => {
          const count = kind === "Q" ? 64 : a.kvHeads;
          const stem = kind.toLowerCase();
          const tone = kind === "Q" ? "blue" : "violet";
          const shown = ["1", "2", String(count)];
          return (
            <section key={kind} data-rope-kind={kind}>
              <p className="architecture-caption">
                {kind} · 各 Head 分别旋转，写回同号行
              </p>
              <HeadBranches
                sources={heads(
                  kind === "Q" ? Q0 : K0,
                  `\\widehat ${stem}`,
                  count,
                  192,
                  tone,
                  "in",
                  (r) => `source-${r}`,
                )}
                branches={shown.map((head) => ({
                  head,
                  body: (
                    <>
                      <HalfRoPE
                        input={`\\widehat ${stem}_{${l},${head},t}`}
                        output={`${stem}_{${l},${head},t}`}
                        size={192}
                        rotary={64}
                        theta={swa ? c.swa_rope_theta : c.rope_theta}
                        inputTone={tone}
                        outputTone={tone}
                        inputTrace={`input-${head}`}
                        outputTrace={`output-${head}`}
                      />
                    </>
                  ),
                }))}
                result={heads(
                  kind === "Q" ? Q : Kt,
                  stem,
                  count,
                  192,
                  tone,
                  "out",
                  (r) => `result-${r}`,
                )}
                links={shown.flatMap((head) => [
                  {
                    from: `source-${head}`,
                    to: `input-${head}`,
                    direction: "right" as const,
                  },
                  {
                    from: `output-${head}`,
                    to: `result-${head}`,
                    direction: "right" as const,
                  },
                ])}
              />
            </section>
          );
        })}
      </div>
    </>,
    Q,
    6500,
  );
  edge("qkv", "rope", Q0);
  edge("qkv", "rope", K0);
  add(
    "value-scale",
    "V · 整体缩放后写缓存",
    <div className="architecture-equation">
      {heads(V0, "\\widehat v", a.kvHeads, 128, "coral", "in")}
      <span className="architecture-operator">×</span>
      <Scalar tex="0.707" tone="crimson" />
      <span className="architecture-operator">=</span>
      {heads(Vt, "v", a.kvHeads, 128, "coral", "out")}
    </div>,
    Vt,
    1250,
  );
  edge("qkv", "value-scale", V0, { sourceSide: "right", targetSide: "left" });
  add(
    "cache",
    `${swa ? "SWA · 当前可读 128-token 窗口" : "全注意力 · 当前可读因果前缀"} · 本层每个 KV Head 独立`,
    <>
      <Columns>
        {[
          heads(Kt, "k", a.kvHeads, 192, "violet", "in"),
          heads(Vt, "v", a.kvHeads, 128, "coral", "in"),
        ]}
      </Columns>
      <p className="architecture-note">
        <M
          tex={`g=1,2,\\ldots,${a.kvHeads};\\quad ${swa ? "r=\\max(1,t-127),\\quad m_t=\\min(128,t)" : "1\\le j\\le t"}`}
        />
      </p>
      <p className="architecture-note">
        {swa
          ? "本图展开窗口已满（t>128）的更新；短前缀只包含已有行。图示读取语义，缓存后端决定物理存储。"
          : "各查询只读自身因果前缀；历史行沿原 token 顺序保留。"}
      </p>
      <Columns>
        {(["K", "V"] as const).map((kind) => {
          const stem = kind.toLowerCase(),
            width = kind === "K" ? 192 : 128,
            tone = kind === "K" ? "violet" : "coral";
          return (
            <div key={kind} className="architecture-cache-branch">
              <p className="architecture-caption">
                {kind} · 原历史行与本步新行
              </p>
              <ObjectConnections
                links={[
                  ...(swa ? ["r", "r+1", "t-1"] : ["1", "2", "t-1"]).map(
                    (row) => ({
                      from: `old-${row}`,
                      to: `read-${row}`,
                      direction: "right" as const,
                    }),
                  ),
                  { from: "new", to: "read-t", direction: "right" },
                ]}
              >
                <div className="architecture-cache-transfer">
                  <div>
                    <Matrix
                      name={`${kind}^{old}_{${l},g,t}`}
                      shape={`${swa ? "\\min(128,t-1)" : "t-1"}\\times${width}`}
                      rows={
                        swa ? ["t-128", "r", "r+1", "…", "t-1"] : reps("t-1")
                      }
                      columns={reps(width)}
                      tone={tone}
                      rowTone={(row) => (row === "t-128" ? "slate" : tone)}
                      rowTrace={(row) => `old-${row}`}
                      element={(r, j) => `${stem}_{${l},g,${r},${j}}`}
                    />
                    {swa && (
                      <p className="architecture-note">灰色行移出本次窗口</p>
                    )}
                    <Row
                      name={`${stem}_{${l},g,t}`}
                      size={width}
                      tone={tone}
                      title="本步新增一行"
                      trace="new"
                    />
                  </div>
                  <div>
                    <p className="architecture-caption">
                      历史行原样保留 · 新行接到末尾
                    </p>
                    {readCache(kind, "out", true)}
                  </div>
                </div>
              </ObjectConnections>
            </div>
          );
        })}
      </Columns>
    </>,
    K,
    2400,
  );
  edge("rope", "cache", Kt);
  edge("value-scale", "cache", Vt);
  add(
    "attention",
    `GQA · 每 ${64 / a.kvHeads} 个 Query Head 共读一组 K/V`,
    <HeadBranches
      sources={heads(Q, "q", 64, 192, "blue", "in", (r) => `q-source-${r}`)}
      branches={[1, 2, 64].map((head) => ({
        head: String(head),
        body: (
          <>
            <div className="architecture-score-top">
              <div>
                <div className="architecture-equation">
                  <Row
                    name={`q_{${l},${head},t}`}
                    size={192}
                    tone="blue"
                    trace={`q-input-${head}`}
                  />
                  <span className="architecture-operator">×</span>
                  {readCache("K", head === 1 ? "in" : undefined)}
                  <M tex={"{}^\\top/\\sqrt{192}"} />
                  <span className="architecture-operator">=</span>
                  <Row
                    name={`s_{${l},${head},t}`}
                    size={length}
                    columns={swa ? ["r", "r+1", "…", "t"] : reps("t")}
                    tone="plum"
                  />
                </div>
                <p className="architecture-note">
                  <M
                    tex={`g=g(${head})=${1 + Math.floor((head - 1) / (64 / a.kvHeads))}`}
                  />
                  {" · "}第 j 个分数对应同一原 token 的 Key
                  行；以下展示首、次、末三个可见位置。
                </p>
              </div>
            </div>
            <Down label="分数取指数，沿当前可见行归约" />
            <div className="architecture-probability-grid">
              <div>
                <Sum
                  termSelector="[data-exponent]"
                  inputs={[start, swa ? "r+1" : "2", "t"].map((j) => (
                    <div key={j} data-exponent>
                      <M tex={exponentialTex(`s_{${l},${head},t,${j}}`)} />
                    </div>
                  ))}
                  result={<Scalar tex={`D_{${l},${head},t}`} tone="gold" />}
                  ellipsis
                />
                {swa && (
                  <div className="architecture-equation">
                    <Scalar tex={`D_{${l},${head},t}`} tone="gold" />
                    <span className="architecture-operator">+</span>
                    <M tex={exponentialTex(`b^{sink}_{${l},${head}}`)} />
                    <span className="architecture-operator">=</span>
                    <Scalar
                      tex={`\\widetilde D_{${l},${head},t}`}
                      tone="gold"
                    />
                  </div>
                )}
              </div>
              <div>
                <Columns>
                  {[start, swa ? "r+1" : "2", "t"].map((j) => (
                    <div key={j} className="architecture-equation">
                      <M
                        tex={`\\frac{${exponentialTex(`s_{${l},${head},t,${j}}`)}}{${swa ? "\\widetilde D" : "D"}_{${l},${head},t}}`}
                      />
                      <span className="architecture-operator">=</span>
                      <Scalar tex={`a_{${l},${head},t,${j}}`} tone="orange" />
                    </div>
                  ))}
                </Columns>
                {swa && (
                  <p className="architecture-note">
                    sink 是每头独立标量，只参与分母；缓存里没有对应的 Value 行。
                  </p>
                )}
                <Row
                  name={`a_{${l},${head},t}`}
                  size={length}
                  tone="orange"
                  columns={swa ? ["r", "r+1", "…", "t"] : reps("t")}
                  trace={`a-output-${head}`}
                />
              </div>
            </div>
          </>
        ),
      }))}
      result={heads(
        A,
        "a",
        64,
        length,
        "orange",
        "out",
        (r) => `a-result-${r}`,
      )}
      links={[1, 2, 64].flatMap((head) => [
        {
          from: `q-source-${head}`,
          to: `q-input-${head}`,
          direction: "right" as const,
        },
        {
          from: `a-output-${head}`,
          to: `a-result-${head}`,
          direction: "right" as const,
        },
      ])}
    />,
    A,
    2500,
  );
  edge("rope", "attention", Q, { sourceSide: "bottom", targetSide: "left" });
  edge("cache", "attention", K);
  add(
    "weighted",
    "各 Query Head · 权重乘对应 V 行，再沿 token 轴求和",
    <HeadBranches
      sources={
        <>
          {heads(A, "a", 64, length, "orange", "in", (r) => `a-source-${r}`)}
          <p className="architecture-note">
            <M tex={`g(h)=1+\\lfloor(h-1)/${64 / a.kvHeads}\\rfloor`} />
          </p>
        </>
      }
      branches={[1, 2, 64].map((head) => {
        const group = 1 + Math.floor((head - 1) / (64 / a.kvHeads));
        const positions = [start, swa ? "r+1" : "2", "t"];
        const values = (
          <Matrix
            name={`V^{read}_{${l},${group},t}`}
            shape={`${length}\\times128`}
            rows={
              swa ? ["r", "r+1", "…", "t-1", "t"] : ["1", "2", "…", "t-1", "t"]
            }
            columns={reps(128)}
            tone="coral"
            selected={positions}
            rowTrace={(j) => `read-${j}`}
            element={(j, d) => `v_{${l},${group},${j},${d}}`}
          />
        );
        return {
          head: String(head),
          body: (
            <ObjectConnections
              links={positions.flatMap((j) => [
                {
                  from: `weight-${j}`,
                  to: `alpha-${j}`,
                  direction: "down" as const,
                },
                {
                  from: `read-${j}`,
                  to: `value-${j}`,
                  direction: "right-down" as const,
                },
              ])}
            >
              <div data-projection>
                <Columns>
                  {[
                    <Row
                      name={`a_{${l},${head},t}`}
                      size={length}
                      columns={swa ? ["r", "r+1", "…", "t"] : reps("t")}
                      tone="orange"
                      trace={`a-input-${head}`}
                      columnTrace={(j) => `weight-${j}`}
                      element={(j) => `a_{${l},${head},t,${j}}`}
                    />,
                    head === 1 ? (
                      <RecipePort tex={V} direction="in">
                        {values}
                      </RecipePort>
                    ) : (
                      values
                    ),
                  ]}
                </Columns>
              </div>
              <div className="mimo-value-slices">
                <Sum
                  ellipsis
                  termSelector="[data-sum-terminal] [data-expanded-tensor]"
                  inputs={positions.map((j) => (
                    <div key={j}>
                      <div className="architecture-equation">
                        <span data-trace-object={`alpha-${j}`}>
                          <Scalar
                            tex={`a_{${l},${head},t,${j}}`}
                            tone="orange"
                          />
                        </span>
                        <span className="architecture-operator">×</span>
                        <Row
                          name={`v_{${l},${group},${j}}`}
                          size={128}
                          tone="coral"
                          trace={`value-${j}`}
                        />
                      </div>
                      <Down />
                      <div data-sum-terminal>
                        <Row
                          name={`p^V_{${l},${head},t,${j}}`}
                          size={128}
                          tone="teal"
                        />
                      </div>
                    </div>
                  ))}
                  result={
                    <Row
                      name={`o_{${l},${head},t}`}
                      size={128}
                      tone="coral"
                      trace={`o-output-${head}`}
                    />
                  }
                />
              </div>
            </ObjectConnections>
          ),
        };
      })}
      result={heads(O, "o", 64, 128, "coral", "out", (r) => `o-result-${r}`)}
      links={[1, 2, 64].flatMap((head) => [
        {
          from: `a-source-${head}`,
          to: `a-input-${head}`,
          direction: "right" as const,
        },
        {
          from: `o-output-${head}`,
          to: `o-result-${head}`,
          direction: "right" as const,
        },
      ])}
    />,
    O,
    2800,
  );
  edge("attention", "weighted", A);
  edge("cache", "weighted", V, { sourceSide: "right", targetSide: "top" });
  add(
    "residual-a",
    "Head 拼接 → 输出投影 → 第一条残差",
    <>
      {heads(O, "o", 64, 128, "coral", "in")}
      <Down label="沿 Head 轴拼接 · 64 × 128 = 8192" />
      <Project
        input={`o^{cat}_{${l},t}`}
        weight={`W^O_{${l}}`}
        output={`o^A_{${l},t}`}
        from={8192}
        to={d}
      />
      <Sum
        inputs={[
          <Row key="skip" name={h} size={d} direction="in" />,
          <Row key="out" name={`o^A_{${l},t}`} size={d} tone="coral" />,
        ]}
        result={<Row name={y} size={d} direction="out" />}
      />
    </>,
    y,
  );
  edge("weighted", "residual-a", O);
  edge("input", "residual-a", h, { sourceSide: "left", targetSide: "left" });
  add(
    "norm-f",
    "FFN · 独立的本层归一化",
    <Rms
      input={y}
      output={z}
      size={d}
      gamma={`\\gamma^F_{${l}}`}
      eps={p.eps}
      inputPort
      outputPort
    />,
    z,
  );
  edge("residual-a", "norm-f", y);
  if (a.ffn === "dense") {
    add(
      "dense",
      "首层 Dense SwiGLU · 4096 → 16384 → 4096",
      <SwiGlu
        input={z}
        output={f}
        hidden={d}
        intermediate={a.intermediate}
        scope={`${l},F`}
        inputPort
        outputPort
      />,
      f,
      2200,
    );
    edge("norm-f", "dense", z);
  } else {
    const E = `E_{${l},t}`,
      alpha = `\\alpha_{${l},t}`;
    add(
      "router",
      "MoE · 256 选 8 · 偏置只影响选择",
      <>
        <Project
          input={z}
          weight={`W^R_{${l}}`}
          output={`u^E_{${l},t}`}
          from={d}
          to={256}
          inputPort
        />
        <Flow>
          {[
            <Operation key="sig" tex={`s^E_{${l},t}=\\sigma(u^E_{${l},t})`} />,
            <Row key="s" name={`s^E_{${l},t}`} size={256} tone="plum" />,
          ]}
        </Flow>
        <div className="architecture-equation">
          <Row name={`s^E_{${l},t}`} size={256} tone="plum" />
          <span className="architecture-operator">+</span>
          <Row name={`b^E_{${l}}`} size={256} tone="crimson" />
          <span className="architecture-operator">=</span>
          <Row name={`\\widetilde s^E_{${l},t}`} size={256} tone="rose" />
        </div>
        <Down label="一组包含全部 256 专家 · 选最高 8 个校正分数" />
        <Row name={E} size={8} tone="amber" direction="out" />
        <Columns>
          {["1", "2", "8"].map((k) => (
            <Operation
              key={k}
              tex={`\\alpha_{${l},t,${k}}=\\frac{s^E_{${l},t,e_${k}}}{\\sum_{j=1}^{8}s^E_{${l},t,e_j}}`}
              label={`第 ${k} 个选中专家`}
            />
          ))}
        </Columns>
        <Row name={alpha} size={8} tone="gold" direction="out" />
      </>,
      E,
      1850,
    );
    edge("norm-f", "router", z, { sourceSide: "right" });
    add(
      "experts",
      "8 个独立 SwiGLU 专家 · 按选中系数汇合",
      <>
        <Columns>
          {[
            <Row key="e" name={E} size={8} tone="amber" direction="in" />,
            <Row key="a" name={alpha} size={8} tone="gold" direction="in" />,
          ]}
        </Columns>
        <p className="architecture-note">
          <M tex={`e_k=(${E})_k,\\quad k=1,2,\\ldots,8`} />
          ；每个选中专家有自己的三份参数。
        </p>
        <SwiGlu
          input={z}
          output={`v^E_{${l},e_k,t}`}
          hidden={d}
          intermediate={2048}
          scope={`${l},e_k`}
          inputPort
        />
        <Sum
          ellipsis
          termSelector="[data-sum-terminal] [data-expanded-tensor]"
          inputs={["1", "2", "8"].map((k) => (
            <div key={k}>
              <div className="architecture-equation">
                <Scalar tex={`\\alpha_{${l},t,${k}}`} tone="gold" />
                <span className="architecture-operator">×</span>
                <Row name={`v^E_{${l},e_${k},t}`} size={d} tone="coral" />
              </div>
              <Down />
              <div data-sum-terminal>
                <Row name={`p^E_{${l},t,${k}}`} size={d} tone="teal" />
              </div>
            </div>
          ))}
          result={<Row name={f} size={d} tone="coral" direction="out" />}
        />
      </>,
      f,
      2300,
    );
    edge("norm-f", "experts", z, { sourceSide: "bottom", targetSide: "left" });
    edge("router", "experts", E, { sourceSide: "left", targetSide: "left" });
    edge("router", "experts", alpha);
  }
  add(
    "residual-f",
    "第二条残差 · 本层输出",
    <>
      <Sum
        inputs={[
          <Row key="y" name={y} size={d} direction="in" />,
          <Row key="f" name={f} size={d} tone="coral" direction="in" />,
        ]}
        result={<Row name={`h_{${layer + 1},t}`} size={d} />}
      />
      <p className="architecture-note">
        {layer === 48 ? "进入最终 RMSNorm 与词表投影" : "进入下一层"}
      </p>
    </>,
    `h_{${layer + 1},t}`,
    1200,
  );
  edge("residual-a", "residual-f", y, {
    sourceSide: "left",
    targetSide: "left",
  });
  edge(a.ffn === "dense" ? "dense" : "experts", "residual-f", f);
  return {
    introduction: `MiMo-V2.5 · Layer ${layer}/48 · ${swa ? "128-token SWA + sink" : "Full GQA"} · ${a.kvHeads} KV Heads · ${a.ffn === "dense" ? "Dense" : "256 选 8，无共享专家"}。t 为当前查询位置。`,
    stages,
    links,
    references: [
      { title: "官方配置 · 固定版本", url: p.source.url },
      { title: "官方实现 · 固定版本", url: p.source.implementation! },
    ],
  };
}

export function mimoOverviewRecipe(phase: Phase): Recipe {
  const p = architectureProfile("mimo25"),
    n = phase === "prefill" ? "N" : "1";
  return {
    introduction:
      "MiMo-V2.5 · 全模型导航。逐层入口展开 QKV、缓存、SWA/sink、MoE 与残差；本页展示文本主干与层配置。",
    references: [
      { title: "官方配置", url: p.source.url },
      { title: "官方实现", url: p.source.implementation! },
    ],
    links: [
      { source: "embedding", target: "stack", tex: "H_1" },
      { source: "stack", target: "output", tex: "H_{49}" },
    ],
    stages: [
      {
        id: "embedding",
        title: "文本 token → 嵌入",
        output: "H_1",
        body: (
          <Flow>
            {[
              <Tensor
                key="ids"
                name="T"
                shape={`${n}\\times1`}
                rows={reps(n)}
                columns={["1"]}
              />,
              <Matrix
                key="e"
                name="E^{tok}"
                shape={`${p.vocab}\\times4096`}
                rows={reps(p.vocab)}
                columns={reps(4096)}
                tone="indigo"
                element={(r, c) => `e^{tok}_{${r},${c}}`}
              />,
              <Matrix
                key="h"
                name="H_1"
                shape={`${n}\\times4096`}
                rows={reps(n)}
                columns={reps(4096)}
                tone="blue"
                element={(r, c) => `h_{1,${r},${c}}`}
              />,
            ]}
          </Flow>
        ),
      },
      {
        id: "stack",
        title: "48 层 · 不同层采用不同注意力与 FFN",
        output: "H_{49}",
        width: 1500,
        body: (
          <div className="architecture-layer-map">
            {Array.from({ length: 48 }, (_, i) => {
              const a = layerArchitecture("mimo25", i + 1);
              return (
                <div key={i} className="architecture-layer-tile">
                  <b>Layer {i + 1}</b>
                  <span>{a.window ? "SWA 128 · sink" : "Full GQA"}</span>
                  <span>{a.kvHeads} KV Heads</span>
                  <span>
                    {a.ffn === "dense" ? "Dense 16384" : "MoE 256 → 8"}
                  </span>
                </div>
              );
            })}
          </div>
        ),
      },
      {
        id: "output",
        title: "逐行归一化 → 词表 logits",
        output: "logits_t",
        width: 1600,
        body: (
          <>
            <Rms
              input="h_{49,t}"
              output="z^{final}_t"
              size={4096}
              gamma={"\\gamma^{final}"}
              eps={p.eps}
            />
            <Project
              input="z^{final}_t"
              weight="W^{vocab}"
              output="logits_t"
              from={4096}
              to={p.vocab}
            />
          </>
        ),
      },
    ],
  };
}
