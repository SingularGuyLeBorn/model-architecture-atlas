import type { Recipe, Stage, RecipeLink, Phase } from "./recipes";
import {
  MathFormula as M,
  tonePalette,
} from "../components/diagram-primitives";
import { Down } from "./structure-blocks";
import {
  Row,
  Matrix,
  Columns,
  Flow,
  Project,
  Operation,
  Rms,
  Sum,
  Scalar,
} from "./architecture-blocks";
import { qwenGdnRecipe } from "./qwen-gdn";
import { qwenQsaRecipe } from "./qwen-qsa";
import { layerArchitecture } from "../data/architecture-profiles";
import { qwenMoeRecipe } from "./qwen-moe";
import { qwenPleRecipe } from "./qwen-ple";
import { ObjectConnections } from "../components/ObjectConnections";
import { qwenInputStages } from "./qwen-boundaries";
import { RecipePort } from "./RecipePorts";

const lanes = [1, 2, 3, 4];
const features = ["1", "2", "…", "2560"];
export const qwenStateName = (l: number, part: "in" | "mid" | "out") =>
  `H^{${part}}_{${l},t}`;
export function QwenState({
  layer,
  part,
  direction,
  trace,
}: {
  layer: number;
  part: "in" | "mid" | "out";
  direction?: "in" | "out";
  trace?: string;
}) {
  return (
    <Matrix
      name={qwenStateName(layer, part)}
      shape={"4\\times2560"}
      rows={lanes.map(String)}
      columns={features}
      direction={direction}
      trace={trace}
      tone="blue"
      element={(j, d) => `h^{${part}}_{${layer},${j},t,${d}}`}
    />
  );
}

