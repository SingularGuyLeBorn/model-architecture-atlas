import type { Stage, RecipeLink } from "./recipes";
import { MathFormula as M } from "../components/diagram-primitives";
import { Down } from "./structure-blocks";
import {
  Row,
  Matrix,
  Columns,
  Flow,
  Project,
  Operation,
  Sum,
  Scalar,
  SwiGlu,
} from "./architecture-blocks";
import { ObjectConnections } from "../components/ObjectConnections";
import { exponentialTex } from "../components/exponential-notation";

/** 固定 token t；三条完整代表专家分支保留第 1、2、10 个选择槽。 */
export function qwenMoeRecipe(layer: number) {
  const l = String(layer),
    x = `x^F_{${l},t}`,
    r = `r^R_{${l},t}`,
    p = `p^R_{${l},t}`,
    ids = `E_{${l},t}`,
    alpha = `\\alpha_{${l},t}`;
  const stages: Stage[] = [],
    links: RecipeLink[] = [];
  const add = (
    id: string,
    title: string,
    body: Stage["body"],
    output: string,
    width: number,
  ) =>
    stages.push({
      id: `moe-${id}`,
      title,
      body,
      output,
      width,
      inlinePorts: true,
    });
  const edge = (from: string, to: string, tex: string) =>
    links.push({ source: `moe-${from}`, target: `moe-${to}`, tex });
  const slots = [1, 2, 10];
  add(
    "router",
    "MoE Router · 2560 → 512，全部专家分数做 Softmax",
    <>
      <Project
        input={x}
        weight={`W^R_{${l}}`}
        output={r}
        from={2560}
        to={512}
        inputPort
        tone="plum"
      />
      <Down label="FP32 Softmax；每个 token 独立归一化" />
      <div className="architecture-probability-grid">
        <Sum
          ellipsis
          termSelector="[data-router-exponential]"
          inputs={[1, 2, 512].map((e) => (
            <div key={e} data-router-exponential>
              <M tex={exponentialTex(`r^R_{${l},t,${e}}`)} />
            </div>
          ))}
          result={<Scalar tex={`D^R_{${l},t}`} tone="gold" />}
        />
        <div>
          <Columns>
            {[1, 2, 512].map((e) => (
              <div key={e} className="architecture-equation">
                <M
                  tex={`\\frac{${exponentialTex(`r^R_{${l},t,${e}}`)}}{D^R_{${l},t}}`}
                />
                <span className="architecture-operator">=</span>
                <Scalar tex={`p^R_{${l},t,${e}}`} tone="orange" />
              </div>
            ))}
          </Columns>
          <Row name={p} size={512} tone="orange" direction="out" />
        </div>
      </div>
    </>,
    p,
    1500,
  );
  add(
    "select",
    "512 选 10 · 专家编号与归一化权重成对保留",
    <>
      <Row
        name={p}
        size={512}
        tone="orange"
        direction="in"
        columns={["1", "2", "…", "e_1", "e_2", "…", "e_{10}", "…", "512"]}
        selectedColumns={["e_1", "e_2", "e_{10}"]}
      />
      <Down label="取概率最大的 10 项；选择槽 j 与原专家号 eⱼ 分开" />
      <Row
        name={ids}
        size={10}
        columns={["1", "2", "…", "10"]}
        tone="amber"
        direction="out"
        element={(j) => `e_{${j}}`}
      />
      <div className="architecture-probability-grid">
        <Sum
          ellipsis
          termSelector=".data-box"
          inputs={slots.map((j) => (
            <Scalar key={j} tex={`p^R_{${l},t,e_{${j}}}`} tone="orange" />
          ))}
          result={<Scalar tex={`D^{top}_{${l},t}`} tone="gold" />}
        />
        <div>
          <Columns>
            {slots.map((j) => (
              <div key={j} className="architecture-equation">
                <M tex={`\\frac{p^R_{${l},t,e_{${j}}}}{D^{top}_{${l},t}}`} />
                <span className="architecture-operator">=</span>
                <Scalar tex={`\\alpha_{${l},t,${j}}`} tone="gold" />
              </div>
            ))}
          </Columns>
          <Row name={alpha} size={10} tone="gold" direction="out" />
        </div>
      </div>
      <p className="architecture-note">
        只对这 10 项重新归一化，权重转回 Router logits
        的数据类型；每个权重始终配对同槽专家。
      </p>
    </>,
    `${ids},${alpha}`,
    1500,
  );
  edge("router", "select", p);
  slots.forEach((j) => {
    const e = `e_{${j}}`,
      out = `f_{${l},${e},t}`;
    add(
      `expert-${j}`,
      `第 ${j} 个选择槽 · 专家 e${j} 的完整 SwiGLU`,
      <>
        <ObjectConnections links={[{ from: "chosen", to: "expert" }]}>
          <Row
            name={ids}
            size={10}
            tone="amber"
            direction="in"
            selectedColumns={[String(j)]}
            columns={["1", "2", "…", "10"]}
            element={(c) => `e_{${c}}`}
            columnTrace={(c) => (c === String(j) ? "chosen" : undefined)}
          />
          <div className="architecture-gate-branches">
            <div className="architecture-id-anchor" data-trace-object="expert">
              <Scalar tex={e} tone="amber" />
            </div>
          </div>
        </ObjectConnections>
        <p className="architecture-note">
          由该专家号选参数；gate/up 为同一 fused 参数的两段列，下投影独立。
        </p>
        <SwiGlu
          input={x}
          output={out}
          hidden={2560}
          intermediate={640}
          scope={`${l},${e}`}
          inputPort
          outputPort
        />
      </>,
      out,
      2200,
    );
    edge("select", `expert-${j}`, ids);
  });
  add(
    "routed-sum",
    "十个路由专家 · 同槽权重乘同槽输出，再相加",
    <>
      <Row name={alpha} size={10} tone="gold" direction="in" />
      <Sum
        ellipsis
        termSelector="[data-expert-weighted] [data-expanded-tensor]"
        inputs={slots.map((j) => (
          <div key={j} className="architecture-cache-branch">
            <div className="architecture-equation">
              <Scalar tex={`\\alpha_{${l},t,${j}}`} tone="gold" />
              <span className="architecture-operator">×</span>
              <Row
                name={`f_{${l},e_{${j}},t}`}
                size={2560}
                tone="coral"
                direction="in"
              />
            </div>
            <Down />
            <div data-expert-weighted>
              <Row
                name={`z^R_{${l},${j},t}`}
                size={2560}
                tone="cyan"
                element={(d) => `\\alpha_{${l},t,${j}}f_{${l},e_{${j}},t,${d}}`}
              />
            </div>
          </div>
        ))}
        result={
          <Row name={`f^R_{${l},t}`} size={2560} tone="coral" direction="out" />
        }
      />
      <p className="architecture-note">
        <M
          tex={`f^R_{${l},t,d}=\\sum_{j=1}^{10}\\alpha_{${l},t,j}f_{${l},e_j,t,d}`}
        />
      </p>
    </>,
    `f^R_{${l},t}`,
    1800,
  );
  edge("select", "routed-sum", alpha);
  slots.forEach((j) =>
    edge(`expert-${j}`, "routed-sum", `f_{${l},e_{${j}},t}`),
  );
  add(
    "shared",
    "共享专家 · 所有 token 都进入，独立 sigmoid 门控制输出",
    <ObjectConnections
      links={[
        { from: "shared-source", to: "input" },
        { from: "shared-source", to: "shared-gate-in" },
        { from: "shared-output", to: "shared-multiply", direction: "right" },
        { from: "gate-output", to: "gate-multiply" },
      ]}
    >
      <Row
        name={x}
        size={2560}
        tone="blue"
        direction="in"
        trace="shared-source"
      />
      <div className="architecture-gate-branches qwen-shared-branches">
        <Columns>
          {[
            <div key="expert">
              <SwiGlu
                input={x}
                output={`f^S_{${l},t}`}
                hidden={2560}
                intermediate={640}
                scope={`${l},S`}
                outputTrace="shared-output"
              />
            </div>,
            <div key="gate" className="qwen-shared-control">
              <div>
                <Project
                  input={x}
                  weight={`w^{S,gate}_{${l}}`}
                  output={`c^S_{${l},t}`}
                  from={2560}
                  to={1}
                  inputTrace="shared-gate-in"
                  tone="plum"
                />
                <Down label="取唯一投影元素做 sigmoid" />
                <div
                  className="architecture-id-anchor"
                  data-trace-object="gate-output"
                >
                  <Scalar
                    tex={`\\beta^S_{${l},t}=\\sigma(c^S_{${l},t,1})`}
                    tone="rose"
                  />
                </div>
              </div>
              <div className="architecture-equation">
                <Row
                  name={`f^S_{${l},t}`}
                  size={2560}
                  tone="coral"
                  trace="shared-multiply"
                />
                <span className="architecture-operator">×</span>
                <div
                  className="architecture-id-anchor"
                  data-trace-object="gate-multiply"
                >
                  <Scalar tex={`\\beta^S_{${l},t}`} tone="rose" />
                </div>
                <span className="architecture-operator">=</span>
                <Row
                  name={`z^S_{${l},t}`}
                  size={2560}
                  tone="cyan"
                  direction="out"
                  element={(d) => `\\beta^S_{${l},t}f^S_{${l},t,${d}}`}
                />
              </div>
            </div>,
          ]}
        </Columns>
      </div>
    </ObjectConnections>,
    `z^S_{${l},t}`,
    3300,
  );
  add(
    "output",
    "路由专家与共享专家汇合 · 输出交给 FFN 写回门",
    <>
      <Sum
        inputs={[
          <Row
            key="routed"
            name={`f^R_{${l},t}`}
            size={2560}
            tone="coral"
            direction="in"
          />,
          <Row
            key="shared"
            name={`z^S_{${l},t}`}
            size={2560}
            tone="cyan"
            direction="in"
          />,
        ]}
        result={
          <Row name={`o^F_{${l},t}`} size={2560} tone="coral" direction="out" />
        }
      />
    </>,
    `o^F_{${l},t}`,
    1000,
  );
  edge("routed-sum", "output", `f^R_{${l},t}`);
  edge("shared", "output", `z^S_{${l},t}`);
  return {
    stages,
    links,
    inputs: [
      "moe-router",
      ...slots.map((j) => `moe-expert-${j}`),
      "moe-shared",
    ],
    output: "moe-output",
  };
}
