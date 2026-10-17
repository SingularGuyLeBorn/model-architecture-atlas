import {
  MathFormula as M,
  type DiagramTone,
} from "../components/diagram-primitives";
import { ObjectConnections } from "../components/ObjectConnections";
import { RecipePort } from "./RecipePorts";
import { Down } from "./structure-blocks";
import {
  Row,
  Matrix,
  Columns,
  Flow,
  Operation,
  Project,
  Scalar,
} from "./architecture-blocks";
import { dsaSelectionShape } from "./deepseek-selection";
import {
  IndexKeyNorm,
  IndexTransform,
  IndexYarnFrequencies,
} from "./deepseek-index-transform";
import type { Phase, RecipeLink, Stage } from "./recipes";

export const DSA_IMPLEMENTATION =
  "https://github.com/deepseek-ai/DeepSeek-V3.2-Exp/blob/87e509a2e5a100d221c97df52c6e8be7835f0057/inference/model.py";
export const DSA_KERNEL =
  "https://github.com/deepseek-ai/DeepSeek-V3.2-Exp/blob/87e509a2e5a100d221c97df52c6e8be7835f0057/inference/kernel.py";
export const DSA_HADAMARD =
  "https://github.com/Dao-AILab/fast-hadamard-transform/blob/e7706faf8d1c3b9f241e36860640ad1dac644ede/fast_hadamard_transform/fast_hadamard_transform_interface.py";
const reps = (last: number | string) => ["1", "2", "…", String(last)];

/** 一个 128 元 block 的动态 UE8M0 scale；整条行共同除以此标量。 */
export function IndexFp8Row({
  input,
  output,
  scale,
  tone,
}: {
  input: string;
  output: string;
  scale: string;
  tone: DiagramTone;
}) {
  return (
    <div data-dsa-quant-row>
      <p className="architecture-note">
        <M tex={`u_d:=(${input})_d,\\quad d=1,\\ldots,128`} />
      </p>
      <ObjectConnections
        links={[
          { from: "fp8-scale", to: "fp8-denominator", direction: "down-left" },
        ]}
      >
        <Flow>
          {[
            <Row key="input" name={input} size={128} tone={tone} />,
            <Operation
              key="amax"
              tex={"a=\\max(10^{-4},\\max_{d=1}^{128}|u_d|)"}
              label="整条 128 维行的绝对值最大值"
            />,
            <div key="scale" data-trace-object="fp8-scale">
              <Scalar
                tex={`${scale}=2^{\\lceil\\log_2(a/448)\\rceil}`}
                tone="ochre"
              />
            </div>,
          ]}
        </Flow>
        <div className="dsa-quant-result architecture-equation">
          <div className="architecture-fraction">
            <Row name={input} size={128} tone={tone} />
            <div data-trace-object="fp8-denominator">
              <Scalar tex={scale} tone="ochre" />
            </div>
          </div>
          <span className="architecture-arrow">→</span>
          <Operation
            tex={"\\operatorname{FP8}_{E4M3FN}"}
            label="限幅 [−448,448] 后舍入"
          />
          <span className="architecture-arrow">→</span>
          <Row name={output} size={128} tone={tone} />
        </div>
      </ObjectConnections>
      <p className="architecture-note">
        <M tex={`(${input})_d\\approx ${scale}\\cdot(${output})_d`} /> ·
        同一个系数恢复本行全部 128 个数；量化有舍入误差。
      </p>
    </div>
  );
}