/** 门控残差的读写两半；真实子层计算插在 read 与 write 之间。 */
export function qwenResidualStages(layer: number, tag: "A" | "F" | "O") {
  const prefix = tag === "A" ? "attn-gr" : tag === "F" ? "ffn-gr" : "output-gr",
    part = tag === "A" ? "in" : tag === "F" ? "mid" : "out",
    next = tag === "A" ? "mid" : "out";
  const l = String(layer),
    scope = `${l},t`,
    input = qwenStateName(layer, part),
    output = qwenStateName(layer, next);
  const norm = `\\bar H^${tag}_{${scope}}`,
    flat = `u^${tag}_{${scope}}`,
    gates = `G^${tag}_{${scope}}`,
    write = `q^${tag}_{${scope}}`,
    x = `x^${tag}_{${scope}}`,
    o = `o^${tag}_{${scope}}`;
  const stages: Stage[] = [],
    links: RecipeLink[] = [];
  const id = (suffix: string) => `${prefix}-${suffix}`;
  const add = (
    suffix: string,
    title: string,
    body: Stage["body"],
    output: string,
    width: number,
  ) =>
    stages.push({
      id: id(suffix),
      title: `${tag === "A" ? "Attention" : tag === "F" ? "FFN" : "末端只读"} GR · ${title}`,
      body,
      output,
      width,
      inlinePorts: true,
    });
  const edge = (source: string, target: string, tex: string) =>
    links.push({ source: id(source), target: id(target), tex });
  const normMatrix = (direction?: "in" | "out", trace?: string) => (
    <Matrix
      name={norm}
      shape={"4\\times2560"}
      rows={lanes.map(String)}
      columns={features}
      direction={direction}
      trace={trace}
      tone="green"
      element={(j, d) => `\\bar h^${tag}_{${l},${j},t,${d}}`}
    />
  );
  const gateMatrix = (direction?: "in" | "out") => (
    <Matrix
      name={gates}
      shape={"4\\times2560"}
      rows={lanes.map(String)}
      columns={features}
      direction={direction}
      tone="mint"
      element={(j, d) => `g^${tag}_{${l},${j},t,${d}}`}
    />
  );
  add(
    "norm",
    tag === "O"
      ? "最后四路各自归一化，供只读汇合"
      : "四路各自归一化；保留原始四路旁路",
    <ObjectConnections
      links={lanes.flatMap((j) => [
        { from: "norm-source", to: `norm-input-${j}` },
        { from: `norm-output-${j}`, to: "norm-joined" },
      ])}
    >
      <p className="architecture-note">
        <M
          tex={`\\gamma^{${tag},GR}_{${l},j,d}=1+w^{${tag},GR}_{${l},j,d},\\quad j=1,2,3,4`}
        />{" "}
        · 参数按路分开；均方与缩放使用 FP32，再转回输入类型。
      </p>
      <QwenState layer={layer} part={part} direction="in" trace="norm-source" />
      <div style={{ marginTop: 48 }}>
        <Columns>
          {lanes.map((j) => (
            <div key={j} className="architecture-cache-branch">
              <Rms
                input={`h^{${part}}_{${l},${j},t}`}
                output={`\\bar h^${tag}_{${l},${j},t}`}
                size={2560}
                gamma={`\\gamma^{${tag},GR}_{${l},${j}}`}
                eps={1e-6}
                inputTone="blue"
                outputTone="green"
                inputTrace={`norm-input-${j}`}
                outputTrace={`norm-output-${j}`}
                gammaTitle="本路缩放参数 · 跨 token 共用"
                compact
              />
            </div>
          ))}
        </Columns>
      </div>
      <div style={{ marginTop: 48 }}>
        <Flow>
          {[
            normMatrix("out", "norm-joined"),
            <div className="architecture-object" key="flattened">
              <p className="architecture-caption">
                按路顺序沿特征轴拼接；元素不变
              </p>
              <RecipePort tex={flat} direction="out">
                <section
                  className="tensor"
                  data-expanded-tensor
                  style={{ borderColor: tonePalette("green").color }}
                >
                  <header>
                    <M tex={flat} />
                    <small>
                      <M tex="1\times10240" />
                    </small>
                  </header>
                  <Columns>
                    {lanes.map((j) => (
                      <Row
                        key={j}
                        name={`\\bar h^${tag}_{${l},${j},t}`}
                        size={2560}
                        tone="green"
                        element={(d) => `\\bar h^${tag}_{${l},${j},t,${d}}`}
                      />
                    ))}
                  </Columns>
                </section>
              </RecipePort>
            </div>,
          ]}
        </Flow>
      </div>
      <p className="architecture-note">
        <M
          tex={`u^${tag}_{${l},t,(j-1)2560+d}=\\bar h^${tag}_{${l},j,t,d},\\quad d=1,\\ldots,2560`}
        />
      </p>
    </ObjectConnections>,
    `${norm},${flat}`,
    3000,
  );
  add(
    "read-gates",
    "低秩 320 维生成四条逐元素读门",
    <>
      <Project
        input={flat}
        weight={`W^{${tag},read,down}_{${l}}`}
        output={`a^${tag}_{${scope}}`}
        from={10240}
        to={320}
        inputPort
        tone="teal"
      />
      <Flow>
        {[
          <Operation
            key="activation"
            tex={`b^${tag}_{${scope}}=\\operatorname{SiLU}(a^${tag}_{${scope}}/4),\\quad \\operatorname{SiLU}(z)=z\\odot\\sigma(z)`}
          />,
          <Row key="b" name={`b^${tag}_{${scope}}`} size={320} tone="mint" />,
        ]}
      </Flow>
      <Project
        input={`b^${tag}_{${scope}}`}
        weight={`W^{${tag},read,up}_{${l}}`}
        output={`c^${tag}_{${scope}}`}
        from={320}
        to={10240}
        tone="teal"
        inputTone="mint"
      />
      <Down label="逐元素 sigmoid 后按原路顺序重排 4 × 2560" />
      {gateMatrix("out")}
      <p className="architecture-note">
        <M
          tex={`g^${tag}_{${l},j,t,d}=\\sigma(c^${tag}_{${l},t,(j-1)2560+d})`}
        />{" "}
        · 每个元素有自己的门值。
      </p>
    </>,
    gates,
    1250,
  );
  edge("norm", "read-gates", flat);
  add(
    "read",
    "四路逐元素加权，再除以 4",
    <>
      <Columns>{[normMatrix("in"), gateMatrix("in")]}</Columns>
      <Sum
        termSelector="[data-read-product] [data-expanded-tensor]"
        inputs={lanes.map((j) => (
          <div key={j} className="architecture-cache-branch">
            <p className="architecture-caption">第 {j} 路</p>
            <div className="architecture-equation">
              <Row name={`g^${tag}_{${l},${j},t}`} size={2560} tone="mint" />
              <span className="architecture-operator">⊙</span>
              <Row
                name={`\\bar h^${tag}_{${l},${j},t}`}
                size={2560}
                tone="green"
              />
            </div>
            <Down />
            <div data-read-product>
              <Row
                name={`p^${tag}_{${l},${j},t}`}
                size={2560}
                tone="cyan"
                element={(d) =>
                  `g^${tag}_{${l},${j},t,${d}}\\bar h^${tag}_{${l},${j},t,${d}}`
                }
              />
            </div>
          </div>
        ))}
        result={<Row name={`p^${tag}_{${scope}}`} size={2560} tone="cyan" />}
      />
      <div className="architecture-equation">
        <div className="architecture-fraction">
          <Row name={`p^${tag}_{${scope}}`} size={2560} tone="cyan" />
          <M tex="4" />
        </div>
        <span className="architecture-operator">=</span>
        <Row name={x} size={2560} tone="blue" direction="out" />
      </div>
    </>,
    x,
    2900,
  );
  edge("norm", "read", norm);
  edge("read-gates", "read", gates);
  if (tag === "O")
    return {
      stages,
      links,
      ports: { input, output: x, childInput: x, childOutput: o },
      ids: { norm: id("norm"), read: id("read"), write: id("write") },
    };
  add(
    "write-gates",
    "另一路投影生成四个标量写门",
    <>
      <Project
        input={flat}
        weight={`W^{${tag},write}_{${l}}`}
        output={`v^${tag}_{${scope}}`}
        from={10240}
        to={4}
        inputPort
        tone="plum"
      />
      <Down label="先除以 4，再 sigmoid，最后乘 2" />
      <Row name={write} size={4} tone="rose" direction="out" />
      <Columns>
        {lanes.map((j) => (
          <Operation
            key={j}
            tex={`q^${tag}_{${l},t,${j}}=2\\sigma(v^${tag}_{${l},t,${j}}/4)`}
          />
        ))}
      </Columns>
    </>,
    write,
    1500,
  );
  edge("norm", "write-gates", flat);
  add(
    "write",
    "同一子层输出按四个写门，分别加回原始四路",
    <>
      <Columns>
        {[
          <QwenState key="h" layer={layer} part={part} direction="in" />,
          <Row key="q" name={write} size={4} tone="rose" direction="in" />,
          <Row key="o" name={o} size={2560} tone="coral" direction="in" />,
        ]}
      </Columns>
      <Columns>
        {lanes.map((j) => (
          <div key={j} className="architecture-cache-branch">
            <p className="architecture-caption">
              第 {j} 路 · 同一个输出 o，独立写门
            </p>
            <div className="architecture-equation">
              <Scalar tex={`q^${tag}_{${l},t,${j}}`} tone="rose" />
              <span className="architecture-operator">×</span>
              <Row name={o} size={2560} tone="coral" />
            </div>
            <Down />
            <Sum
              inputs={[
                <Row
                  key="original"
                  name={`h^{${part}}_{${l},${j},t}`}
                  size={2560}
                  tone="blue"
                  title="未经归一化的原始路"
                />,
                <Row
                  key="injected"
                  name={`z^${tag}_{${l},${j},t}`}
                  size={2560}
                  tone="cyan"
                  element={(d) =>
                    `q^${tag}_{${l},t,${j}}o^${tag}_{${l},t,${d}}`
                  }
                />,
              ]}
              result={
                <Row
                  name={`h^{${next}}_{${l},${j},t}`}
                  size={2560}
                  tone="blue"
                />
              }
            />
          </div>
        ))}
      </Columns>
      <Down label="四路各自保留，组成下一状态" />
      <QwenState layer={layer} part={next} direction="out" />
      <p className="architecture-note">
        <M
          tex={`h^{${next}}_{${l},j,t,d}=h^{${part}}_{${l},j,t,d}+q^${tag}_{${l},t,j}o^${tag}_{${l},t,d}`}
        />
      </p>
    </>,
    output,
    3000,
  );
  edge("write-gates", "write", write);
  return {
    stages,
    links,
    ports: { input, output, childInput: x, childOutput: o },
    ids: { norm: id("norm"), read: id("read"), write: id("write") },
  };
}

