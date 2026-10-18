import {
  architectureConfigs,
  architectureProfile,
  layerArchitecture,
  type ArchitectureModelId,
} from "../data/architecture-profiles";
import type { Recipe, RecipeLink, Stage, Phase } from "./recipes";
import { MathFormula as M } from "../components/diagram-primitives";
import { RecipePort } from "./RecipePorts";
import { ObjectConnections } from "../components/ObjectConnections";
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
  SwiGlu,
} from "./architecture-blocks";
import "./architecture-blocks.css";
import { deepseekSelectionStages } from "./deepseek-selection";
import {
  deepseekIndexStages,
  DSA_KERNEL,
  DSA_HADAMARD,
} from "./deepseek-index";

export type DeepSeekLayerId = Extract<
  ArchitectureModelId,
  "v3" | "r1" | "v31" | "v32"
>;
const cols = (n: string | number) => ["1", "2", "…", String(n)];

export function deepseekLayerRecipe(
  id: DeepSeekLayerId,
  phase: Phase,
  layer: number,
): Recipe {
  const p = architectureProfile(id),
    a = layerArchitecture(id, layer),
    c = architectureConfigs[id];
  const l = String(layer),
    h = `h_{${l},t}`,
    x = `x_{${l},t}`,
    qr = `q^{low}_{${l},t}`;
  const Q = `Q_{${l},t}`,
    C = `C^{KV}_{${l},\\le t}`,
    K = `K^R_{${l},\\le t}`;
  const A = `A_{${l},t}`,
    O = `O_{${l},t}`,
    y = `y_{${l},t}`,
    z = `z_{${l},t}`,
    f = `f_{${l},t}`;
  const qHeads = a.queryHeads,
    d = p.hidden;
  const stages: Stage[] = [],
    links: RecipeLink[] = [];
  const add = (
    id: string,
    title: string,
    body: Stage["body"],
    output: string,
    width = 1350,
    formula?: string,
  ) =>
    stages.push({ id, title, body, output, width, formula, inlinePorts: true });
  const edge = (
    source: string,
    target: string,
    tex: string,
    ports: Pick<RecipeLink, "sourceSide" | "targetSide"> = {},
  ) => links.push({ source, target, tex, ...ports });
  const cache = (
    name: string,
    stem: string,
    width: number,
    direction: "in" | "out" | undefined,
    tone: "ocean" | "violet",
    highlightCurrent = true,
  ) => (
    <Matrix
      name={name}
      shape={`t\\times${width}`}
      rows={["1", "2", "…", "t"]}
      columns={cols(width)}
      tone={tone}
      selected={highlightCurrent ? "t" : undefined}
      direction={direction}
      element={(r, j) => `${stem}_{${l},${r},${j}}`}
    />
  );
  const headMatrix = (
    name: string,
    stem: string,
    width: number | string,
    direction: "in" | "out" | undefined,
    tone: "blue" | "orange" | "coral" = "blue",
  ) => (
    <Matrix
      name={name}
      shape={`${qHeads}\\times ${width}`}
      rows={cols(qHeads)}
      columns={cols(width)}
      tone={tone}
      direction={direction}
      element={(r, j) => `${stem}_{${l},${r},t,${j}}`}
    />
  );

  add(
    "input",
    `Layer ${layer} · 行归一化与残差旁路`,
    <>
      <p className="architecture-note">
        {phase === "prefill"
          ? "Prefill：以下展开第 t 行，各查询行分别读取自己的因果前缀。"
          : "Decode：本步只投影当前 t 行，本层历史缓存直接读取。"}
      </p>
      {phase === "prefill" && (
        <>
          <Matrix
            name={`H_{${l}}`}
            shape={`N\\times${d}`}
            rows={["1", "2", "…", "t", "…", "N"]}
            columns={cols(d)}
            selected="t"
            tone="blue"
            element={(r, j) => `h_{${l},${r},${j}}`}
          />
          <Down label="展开当前查询的第 t 行" />
        </>
      )}
      <Rms
        input={h}
        output={x}
        size={d}
        gamma={`\\gamma^A_{${l}}`}
        eps={p.eps}
        outputPort
        inputSource
      />
    </>,
    x,
  );
  add(
    "query",
    "MLA · Query 降维、归一化、升维与分头",
    <>
      <Project
        input={x}
        weight={`W^{DQ}_{${l}}`}
        output={`\\widehat q^{low}_{${l},t}`}
        from={d}
        to={c.q_lora_rank}
        inputPort
      />
      <Rms
        input={`\\widehat q^{low}_{${l},t}`}
        output={qr}
        size={c.q_lora_rank}
        gamma={`\\gamma^Q_{${l}}`}
        eps={p.eps}
        outputPort={id === "v32"}
      />
      <Project
        input={qr}
        weight={`W^{UQ}_{${l}}`}
        output={`\\widetilde q_{${l},t}`}
        from={c.q_lora_rank}
        to={qHeads * a.keyDim}
      />
      <Flow>
        {[
          <Operation
            key="split"
            label="按 Head 分段"
            tex={`${qHeads}\\times(128+64)`}
          />,
          headMatrix(
            `\\widetilde Q_{${l},t}`,
            "\\widetilde q",
            a.keyDim,
            undefined,
          ),
        ]}
      </Flow>
      <Columns>
        {[
          <Row
            key="nope"
            name={`q^{noPE}_{${l},h,t}`}
            size={128}
            tone="blue"
            title="每个 Head · 前 128 个元素"
          />,
          <Flow key="rope">
            {[
              <Row
                key="q"
                name={`\\widetilde q^R_{${l},h,t}`}
                size={64}
                tone="blue"
              />,
              <Operation key="rot" tex={`R_t`} label="32 对元素旋转" />,
              <Row key="r" name={`q^R_{${l},h,t}`} size={64} tone="blue" />,
            ]}
          </Flow>,
        ]}
      </Columns>
      <Flow>
        {[
          <Operation
            key="assemble"
            label="同一 Head 的 128 维内容和旋转后的 64 维位置重新并排"
            tex="128+64=192"
          />,
          headMatrix(Q, "q", a.keyDim, "out"),
        ]}
      </Flow>
    </>,
    Q,
    1500,
    `q_{${l},h,t,d}=q^{noPE}_{${l},h,t,d}\\ (1\\le d\\le128),\\quad q_{${l},h,t,128+j}=q^R_{${l},h,t,j}\\ (1\\le j\\le64)`,
  );
  add(
    "kv",
    "MLA · 本步潜向量和位置 Key → 本层缓存",
    <>
      <Project
        input={x}
        weight={`W^{DKV}_{${l}}`}
        output={`u_{${l},t}`}
        from={d}
        to={576}
        inputPort
      />
      <Columns>
        {[
          <div key="latent">
            <p className="architecture-caption">前 512 维 · 内容潜向量</p>
            <Rms
              input={`\\widetilde c^{KV}_{${l},t}`}
              output={`c^{KV}_{${l},t}`}
              size={512}
              gamma={`\\gamma^{KV}_{${l}}`}
              eps={p.eps}
            />
            <Flow>
              {[
                <Operation
                  key="append"
                  tex={`\\operatorname{Append}_{t}`}
                  label="旧行保留 · 本步追加"
                />,
                cache(C, "c^{KV}", 512, "out", "ocean"),
              ]}
            </Flow>
          </div>,
          <div key="position">
            <p className="architecture-caption">后 64 维 · 各 Head 共用</p>
            <Flow>
              {[
                <Row
                  key="k"
                  name={`\\widetilde k^R_{${l},t}`}
                  size={64}
                  tone="violet"
                />,
                <Operation key="rope" tex="R_t" />,
              ]}
            </Flow>
            <Row name={`k^R_{${l},t}`} size={64} tone="violet" />
            <Flow>
              {[
                <Operation key="append" tex={`\\operatorname{Append}_{t}`} />,
                cache(K, "k^R", 64, "out", "violet"),
              ]}
            </Flow>
          </div>,
        ]}
      </Columns>
      <p className="architecture-note">
        每个 token 缓存 512 + 64 个数；各层独立维护自己的两组历史。
      </p>
    </>,
    C,
    2100,
  );
  edge("input", "query", x);
  edge("input", "kv", x);

  if (id === "v32") {
    const index = deepseekIndexStages(phase, layer);
    stages.push(...index.stages);
    links.push(...index.links);
    edge("query", "index-query", qr);
    edge("input", "index-key", x);
    edge("input", "index-weights", x);
    stages.push(...deepseekSelectionStages(phase, layer));
    edge("index", "index-select", `s^I_{${l},t}`);
    edge("index-select", "index-read", `m^I_{${l},t}`);
    edge("kv", "index-read", C);
    edge("kv", "index-read", K);
  }

  add(
    "attention",
    "MLA · 内容得分 + 位置得分 → 每个 Head 的概率行",
    <>
      <Columns>
        {[
          headMatrix(Q, "q", a.keyDim, "in"),
          cache(C, "c^{KV}", 512, "in", "ocean", id !== "v32"),
          cache(K, "k^R", 64, "in", "violet", id !== "v32"),
        ]}
      </Columns>
      <p className="architecture-note">
        <M tex={`h=1,2,\\ldots,${qHeads}\\quad j=1,2,\\ldots,t`} />
      </p>
      <Columns>
        {[
          <Flow key="content">
            {[
              <Row
                key="q"
                name={`q^{noPE}_{${l},h,t}`}
                size={128}
                tone="blue"
              />,
              <Operation
                key="absorb"
                tex={`\\times(W^{UK}_{${l},h})^\\top`}
                label="权重吸收 · 128 → 512"
              />,
              <Row
                key="abs"
                name={`\\bar q_{${l},h,t}`}
                size={512}
                tone="blue"
              />,
            ]}
          </Flow>,
          <Operation
            key="position"
            tex={`z^R_{${l},h,t,j}=q^R_{${l},h,t}\\cdot k^R_{${l},j}`}
            label="位置分支 · 64 维内积"
          />,
        ]}
      </Columns>
      <ObjectConnections
        links={
          id === "v32"
            ? [
                {
                  from: "scaled-score",
                  to: "score-with-mask",
                  direction: "right",
                },
              ]
            : []
        }
      >
        <div className={id === "v32" ? "dsa-mla-tail" : undefined}>
          <div>
            <Sum
              inputs={[
                <Row
                  key="c"
                  name={`z^C_{${l},h,t}`}
                  size="t"
                  tone="olive"
                  title="每列：吸收后的 Query · 缓存潜向量"
                />,
                <Row key="r" name={`z^R_{${l},h,t}`} size="t" tone="olive" />,
              ]}
              result={<Row name={`z_{${l},h,t}`} size="t" tone="plum" />}
            />
            {id === "v32" && (
              <>
                <Flow>
                  {[
                    <Operation
                      key="scale"
                      tex={`\\tau\\,z_{${l},h,t}`}
                      label="主注意力缩放"
                    />,
                    <Row
                      key="scaled"
                      name={`z^{scaled}_{${l},h,t}`}
                      size="t"
                      tone="plum"
                      trace="scaled-score"
                    />,
                  ]}
                </Flow>
              </>
            )}
          </div>
          <div>
            {id === "v32" && (
              <>
                <Sum
                  inputs={[
                    <Row
                      key="z"
                      name={`z^{scaled}_{${l},h,t}`}
                      size="t"
                      tone="plum"
                      trace="score-with-mask"
                    />,
                    <Row
                      key="mask"
                      name={`m^{read}_{${l},t}`}
                      size="t"
                      tone="violet"
                      direction="in"
                      title="同一选择掩码用于每个 MLA Head"
                      element={(j) => `m^I_{${l},t,${j}}`}
                    />,
                  ]}
                  result={
                    <Row name={`s^{MLA}_{${l},h,t}`} size="t" tone="plum" />
                  }
                />
                <p className="architecture-note">
                  <M tex={`s_j:=s^{MLA}_{${l},h,t,j},\\quad j=1,\\ldots,t`} />
                </p>
              </>
            )}
            <Flow>
              {[
                ...(id === "v32"
                  ? []
                  : [
                      <Operation
                        key="scale"
                        tex={`s_j=\\tau\\,z_{${l},h,t,j}`}
                        label="配置的注意力缩放 · 因果/选择掩码"
                      />,
                    ]),
                <Operation
                  key="softmax"
                  tex={`a_{${l},h,t,j}=\\frac{e^{s_j}}{\\sum_{k\\in\\mathcal V_t}e^{s_k}}`}
                  label="同一 Head、同一 Query 的可见列归一化"
                />,
                headMatrix(A, "a", "t", "out", "orange"),
              ]}
            </Flow>
          </div>
        </div>
      </ObjectConnections>
      <p className="architecture-note">
        <M tex={`z^C_{${l},h,t,j}=\\bar q_{${l},h,t}\\cdot c^{KV}_{${l},j}`} />
        ；
        <M
          tex={`\\tau=\\frac{(1+0.1\\ln ${c.rope_scaling.factor})^2}{\\sqrt{192}}`}
        />
        。缓存保留完整历史，掩码控制本次读取。
      </p>
    </>,
    A,
    1800,
  );
  edge("query", "attention", Q);
  edge("kv", "attention", C);
  edge("kv", "attention", K);
  if (id === "v32") edge("index-read", "attention", `m^{read}_{${l},t}`);
  add(
    "values",
    "每个 Head · 概率乘潜向量 → 求和 → Value 升维",
    <>
      <Columns>
        {[
          headMatrix(A, "a", "t", "in", "orange"),
          cache(C, "c^{KV}", 512, "in", "ocean", id !== "v32"),
        ]}
      </Columns>
      <p className="architecture-note">
        {id === "v32"
          ? "固定同一 Head h；展示原位置 1、2、t，未命中 Top-K 的行概率为 0，其余位置同构。"
          : "固定同一 Head h；下列三项代表首、次、末可见行，省略中间同构项。"}
      </p>
      <Sum
        ellipsis
        inputs={["1", "2", "t"].map((j) => (
          <div key={j}>
            <Flow>
              {[
                <Operation
                  key="mul"
                  tex={`a_{${l},h,t,${j}}\\,c^{KV}_{${l},${j}}`}
                  label={j === "t" ? "末行 · 其余项同样参与" : `第 ${j} 行`}
                />,
                <Row
                  key="prod"
                  name={`p_{${l},h,t,${j}}`}
                  size={512}
                  tone="teal"
                />,
              ]}
            </Flow>
          </div>
        ))}
        result={<Row name={`v^{low}_{${l},h,t}`} size={512} tone="coral" />}
      />
      <Project
        input={`v^{low}_{${l},h,t}`}
        weight={`W^{UV}_{${l},h}`}
        output={`o_{${l},h,t}`}
        from={512}
        to={128}
        tone="coral"
      />
      {headMatrix(O, "o", 128, "out", "coral")}
    </>,
    O,
    1700,
  );
  edge("attention", "values", A);
  edge("kv", "values", C);
  add(
    "residual-a",
    "Head 拼接、输出投影与 Attention 残差",
    <>
      <Flow>
        {[
          headMatrix(O, "o", 128, "in", "coral"),
          <Operation key="concat" tex={`\\operatorname{Concat}_{h=1}^{128}`} />,
          <Row key="o" name={`o^{cat}_{${l},t}`} size={16384} tone="coral" />,
        ]}
      </Flow>
      <Project
        input={`o^{cat}_{${l},t}`}
        weight={`W^O_{${l}}`}
        output={`o^{A}_{${l},t}`}
        from={16384}
        to={d}
        tone="coral"
      />
      <Sum
        inputs={[
          <Row key="skip" name={h} size={d} tone="blue" direction="in" />,
          <Row key="a" name={`o^A_{${l},t}`} size={d} tone="coral" />,
        ]}
        result={<Row name={y} size={d} tone="blue" direction="out" />}
      />
    </>,
    y,
  );
  edge("values", "residual-a", O);
  // 残差从真实 h 行左侧绕出，不能穿过下方 RMSNorm 的分子行。
  edge("input", "residual-a", h, {
    sourceSide: "left",
    targetSide: "left",
  });
  add(
    "norm-f",
    "FFN · 独立归一化",
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
      `Dense SwiGLU · ${d} → ${a.intermediate} → ${d}`,
      <>
        <SwiGlu
          input={z}
          output={f}
          hidden={d}
          intermediate={a.intermediate}
          scope={`${l},F`}
          inputPort
          outputPort
        />
      </>,
      f,
      2200,
    );
    edge("norm-f", "dense", z);
  } else {
    add(
      "router",
      "MoE · 带校正偏置选专家，原始分数作权重",
      <>
        <Project
          input={z}
          weight={`W^{router}_{${l}}`}
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
        <Columns>
          {[
            <Flow key="choose">
              {[
                <Operation
                  key="bias"
                  tex={`s^E_{${l},t}+b^E_{${l}}`}
                  label="分组分数：组内最高两个校正分数之和"
                />,
                <Operation
                  key="groups"
                  tex="8\\;\\mathrm{groups}\\to4\\;\\mathrm{groups}\\to\\operatorname{Top8}"
                />,
                <Row key="ids" name={`E_{${l},t}`} size={8} tone="amber" />,
              ]}
            </Flow>,
            <Operation
              key="weights"
              tex={`\\alpha_{${l},t,k}=${c.routed_scaling_factor}\\frac{s^E_{${l},t,e_k}}{\\sum_{r=1}^{8}s^E_{${l},t,e_r}}`}
              label="仅用选中专家的原始 sigmoid 分数"
            />,
          ]}
        </Columns>
        <Row name={`\\alpha_{${l},t}`} size={8} tone="gold" direction="out" />
        <RecipePort tex={`E_{${l},t}`} direction="out">
          <Row name={`E_{${l},t}`} size={8} tone="amber" />
        </RecipePort>
      </>,
      `E_{${l},t}`,
      1850,
    );
    edge("norm-f", "router", z);
    add(
      "experts",
      "8 个路由专家 · 每条完整 SwiGLU 路径独立计算",
      <>
        <Columns>
          {[
            <Row
              key="ids"
              name={`E_{${l},t}`}
              size={8}
              tone="amber"
              direction="in"
            />,
            <Row
              key="a"
              name={`\\alpha_{${l},t}`}
              size={8}
              tone="gold"
              direction="in"
            />,
          ]}
        </Columns>
        <p className="architecture-note">
          <M tex={`k=1,2,\\ldots,8\\quad e_k=(E_{${l},t})_k`} />
          ；按各自专家参数执行下面同构过程。
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
          inputs={["1", "2", "8"].map((k) => (
            <Flow key={k}>
              {[
                <Operation
                  key="w"
                  tex={`\\alpha_{${l},t,${k}}\\,v^E_{${l},e_${k},t}`}
                />,
                <Row key="p" name={`p^E_{${l},t,${k}}`} size={d} tone="teal" />,
              ]}
            </Flow>
          ))}
          result={
            <Row
              name={`f^{routed}_{${l},t}`}
              size={d}
              tone="coral"
              direction="out"
            />
          }
        />
      </>,
      `f^{routed}_{${l},t}`,
      2300,
    );
    edge("norm-f", "experts", z);
    edge("router", "experts", `E_{${l},t}`);
    edge("router", "experts", `\\alpha_{${l},t}`);
    add(
      "shared",
      "1 个共享专家 · 每个 token 都参与",
      <>
        <p className="architecture-note">参数下标 S 标识本层共享专家。</p>
        <SwiGlu
          input={z}
          output={`f^{shared}_{${l},t}`}
          hidden={d}
          intermediate={2048}
          scope={`${l},S`}
          inputPort
          outputPort
        />
      </>,
      `f^{shared}_{${l},t}`,
      2200,
    );
    edge("norm-f", "shared", z);
  }
  add(
    "residual-f",
    "FFN 汇合与本层输出",
    <>
      <Sum
        inputs={[
          <Row key="skip" name={y} size={d} tone="blue" direction="in" />,
          ...(a.ffn === "dense"
            ? [
                <Row
                  key="dense"
                  name={f}
                  size={d}
                  tone="coral"
                  direction="in"
                />,
              ]
            : [
                <Row
                  key="routed"
                  name={`f^{routed}_{${l},t}`}
                  size={d}
                  tone="coral"
                  direction="in"
                />,
                <Row
                  key="shared"
                  name={`f^{shared}_{${l},t}`}
                  size={d}
                  tone="coral"
                  direction="in"
                />,
              ]),
        ]}
        result={<Row name={`h_{${layer + 1},t}`} size={d} tone="blue" />}
      />
      <p className="architecture-note">
        {layer === p.layers
          ? "末层输出 → 最终 RMSNorm 与词表投影"
          : "进入下一层"}
      </p>
    </>,
    `h_{${layer + 1},t}`,
    1450,
  );
  edge("residual-a", "residual-f", y, {
    sourceSide: "left",
    targetSide: "left",
  });
  if (a.ffn === "dense") edge("dense", "residual-f", f);
  else {
    edge("experts", "residual-f", `f^{routed}_{${l},t}`);
    edge("shared", "residual-f", `f^{shared}_{${l},t}`);
  }
  return {
    introduction: `${p.name} · Layer ${layer}/${p.layers} · ${a.attention.toUpperCase()} + ${a.ffn === "dense" ? "Dense" : "256 选 8 MoE + 1 共享专家"}。所有索引 t 表示当前查询 token；缓存属于本层。`,
    stages,
    links,
    references: [
      { title: "官方配置 · 固定版本", url: p.source.url },
      ...(id === "v32"
        ? [
            { title: "官方 FP8 量化与索引内核 · 固定版本", url: DSA_KERNEL },
            { title: "Hadamard 运算库 · 固定版本", url: DSA_HADAMARD },
          ]
        : []),
      {
        title: "官方实现",
        url:
          p.source.implementation ??
          "https://github.com/deepseek-ai/DeepSeek-V3/blob/main/inference/model.py",
      },
    ],
  };
}
