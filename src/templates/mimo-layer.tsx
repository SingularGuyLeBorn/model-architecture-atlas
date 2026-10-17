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
  const edge = (source: string, target: string, tex: string) =>
    links.push({ source, target, tex });
  const heads = (
    name: string,
    stem: string,
    count: number,
    width: number | string,
    tone: "blue" | "violet" | "coral" | "orange",
    direction?: "in" | "out",
  ) => (
    <Matrix
      name={name}
      shape={`${count}\\times ${width}`}
      rows={reps(count)}
      columns={width === length && swa ? ["r", "r+1", "…", "t"] : reps(width)}
      tone={tone}
      direction={direction}
      element={(b, j) => `${stem}_{${l},${b},t,${j}}`}
    />
  );
  const readCache = (
    kind: "K" | "V",
    direction: "in" | "out",
    trace = false,
  ) => (
    <Matrix
      name={kind === "K" ? K : V}
      shape={`${length}\\times${kind === "K" ? a.keyDim : a.valueDim}`}
      rows={swa ? ["r", "r+1", "…", "t-1", "t"] : ["1", "2", "…", "t-1", "t"]}
      columns={reps(kind === "K" ? a.keyDim : a.valueDim)}
      selected="t"
      tone={kind === "K" ? "violet" : "coral"}
      direction={direction}
      rowTrace={trace ? (row) => `read-${row}` : undefined}
      element={(j, v) => `${kind.toLowerCase()}_{${l},g,${j},${v}}`}
    />
  );

  add(
    "input",
    `Layer ${layer} · 归一化与输入旁路`,
    <>
      <p className="architecture-note">
        {phase === "prefill"
          ? "Prefill：N 行同时计算；以下固定当前查询 t 展开。"
          : "Decode：本步计算 t 行；历史 K/V 从本层缓存读取。"}
      </p>
      {phase === "prefill" && (
        <>
          <Matrix
            name={`H_${l}`}
            shape={`N\\times${d}`}
            rows={["1", "2", "…", "t", "…", "N"]}
            columns={reps(d)}
            selected="t"
            tone="blue"
            element={(r, j) => `h_{${l},${r},${j}}`}
          />
          <Down label="第 t 行" />
        </>
      )}
      <Rms
        input={h}
        output={x}
        size={d}
        gamma={`\\gamma^A_${l}`}
        eps={p.eps}
        inputSource
        outputPort
      />
    </>,
    x,
  );
  add(
    "qkv",
    "一次 fused QKV 投影 · 按特征轴分三段，再分 Head",
    <>
      <Project
        input={x}
        weight={`W^{QKV}_${l}`}
        output={`u^{QKV}_{${l},t}`}
        from={d}
        to={a.queryHeads * a.keyDim + a.kvHeads * (a.keyDim + a.valueDim)}
        inputPort
      />
      <Down label="同一输出的三个连续切片" />
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
      <p className="architecture-note">
        <M
          tex={`u^{QKV}_{${l},t}=[\\operatorname{vec}(${Q0});\\operatorname{vec}(${K0});\\operatorname{vec}(${V0})]`}
        />
      </p>
    </>,
    Q0,
    1900,
  );
  edge("input", "qkv", x);
  add(
    "rope",
    "Q/K · 前 64 维成对旋转，后 128 维直通",
    <>
      <Columns>
        {[
          heads(Q0, "\\widehat q", 64, 192, "blue", "in"),
          heads(K0, "\\widehat k", a.kvHeads, 192, "violet", "in"),
        ]}
      </Columns>
      <p className="architecture-note">
        <M
          tex={`(w_{${l},t},w'_{${l},t}):=(\\widehat q_{${l},h,t},q_{${l},h,t})\\;\\mathrm{or}\\;(\\widehat k_{${l},g,t},k_{${l},g,t})`}
        />{" "}
        · 每个 Head 使用同一个位置 t−1
      </p>
      <Down label="逐 Head 展开 32 对旋转" />
      <HalfRoPE
        input={`w_{${l},t}`}
        output={`w'_{${l},t}`}
        size={192}
        rotary={64}
        theta={swa ? c.swa_rope_theta : c.rope_theta}
      />
      <Down label="旋转部分与原样部分合成每头 192 维" />
      <Columns>
        {[
          heads(Q, "q", 64, 192, "blue", "out"),
          heads(Kt, "k", a.kvHeads, 192, "violet", "out"),
        ]}
      </Columns>
    </>,
    Q,
    2100,
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
  edge("qkv", "value-scale", V0);
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
      <p className="architecture-note">
        {swa ? (
          <>
            本图展开窗口已满（t&gt;128）的更新；短前缀只包含已有行。
            图示读取语义，缓存后端决定物理存储。
          </>
        ) : (
          "各查询只读自身因果前缀；历史行沿原 token 顺序保留。"
        )}
      </p>
    </>,
    K,
    2400,
  );
  edge("rope", "cache", Kt);
  edge("value-scale", "cache", Vt);
  add(
    "attention",
    `GQA · 每 ${64 / a.kvHeads} 个 Query Head 共读一组 K/V`,
    <>
      <div className="architecture-score-top">
        {heads(Q, "q", 64, 192, "blue", "in")}
        <span className="architecture-arrow">→</span>
        <div>
          <p className="architecture-note">
            <M
              tex={`g(h)=1+\\lfloor(h-1)/${64 / a.kvHeads}\\rfloor,\\quad h=1,\\ldots,64`}
            />
          </p>
          <div className="architecture-equation">
            <Row name={`q_{${l},h,t}`} size={192} tone="blue" />
            <span className="architecture-operator">×</span>
            {readCache("K", "in")}
            <M tex={"{}^\\top/\\sqrt{192}"} />
            <span className="architecture-operator">=</span>
            <Row
              name={`s_{${l},h,t}`}
              size={length}
              columns={swa ? ["r", "r+1", "…", "t"] : reps("t")}
              tone="plum"
            />
          </div>
          <p className="architecture-note">
            第 j 个分数对应同一原 token 的 Key
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
                <M tex={exponentialTex(`s_{${l},h,t,${j}}`)} />
              </div>
            ))}
            result={<Scalar tex={`D_{${l},h,t}`} tone="gold" />}
            ellipsis
          />
          {swa && (
            <div className="architecture-equation">
              <Scalar tex={`D_{${l},h,t}`} tone="gold" />
              <span className="architecture-operator">+</span>
              <M tex={exponentialTex(`b^{sink}_{${l},h}`)} />
              <span className="architecture-operator">=</span>
              <Scalar tex={`\\widetilde D_{${l},h,t}`} tone="gold" />
            </div>
          )}
        </div>
        <div>
          <Columns>
            {[start, swa ? "r+1" : "2", "t"].map((j) => (
              <div key={j} className="architecture-equation">
                <M
                  tex={`\\frac{${exponentialTex(`s_{${l},h,t,${j}}`)}}{${swa ? "\\widetilde D" : "D"}_{${l},h,t}}`}
                />
                <span className="architecture-operator">=</span>
                <Scalar tex={`a_{${l},h,t,${j}}`} tone="orange" />
              </div>
            ))}
          </Columns>
          {swa && (
            <p className="architecture-note">
              sink 是每头独立标量，只参与分母；缓存里没有对应的 Value 行。
            </p>
          )}
          {heads(A, "a", 64, length, "orange", "out")}
        </div>
      </div>
    </>,
    A,
    1800,
  );
  edge("rope", "attention", Q);
  edge("cache", "attention", K);
  add(
    "weighted",
    "各 Query Head · 权重乘对应 V 行，再沿 token 轴求和",
    <>
      <Columns>
        {[heads(A, "a", 64, length, "orange", "in"), readCache("V", "in")]}
      </Columns>
      <p className="architecture-note">
        <M tex={`g=g(h)=1+\\lfloor(h-1)/${64 / a.kvHeads}\\rfloor`} />
        ；权重列与 Value 行采用同一个原 token 行号。
      </p>
      <Sum
        ellipsis
        termSelector="[data-sum-terminal] [data-expanded-tensor]"
        inputs={[start, swa ? "r+1" : "2", "t"].map((j) => (
          <div key={j}>
            <div className="architecture-equation">
              <Scalar tex={`a_{${l},h,t,${j}}`} tone="orange" />
              <span className="architecture-operator">×</span>
              <Row name={`v_{${l},g,${j}}`} size={128} tone="coral" />
            </div>
            <Down />
            <div data-sum-terminal>
              <Row name={`p^V_{${l},h,t,${j}}`} size={128} tone="teal" />
            </div>
          </div>
        ))}
        result={<Row name={`o_{${l},h,t}`} size={128} tone="coral" />}
      />
      <Down label="64 个 Head 分别执行；沿 Head 轴排列" />
      {heads(O, "o", 64, 128, "coral", "out")}
    </>,
    O,
    1950,
  );
  edge("attention", "weighted", A);
  edge("cache", "weighted", V);
  add(
    "residual-a",
    "Head 拼接 → 输出投影 → 第一条残差",
    <>
      {heads(O, "o", 64, 128, "coral", "in")}
      <Down label="沿 Head 轴拼接 · 64 × 128 = 8192" />
      <Project
        input={`o^{cat}_{${l},t}`}
        weight={`W^O_${l}`}
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
  edge("input", "residual-a", h);
  add(
    "norm-f",
    "FFN · 独立的本层归一化",
    <Rms
      input={y}
      output={z}
      size={d}
      gamma={`\\gamma^F_${l}`}
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
          weight={`W^R_${l}`}
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
          <Row name={`b^E_${l}`} size={256} tone="crimson" />
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
    edge("norm-f", "router", z);
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
    edge("norm-f", "experts", z);
    edge("router", "experts", E);
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
  edge("residual-a", "residual-f", y);
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
