import type { ReactNode } from "react";
import {
  MathFormula as M,
  type DiagramTone,
} from "../components/diagram-primitives";
import { ObjectConnections } from "../components/ObjectConnections";
import { Down } from "./structure-blocks";
import {
  Columns,
  Flow,
  HalfRoPE,
  Matrix,
  Operation,
  Row,
  Scalar,
  Sum,
} from "./architecture-blocks";

/** 官方 128 点 Sylvester Hadamard：行列使用图中的一基索引。 */
export function indexHadamardSign(row: number, column: number) {
  let bits = (row - 1) & (column - 1),
    sign = 1;
  while (bits) {
    sign = -sign;
    bits &= bits - 1;
  }
  return sign;
}

export function IndexTransform({
  input,
  output,
  tone,
  inputPort = false,
  outputPort = false,
  headInput,
  headOutput,
}: {
  input: string;
  output: string;
  tone: DiagramTone;
  inputPort?: boolean;
  outputPort?: boolean;
  headInput?: ReactNode;
  headOutput?: ReactNode;
}) {
  // 局部短名仅缩短成对旋转的元素标签；入口显式绑定完整变量。
  const alias = tone === "blue" ? "u" : "v";
  const rotated = `${alias}^R`;
  return (
    <div data-dsa-transform>
      <div className="architecture-equation">
        {headInput && (
          <>
            {headInput}
            <span className="architecture-arrow">→</span>
          </>
        )}
        <div>
          <Row
            name={input}
            size={128}
            tone={tone}
            direction={inputPort ? "in" : undefined}
          />
          <p className="architecture-note">
            <M tex={`${alias}:=${input}`} />
          </p>
        </div>
      </div>
      <Down label="前 64 维按前后半段配对；其余 64 维直通" />
      <HalfRoPE
        input={alias}
        output={rotated}
        size={128}
        rotary={64}
        theta={10000}
        frequency={"\\omega^Y_j"}
        inputTone={tone}
        outputTone={tone}
      />
      <Down label="旋转后的 128 个数一起乘固定矩阵" />
      <div className="architecture-equation">
        <Row name={rotated} size={128} tone={tone} />
        <span className="architecture-operator">×</span>
        <div className="architecture-fraction">
          <Matrix
            name="H_{128}"
            shape={"128\\times128"}
            rows={["1", "2", "…", "128"]}
            columns={["1", "2", "…", "128"]}
            tone="slate"
            element={(r, c) => String(indexHadamardSign(Number(r), Number(c)))}
            title="固定 ±1 矩阵"
          />
          <M tex={"\\sqrt{128}"} />
        </div>
        <span className="architecture-operator">=</span>
        <Row
          name={output}
          size={128}
          tone={tone}
          direction={outputPort ? "out" : undefined}
        />
        {headOutput && (
          <>
            <span className="architecture-arrow">→</span>
            <div>
              <p className="architecture-caption">
                64 行分别变换，保留 Head 次序
              </p>
              {headOutput}
            </div>
          </>
        )}
      </div>
      <p className="architecture-note">
        <M tex={"H_{128}^{\\top}H_{128}=128I"} /> · 归一化后保持行的二范数。
      </p>
    </div>
  );
}

/** LayerNorm 有减均值和偏置；与主路径的 RMSNorm 分开表达。 */
export function IndexKeyNorm({ layer }: { layer: number }) {
  const z = `\\widetilde k^I_{${layer},t}`,
    out = `\\bar k^I_{${layer},t}`;
  const terms = [1, 2, 128];
  return (
    <div data-dsa-layernorm>
      <p className="architecture-note">
        <M tex={`z_d:=(${z})_d,\\quad d=1,\\ldots,128`} />
      </p>
      <ObjectConnections
        links={[
          { from: "ln-mean", to: "ln-centered", direction: "right" },
          { from: "ln-r", to: "ln-divisor", direction: "down-left" },
        ]}
      >
        <Columns>
          {[
            <section key="mean" className="dsa-index-branch" data-route-frame>
              <h4>① 本行均值</h4>
              <Sum
                ellipsis
                termSelector=".data-box"
                inputs={terms.map((d) => (
                  <Scalar tex={`z_{${d}}`} tone="green" />
                ))}
                result={
                  <div data-trace-object="ln-mean">
                    <Scalar
                      tex={"\\mu=\\frac{\\sum_{d=1}^{128}z_d}{128}"}
                      tone="ochre"
                    />
                  </div>
                }
              />
            </section>,
            <section
              key="variance"
              className="dsa-index-branch"
              data-route-frame
            >
              <h4>② 减均值后求方差</h4>
              <div data-trace-object="ln-centered">
                <Scalar tex={"\\mu"} tone="ochre" />
              </div>
              <Down label="同一个均值用于本行每个元素" />
              <Sum
                ellipsis
                termSelector=".data-box"
                inputs={terms.map((d) => (
                  <Scalar tex={`(z_{${d}}-\\mu)^2`} tone="cyan" />
                ))}
                result={
                  <Scalar
                    tex={"v=\\frac{\\sum_{d=1}^{128}(z_d-\\mu)^2}{128}"}
                    tone="ochre"
                  />
                }
              />
              <Down />
              <div data-trace-object="ln-r">
                <Scalar tex={"r=\\sqrt{v+10^{-6}}"} tone="ochre" />
              </div>
            </section>,
          ]}
        </Columns>
        <div className="dsa-quant-result">
          <Sum
            inputs={[
              <div className="architecture-equation" key="weighted">
                <div className="architecture-fraction">
                  <Row
                    name={"z-\\mu"}
                    size={128}
                    tone="cyan"
                    element={(d) => `z_{${d}}-\\mu`}
                  />
                  <div data-trace-object="ln-divisor">
                    <Scalar tex="r" tone="ochre" />
                  </div>
                </div>
                <span className="architecture-operator">⊙</span>
                <Row
                  name={`\\gamma^{IK}_{${layer}}`}
                  size={128}
                  tone="crimson"
                  title="本层独立缩放参数"
                />
                <span className="architecture-operator">=</span>
                <div data-dsa-ln-summand>
                  <Row
                    name="w"
                    size={128}
                    tone="cyan"
                    element={(d) => `w_{${d}}`}
                  />
                </div>
              </div>,
              <div key="bias" data-dsa-ln-summand>
                <Row
                  name={`b^{IK}_{${layer}}`}
                  size={128}
                  tone="sand"
                  title="本层独立偏置参数"
                />
              </div>,
            ]}
            termSelector="[data-dsa-ln-summand] [data-expanded-tensor]"
            result={<Row name={out} size={128} tone="green" direction="out" />}
          />
        </div>
      </ObjectConnections>
    </div>
  );
}

export function IndexYarnFrequencies() {
  return (
    <Flow>
      {[
        <Columns key="independent">
          {[
            <Operation
              key="base"
              tex={"\\omega^0_j=10000^{-2(j-1)/64}"}
              label="j = 1,…,32"
            />,
            <Operation
              key="ramp"
              tex={
                "\\rho_j=\\operatorname{clip}\\!\\left(\\frac{j-1-10}{23-10},0,1\\right)"
              }
              label="原长度 4096 · βfast=32 · βslow=1"
            />,
          ]}
        </Columns>,
        <Operation
          key="freq"
          tex={"\\omega^Y_j=\\omega^0_j[(1-\\rho_j)+\\rho_j/40]"}
          label="两项共同确定频率；Query 与 Key 共用"
        />,
      ]}
    </Flow>
  );
}