export function deepseekIndexStages(
  phase: Phase,
  layer: number,
): { stages: Stage[]; links: RecipeLink[] } {
  const l = String(layer),
    n = dsaSelectionShape(phase).length;
  const x = `x_{${l},t}`,
    qr = `q^{low}_{${l},t}`;
  const Q = `Q^{IH}_{${l},t}`,
    q = `q^{IH}_{${l},h,t}`,
    k = `k^{IH}_{${l},t}`;
  const rawQ = `\\widetilde Q^I_{${l},t}`,
    normalizedK = `\\bar k^I_{${l},t}`;
  const Q8 = `Q^{I8}_{${l},t}`,
    q8 = `q^{I8}_{${l},h,t}`,
    k8 = `k^{I8}_{${l},t}`;
  const sq = `\\sigma^Q_{${l},t}`,
    sk = `\\sigma^K_{${l},t}`;
  const K8 = `K^{I8}_{${l},\\le ${n}}`,
    SK = `S^K_{${l},\\le ${n}}`;
  const beta = `\\beta^I_{${l},t}`,
    score = `s^I_{${l},t}`;
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
  const heads = (name: string, stem: string, direction?: "in" | "out") => (
    <Matrix
      name={name}
      shape={"64\\times128"}
      rows={reps(64)}
      columns={reps(128)}
      tone="blue"
      direction={direction}
      element={(h, d) => `${stem}_{${l},${h},t,${d}}`}
    />
  );
  add(
    "index-query",
    "DSA · 独立 Query 升维 → 64 个索引 Head",
    <>
      <Project
        input={qr}
        weight={`W^{IQ}_{${l}}`}
        output={`q^{Icat}_{${l},t}`}
        from={1536}
        to={8192}
        inputPort
        tone="blue"
      />
      <Down label="每连续 128 个元素分成一个 Head；只改形状" />
      <Columns>
        {[
          <Matrix
            key="heads"
            name={`\\widetilde Q^I_{${l},t}`}
            shape={"64\\times128"}
            rows={reps(64)}
            columns={reps(128)}
            tone="blue"
            direction="out"
            element={(h, d) => `\\widetilde q^I_{${l},${h},t,${d}}`}
          />,
          <div key="transform">
            <p className="architecture-note">
              <M
                tex={`\\widetilde q^I_{${l},h,t,d}=q^{Icat}_{${l},t,128(h-1)+d}`}
              />
            </p>
          </div>,
        ]}
      </Columns>
    </>,
    rawQ,
    1150,
  );
  add(
    "index-key",
    "DSA · 每个 token 一条索引 Key，与主 MLA 缓存独立",
    <>
      <Project
        input={x}
        weight={`W^{IK}_{${l}}`}
        output={`\\widetilde k^I_{${l},t}`}
        from={7168}
        to={128}
        inputPort
        tone="green"
      />
      <Down label="128 维 Key 进入本行 LayerNorm" />
      <IndexKeyNorm layer={layer} />
    </>,
    normalizedK,
    1200,
  );
  add(
    "index-rotate-q",
    "DSA Query · 半段配对 RoPE → 固定 Hadamard",
    <>
      <IndexYarnFrequencies />
      <IndexTransform
        input={`\\widetilde q^I_{${l},h,t}`}
        output={q}
        tone="blue"
        headInput={heads(rawQ, "\\widetilde q^I", "in")}
        headOutput={heads(Q, "q^{IH}", "out")}
      />
    </>,
    Q,
    1700,
  );
  add(
    "index-rotate-k",
    "DSA Key · 半段配对 RoPE → 固定 Hadamard",
    <>
      <IndexYarnFrequencies />
      <IndexTransform
        input={normalizedK}
        output={k}
        tone="green"
        inputPort
        outputPort
      />
    </>,
    k,
    1700,
  );
  edge("index-query", "index-rotate-q", rawQ);
  edge("index-key", "index-rotate-k", normalizedK);
  add(
    "index-quant",
    "DSA · 每条 128 维行对应一个 scale：Query 按 Head，Key 按 token",
    <>
      <Columns>
        {[
          <section key="q" className="dsa-index-branch">
            <h4>Query · 当前 token 的 64 个 Head</h4>
            {heads(Q, "q^{IH}", "in")}
            <Down label="固定 Head h；其余 Head 使用同构计算" />
            <IndexFp8Row
              input={q}
              output={q8}
              scale={`\\sigma^Q_{${l},h,t}`}
              tone="blue"
            />
            <Down label="FP8 元素与各 Head 的系数分别输出" />
            <Columns>
              {[
                heads(Q8, "q^{I8}", "out"),
                <Row
                  key="scales"
                  name={sq}
                  size={64}
                  tone="ochre"
                  direction="out"
                  element={(h) => `\\sigma^Q_{${l},${h},t}`}
                  title="64 个系数 · 一个 Head 一个"
                />,
              ]}
            </Columns>
          </section>,
          <section key="k" className="dsa-index-branch">
            <h4>Key · 当前 token 的单条索引行</h4>
            <Row name={k} size={128} tone="green" direction="in" />
            <Down label="本行独立确定系数" />
            <IndexFp8Row input={k} output={k8} scale={sk} tone="green" />
            <Down label="同一 token 的数值与系数配对写入" />
            <Columns>
              {[
                <Row
                  key="k"
                  name={k8}
                  size={128}
                  tone="green"
                  direction="out"
                />,
                <Row
                  key="scale"
                  name={sk}
                  size={1}
                  tone="ochre"
                  direction="out"
                  element={() => sk}
                />,
              ]}
            </Columns>
          </section>,
        ]}
      </Columns>
    </>,
    Q8,
    1900,
  );
  edge("index-rotate-q", "index-quant", Q);
  edge("index-rotate-k", "index-quant", k);
  add(
    "index-cache",
    "DSA · 索引值与系数同号写入，两张缓存保持 token 行对齐",
    <>
      <p className="architecture-note">
        {phase === "prefill"
          ? "完整 Prefill：各 token 写入自己的位置；图中跟踪第 t 行，其余行同构生成。"
          : "Decode：保留本层历史 1…t−1，只追加当前 t 行；没有滑窗淘汰。"}
      </p>
      <Columns>
        {[
          {
            name: K8,
            current: k8,
            width: 128,
            tone: "green" as const,
            element: (j: string, d: string) => `k^{I8}_{${l},${j},${d}}`,
            inputElement: (d: string) => `k^{I8}_{${l},t,${d}}`,
          },
          {
            name: SK,
            current: sk,
            width: 1,
            tone: "ochre" as const,
            element: (j: string) => `\\sigma^K_{${l},${j}}`,
            inputElement: () => sk,
          },
        ].map((item, branch) => (
          <div key={item.name}>
            <ObjectConnections
              links={[
                {
                  from: `new-${branch}`,
                  to: `row-${branch}`,
                  direction: "right",
                },
              ]}
            >
              <div className="dsa-cache-map">
                <Row
                  name={item.current}
                  size={item.width}
                  tone={item.tone}
                  direction="in"
                  trace={`new-${branch}`}
                  element={item.inputElement}
                  title="当前新算的一行"
                />
                <Matrix
                  name={item.name}
                  shape={`${n}\\times${item.width}`}
                  rows={
                    phase === "prefill"
                      ? ["1", "2", "…", "t", "…", "N"]
                      : ["1", "2", "…", "t-1", "t"]
                  }
                  columns={item.width === 1 ? ["1"] : reps(128)}
                  tone={item.tone}
                  selected="t"
                  direction="out"
                  element={item.element}
                  rowTrace={(j) => (j === "t" ? `row-${branch}` : undefined)}
                  title={
                    item.width === 1
                      ? "scale 存储为 FP32；数值为 2 的整数次幂"
                      : "索引 Key 缓存 · FP8 E4M3FN"
                  }
                />
              </div>
            </ObjectConnections>
          </div>
        ))}
      </Columns>
    </>,
    K8,
    1200,
  );
  edge("index-quant", "index-cache", k8);
  edge("index-quant", "index-cache", sk);
  add(
    "index-weights",
    "DSA · 输入生成 Head 权重，合入 Query scale 和两项缩放",
    <>
      <ObjectConnections
        links={[{ from: "index-eta-out", to: "index-eta-in" }]}
      >
        <Project
          input={x}
          weight={`W^{I\\eta}_{${l}}`}
          output={`\\widetilde\\eta^I_{${l},t}`}
          from={7168}
          to={64}
          inputPort
          tone="amber"
          outputTrace="index-eta-out"
        />
        <div className="architecture-equation">
          <div className="architecture-fraction">
            <Row
              name={`\\widetilde\\eta^I_{${l},t}`}
              size={64}
              tone="amber"
              trace="index-eta-in"
            />
            <M tex={"\\sqrt{64}\\sqrt{128}"} />
          </div>
          <span className="architecture-operator">⊙</span>
          <Row
            name={sq}
            size={64}
            tone="ochre"
            direction="in"
            element={(h) => `\\sigma^Q_{${l},${h},t}`}
          />
          <span className="architecture-operator">=</span>
          <Row name={beta} size={64} tone="amber" direction="out" />
        </div>
      </ObjectConnections>
      <p className="architecture-note">
        <M
          tex={`\\beta^I_{${l},t,h}=\\frac{\\widetilde\\eta^I_{${l},t,h}\\sigma^Q_{${l},h,t}}{\\sqrt{64}\\sqrt{128}}`}
        />{" "}
        · Head 权重可正可负；这里没有 Softmax。
      </p>
    </>,
    beta,
    1200,
  );
  edge("index-quant", "index-weights", sq);
  add(
    "index",
    "DSA · FP8 点积 → Head 内 ReLU → Head 加权 → Key scale 恢复",
    <>
      <ObjectConnections
        links={[
          { from: "index-a-out", to: "index-a-in" },
          { from: "index-v-out", to: "index-v-in" },
        ]}
      >
        <div className="architecture-equation dsa-score-step" data-projection>
          {heads(Q8, "q^{I8}", "in")}
          <span className="architecture-operator">×</span>
          <RecipePort tex={K8} direction="in">
            <Matrix
              name={`(${K8})^\\top`}
              shape={`128\\times ${n}`}
              rows={reps(128)}
              columns={reps(n)}
              tone="green"
              element={(d, j) => `k^{I8}_{${l},${j},${d}}`}
              title="同一索引缓存转置读 · 每列一个原 token"
            />
          </RecipePort>
          <span className="architecture-operator">=</span>
          <Matrix
            name={`Z^I_{${l},t}`}
            shape={`64\\times ${n}`}
            rows={reps(64)}
            columns={reps(n)}
            tone="olive"
            element={(h, j) => `z^I_{${l},h,t,${j}}`}
          />
          <span className="architecture-arrow">→</span>
          <Operation tex={"\\operatorname{ReLU}"} label="逐元素取 max(0,z)" />
          <span className="architecture-arrow">→</span>
          <Matrix
            name={`A^I_{${l},t}`}
            trace="index-a-out"
            shape={`64\\times ${n}`}
            rows={reps(64)}
            columns={reps(n)}
            tone="olive"
            element={(h, j) => `a^I_{${l},h,t,${j}}`}
          />
        </div>
        <div className="architecture-equation dsa-score-step" data-projection>
          <Row name={beta} size={64} tone="amber" direction="in" />
          <span className="architecture-operator">×</span>
          <Matrix
            name={`A^I_{${l},t}`}
            trace="index-a-in"
            shape={`64\\times ${n}`}
            rows={reps(64)}
            columns={reps(n)}
            tone="olive"
            element={(h, j) => `a^I_{${l},h,t,${j}}`}
          />
          <span className="architecture-operator">=</span>
          <Row name={`v^I_{${l},t}`} size={n} tone="plum" trace="index-v-out" />
        </div>
        <div className="architecture-equation dsa-score-step" data-projection>
          <Row name={`v^I_{${l},t}`} size={n} tone="plum" trace="index-v-in" />
          <span className="architecture-operator">⊙</span>
          <RecipePort tex={SK} direction="in">
            <Row
              name={`(${SK})^\\top`}
              size={n}
              tone="ochre"
              element={(j) => `\\sigma^K_{${l},${j}}`}
              title="按原 token 列恢复幅值"
            />
          </RecipePort>
          <span className="architecture-operator">=</span>
          <Row name={score} size={n} tone="plum" direction="out" />
        </div>
      </ObjectConnections>
      <p className="architecture-note">
        <M
          tex={`z^I_{${l},h,t,j}=\\sum_{d=1}^{128}q^{I8}_{${l},h,t,d}k^{I8}_{${l},j,d},\\quad a^I_{${l},h,t,j}=\\max(0,z^I_{${l},h,t,j})`}
        />
      </p>
      <p className="architecture-note">
        <M
          tex={`s^I_{${l},t,j}=\\sigma^K_{${l},j}\\sum_{h=1}^{64}\\beta^I_{${l},t,h}a^I_{${l},h,t,j}`}
        />{" "}
        · 先对每个 Head 的点积做 ReLU，再沿 Head 轴加权；下面才进入因果掩码与
        Top-K。
      </p>
    </>,
    score,
    1550,
  );
  edge("index-quant", "index", Q8);
  edge("index-cache", "index", K8);
  edge("index-cache", "index", SK);
  edge("index-weights", "index", beta);
  return { stages, links };
}
