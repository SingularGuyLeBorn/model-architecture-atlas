import type { Recipe, Stage, RecipeLink, Phase } from "./recipes";
import { MathFormula as M } from "../components/diagram-primitives";
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
export function qwenResidualStages(layer: number, tag: "A" | "F") {
  const prefix = tag === "A" ? "attn-gr" : "ffn-gr",
    part = tag === "A" ? "in" : "mid",
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
      title: `${tag === "A" ? "Attention" : "FFN"} GR · ${title}`,
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
    "四路各自归一化；保留原始四路旁路",
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
            <Row
              key="flat"
              name={flat}
              size={10240}
              tone="green"
              direction="out"
              element={(d) =>
                d === "2560"
                  ? `\\bar h^${tag}_{${l},1,t,2560}`
                  : `(${flat})_{${d}}`
              }
            />,
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
    1600,
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
          <QwenState layer={layer} part="in" direction="out" />
          <p className="architecture-note">
            {phase === "prefill"
              ? "每个 token 独立做门控残差与 MoE；注意力遵循因果依赖。"
              : "固定当前 token t；递归状态与 K/V 缓存由各注意力分支独立维护。"}{" "}
            四路均来自上一层；第 1 层由同一个输入 embedding 复制四份。
          </p>
          <p className="architecture-note">
            GR 与 QSA 的普通 RMSNorm 使用 <M tex={"\\gamma=1+w"} />
            ；GDN 输出的 gated RMSNorm 使用直接学习的 γ。
          </p>
        </>
      ),
      output: a.ports.input,
      width: 1300,
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
  if (layer === 2) {
    const ple = qwenPleRecipe(phase);
    stages.splice(0, 1, ...ple.stages);
    links.forEach((link) => {
      if (link.source === "input") link.source = "ple-inject";
    });
    links.unshift(...ple.links);
  }
  return {
    introduction:
      "Qwen3.8-Flash-Next · 四路门控残差与 Attention/MoE 主路径；第 2 层先执行 PLE 注入。模型输入与末端读取另行展开。",
    exportName: `Qwen3.8-Flash-Next-L${layer}-GR-core-${phase}`,
    stages,
    links,
    references: attention.references,
  };
}