export function qwenCoreRecipe(phase: Phase, layer: number): Recipe {
  const attention =
    layerArchitecture("qwen38", layer).attention === "gdn"
      ? qwenGdnRecipe(phase, layer)
      : qwenQsaRecipe(phase, layer);
  const a = qwenResidualStages(layer, "A"),
    f = qwenResidualStages(layer, "F"),
    moe = qwenMoeRecipe(layer);
  const stages: Stage[] = [
    {
      id: "input",
      title: `Layer ${layer} · 四路残差进入本层主路径`,
      body: (
        <>
          {layer > 2 ? (
            <>
              <Flow>
                {[
                  <QwenState key="previous" layer={layer - 1} part="out" />,
                  <QwenState
                    key="current"
                    layer={layer}
                    part="in"
                    direction="out"
                  />,
                ]}
              </Flow>
              <p className="architecture-note">
                <M
                  tex={`h^{in}_{${layer},j,t,d}=h^{out}_{${layer - 1},j,t,d}`}
                />{" "}
                · 四路逐元素原样传入本层。
              </p>
            </>
          ) : (
            <QwenState layer={layer} part="in" direction="out" />
          )}
          <p className="architecture-note">
            {phase === "prefill"
              ? "每个 token 独立做门控残差与 MoE；注意力遵循因果依赖。"
              : "固定当前 token t；递归状态与 K/V 缓存由各注意力分支独立维护。"}{" "}
          </p>
          <p className="architecture-note">
            GR 与 QSA 的普通 RMSNorm 使用 <M tex={"\\gamma=1+w"} />
            ；GDN 输出的 gated RMSNorm 使用直接学习的 γ。
          </p>
        </>
      ),
      output: a.ports.input,
      width: 1000,
      inlinePorts: true,
    },
  ];
  stages.push(...a.stages.filter((s) => s.id !== a.ids.write));
  stages.push(
    ...attention.stages
      .filter((s) => s.id !== "input")
      .map((s) => ({ ...s, id: `attention-${s.id}` })),
  );
  stages.push(a.stages.find((s) => s.id === a.ids.write)!);
  stages.push(
    ...f.stages.filter((s) => s.id !== f.ids.write),
    ...moe.stages,
    f.stages.find((s) => s.id === f.ids.write)!,
  );
  const links: RecipeLink[] = [
    ...a.links,
    ...f.links,
    ...moe.links,
    { source: "input", target: a.ids.norm, tex: a.ports.input },
    { source: "input", target: a.ids.write, tex: a.ports.input },
    ...attention.links.map((e) => ({
      ...e,
      source: e.source === "input" ? a.ids.read : `attention-${e.source}`,
      target: `attention-${e.target}`,
    })),
    {
      source: "attention-output",
      target: a.ids.write,
      tex: a.ports.childOutput,
    },
    { source: a.ids.write, target: f.ids.norm, tex: f.ports.input },
    { source: a.ids.write, target: f.ids.write, tex: f.ports.input },
    ...moe.inputs.map((target) => ({
      source: f.ids.read,
      target,
      tex: f.ports.childInput,
    })),
    { source: moe.output, target: f.ids.write, tex: f.ports.childOutput },
  ];
  if (layer === 1) {
    const input = qwenInputStages(phase);
    stages.splice(0, 1, ...input.stages);
    links.forEach((link) => {
      if (link.source === "input") link.source = "embedding-copy";
    });
    links.unshift(...input.links);
  }
  if (layer === 2) {
    const ple = qwenPleRecipe(phase);
    stages.splice(0, 1, ...ple.stages);
    links.forEach((link) => {
      if (link.source === "input") link.source = "ple-inject";
    });
    links.unshift(...ple.links);
  }
  if (layer === 48) {
    const last = qwenResidualStages(layer, "O");
    stages.push(...last.stages, {
      id: "lm-head",
      title: "末端读出直接投影到 248320 个词表 logits",
      width: 1250,
      inlinePorts: true,
      output: "z_t",
      body: (
        <>
          <Project
            input={last.ports.output}
            weight="W^{LM}"
            output="z_t"
            from={2560}
            to={248320}
            inputPort
            tone="coral"
            inputTone="blue"
          />
          <p className="architecture-note">
            <M tex="z_{t,v}=\sum_{d=1}^{2560}x^O_{48,t,d}w^{LM}_{d,v},\quad v=1,\ldots,248320" />
          </p>
          <p className="architecture-note">
            词表列 v 对应 Token ID v−1。LM Head 与输入 embedding
            不共享参数；末端读出后没有额外 RMSNorm，也没有写回门。
          </p>
          <p className="architecture-note">
            {phase === "prefill"
              ? "每个保留位置有一行 logits；生成通常只保留末位置的输出。"
              : "当前一行 logits 交给生成策略，选择下一 token；策略不属于 LM Head。"}
          </p>
        </>
      ),
    });
    links.push(
      ...last.links,
      { source: f.ids.write, target: last.ids.norm, tex: last.ports.input },
      { source: last.ids.read, target: "lm-head", tex: last.ports.output },
    );
  }
  return {
    introduction:
      "Qwen3.8-Flash-Next · 第 1 层从文本 ID 查表开始，第 2 层先执行 PLE 注入；第 48 层之后为只读 GR 与独立 LM Head。",
    exportName: `Qwen3.8-Flash-Next-L${layer}-${phase}`,
    stages,
    links,
    references: attention.references,
  };
}
