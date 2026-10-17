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
} from "./architecture-blocks";
import { layerArchitecture } from "../data/architecture-profiles";
import { RecipePort } from "./RecipePorts";
import { ObjectConnections } from "../components/ObjectConnections";
import "./architecture-blocks.css";

export const QWEN_IMPLEMENTATION =
  "https://github.com/huggingface/transformers/blob/d4804f9d76b8c071b993d813e9e87067b780cbee/src/transformers/models/qwen4_exp/modeling_qwen4_exp.py";
const reps = (n: number) => ["1", "2", "…", String(n)];

/** 固定本层一个 Value Head h；同构计算用于全部 48 个独立递归状态。 */
export function qwenGdnRecipe(phase: Phase, layer: number): Recipe {
  if (layerArchitecture("qwen38", layer).attention !== "gdn")
    throw new Error(`第 ${layer} 层是 QSA，不能使用 GDN 状态图`);
  const l = String(layer),
    scope = `${l},h,t`;
  const x = `x^A_{${l},t}`,
    fused = `c_{${l},t}`,
    conv = `u_{${l},t}`;
  const q = `q_{${scope}}`,
    k = `k_{${scope}}`,
    v = `v_{${scope}}`;
  const beta = `\\beta_{${scope}}`,
    rho = `\\rho_{${scope}}`;
  const z = `z_{${scope}}`,
    memory = `m_{${scope}}`,
    delta = `\\delta_{${scope}}`;
  const previous = `S_{${l},h,t-1}`,
    decayed = `\\bar S_{${scope}}`,
    state = `S_{${scope}}`;
  const increment = `D_{${scope}}`,
    output = `o_{${scope}}`,
    gated = `y_{${scope}}`;
  const stages: Stage[] = [],
    links: RecipeLink[] = [];
  const add = (
    id: string,
    title: string,
    body: Stage["body"],
    result: string,
    width = 1700,
  ) =>
    stages.push({ id, title, body, output: result, width, inlinePorts: true });
  const edge = (source: string, target: string, tex: string) =>
    links.push({ source, target, tex });
  const scalar = (name: string, tone: DiagramTone, direction: "in" | "out") => (
    <RecipePort tex={name} direction={direction}>
      <Scalar tex={name} tone={tone} />
    </RecipePort>
  );
  const stateMatrix = (
    name: string,
    tone: DiagramTone,
    direction?: "in" | "out",
  ) => (
    <Matrix
      name={name}
      shape={"128\\times128"}
      rows={reps(128)}
      columns={reps(128)}
      tone={tone}
      direction={direction}
      element={(r, c) => `(${name})_{${r},${c}}`}
    />
  );
  const headMatrix = (
    name: string,
    count: number,
    tone: DiagramTone,
    direction?: "in" | "out",
  ) => (
    <Matrix
      name={name}
      shape={`${count}\\times128`}
      rows={reps(count)}
      columns={reps(128)}
      tone={tone}
      direction={direction}
      element={(r, c) => `(${name})_{${r},${c}}`}
    />
  );
  add(
    "input",
    `Layer ${l} · GDN 的子层输入`,
    <>
      <p className="architecture-note">
        {phase === "prefill"
          ? "Prefill 按因果顺序更新；实现使用等价的分块计算。"
          : "Decode 从本层旧递归矩阵和短卷积状态继续一步。"}
      </p>
      <Row
        name={x}
        size={2560}
        tone="blue"
        direction="out"
        title="来自本层 Attention 门控残差的四路加权读取"
      />
      <p className="architecture-note">
        以下固定当前 token t。GDN 不使用 RoPE、Softmax 或逐 token 的长期 KV 表。
      </p>
    </>,
    x,
    1000,
  );
  add(
    "qkv",
    "内容投影 · Q/K/V 共用短卷积",
    <Project
      input={x}
      weight={`W^{qkv}_{${l}}`}
      output={fused}
      from={2560}
      to={10240}
      inputPort
      outputPort
      tone="green"
    />,
    fused,
  );
  edge("input", "qkv", x);
  add(
    "conv",
    "四个相邻位置 · 每个通道独立卷积",
    <>
      <ObjectConnections
        links={[{ from: "new-conv", to: "window-t", direction: "right" }]}
      >
        <div className="architecture-equation architecture-conv-inputs">
          <Row
            name={fused}
            size={10240}
            direction="in"
            tone="green"
            trace="new-conv"
          />
          <Matrix
            key="history"
            name={`C^{short}_{${l},t}`}
            shape={"4\\times10240"}
            rows={["t-3", "t-2", "t-1", "t"]}
            columns={reps(10240)}
            tone="green"
            selected="t"
            rowTrace={(r) => (r === "t" ? "window-t" : undefined)}
            element={(r, c) => `c_{${l},${r},${c}}`}
            title="前三行来自短状态；当前行来自本步投影，序列前补零"
          />
          <span className="architecture-operator">⊙</span>
          <Matrix
            name={`W^{conv}_{${l}}`}
            shape={"4\\times10240"}
            rows={["0", "1", "2", "3"]}
            columns={reps(10240)}
            tone="indigo"
            element={(r, c) => `w^{conv}_{${l},${r},${c}}`}
            title="沿时间求和，不混合通道"
          />
        </div>
      </ObjectConnections>
      <Down label="两矩阵按位置与通道对齐 · 下方展开四个乘积行" />
      <Sum
        inputs={[0, 1, 2, 3].map((j) => (
          <Row
            key={j}
            name={`w^{conv}_{${l},${j}}\\odot c_{${l},t-${3 - j}}`}
            size={10240}
            tone="cyan"
            element={(d) => `w^{conv}_{${l},${j},${d}}c_{${l},t-${3 - j},${d}}`}
          />
        ))}
        result={<Row name={`s^{conv}_{${l},t}`} size={10240} tone="cyan" />}
      />
      <Flow>
        {[
          <Operation
            key="silu"
            tex={`\\operatorname{SiLU}(s^{conv}_{${l},t})=s^{conv}_{${l},t}\\odot\\sigma(s^{conv}_{${l},t})`}
          />,
          <Row
            key="out"
            name={conv}
            size={10240}
            direction="out"
            tone="green"
          />,
        ]}
      </Flow>
      <p className="architecture-note">
        本图展开计算所需的四个位置；缓存后端的实际存储布局不等于这里的四行示意。
      </p>
    </>,
    conv,
    2400,
  );
  edge("qkv", "conv", fused);
  add(
    "split",
    "拆分 Q/K/V · 16 对 Q/K 分配给 48 个 Value Head",
    <>
      <Row
        name={conv}
        size={10240}
        direction="in"
        tone="green"
        columns={["1", "2048", "2049", "4096", "4097", "…", "10240"]}
      />
      <Down label="沿特征轴切成 2048 + 2048 + 6144" />
      <Columns>
        {[
          <div key="q">
            {headMatrix(`\\widehat Q_{${l},t}`, 16, "blue")}
            <Down label="每头 L2 归一化" />
            <Operation
              tex={`q_{${l},h,t}=\\widehat q_{${l},g,t}/\\sqrt{\\sum_{d=1}^{128}\\widehat q_{${l},g,t,d}^{2}+10^{-6}}`}
            />
            <Row name={q} size={128} tone="blue" direction="out" />
          </div>,
          <div key="k">
            {headMatrix(`\\widehat K_{${l},t}`, 16, "violet")}
            <Down label="每头 L2 归一化" />
            <Operation
              tex={`k_{${l},h,t}=\\widehat k_{${l},g,t}/\\sqrt{\\sum_{d=1}^{128}\\widehat k_{${l},g,t,d}^{2}+10^{-6}}`}
            />
            <Row name={k} size={128} tone="violet" direction="out" />
          </div>,
          <div key="v">
            {headMatrix(`V_{${l},t}`, 48, "coral")}
            <Down label="取第 h 头；V 不做 L2 归一化" />
            <Row name={v} size={128} tone="coral" direction="out" />
          </div>,
        ]}
      </Columns>
      <p className="architecture-note">
        <M tex={"g=\\lceil h/3\\rceil,\\quad h=1,\\ldots,48"} /> · 同一 Q/K
        依次供三个 Value Head 使用；三个递归矩阵仍各自独立。
      </p>
    </>,
    `${q},${k},${v}`,
    2100,
  );
  edge("conv", "split", conv);
  add(
    "gates",
    "三条独立门控投影 · 衰减、写入和输出各自计算",
    <ObjectConnections
      links={[
        { from: "gate-source", to: "gate-a" },
        { from: "gate-source", to: "gate-b" },
        { from: "gate-source", to: "gate-z" },
      ]}
    >
      <Row
        name={x}
        size={2560}
        direction="in"
        tone="blue"
        trace="gate-source"
      />
      <div className="architecture-gate-branches">
        <Columns>
          {[
            <div key="a">
              <Project
                input={x}
                weight={`W^a_{${l}}`}
                output={`a_{${l},t}`}
                from={2560}
                to={48}
                tone="amber"
                inputTrace="gate-a"
              />
              <Flow>
                {[
                  <Operation
                    key="formula"
                    tex={`${rho}=e^{-e^{A^{log}_{${l},h}}\\operatorname{softplus}(a_{${scope}}+d_{${l},h})}`}
                    label="A 与 d 是每头独立参数"
                  />,
                  <div key="rho">{scalar(rho, "amber", "out")}</div>,
                ]}
              </Flow>
            </div>,
            <div key="b">
              <Project
                input={x}
                weight={`W^b_{${l}}`}
                output={`b_{${l},t}`}
                from={2560}
                to={48}
                tone="gold"
                inputTrace="gate-b"
              />
              <Flow>
                {[
                  <Operation
                    key="formula"
                    tex={`${beta}=\\sigma(b_{${scope}})`}
                    label="写入强度"
                  />,
                  <div key="beta">{scalar(beta, "gold", "out")}</div>,
                ]}
              </Flow>
            </div>,
            <div key="z">
              <Project
                input={x}
                weight={`W^z_{${l}}`}
                output={`z_{${l},t}`}
                from={2560}
                to={6144}
                tone="rose"
                inputTrace="gate-z"
              />
              <Down label="输出门按 48 个 Head 重排" />
              {headMatrix(`Z_{${l},t}`, 48, "rose")}
              <Down label="取第 h 头" />
              <Row name={z} size={128} tone="rose" direction="out" />
            </div>,
          ]}
        </Columns>
      </div>
    </ObjectConnections>,
    `${rho},${beta},${z}`,
    3400,
  );
  edge("input", "gates", x);
  add(
    "decay",
    "① 先衰减旧状态 · 每头 128 × 128",
    <>
      <p className="architecture-note">
        本层第 h 头的 FP32 状态；无历史时 <M tex={`${previous}=0`} />。
      </p>
      <div className="architecture-equation">
        {scalar(rho, "amber", "in")}
        <span className="architecture-operator">×</span>
        {stateMatrix(previous, "ocean")}
        <span className="architecture-operator">=</span>
        {stateMatrix(decayed, "slate", "out")}
      </div>
    </>,
    decayed,
  );
  edge("gates", "decay", rho);
  add(
    "memory",
    "② 当前 Key 读取衰减后的旧记忆",
    <>
      <div className="architecture-equation">
        <Row name={k} size={128} tone="violet" direction="in" />
        <span className="architecture-operator">×</span>
        {stateMatrix(decayed, "slate", "in")}
        <span className="architecture-operator">=</span>
        <Row name={memory} size={128} tone="teal" direction="out" />
      </div>
    </>,
    memory,
  );
  edge("split", "memory", k);
  edge("decay", "memory", decayed);
  add(
    "delta",
    "③ 当前 Value − 旧记忆，再乘写入强度",
    <>
      <div className="architecture-equation">
        <Row name={v} size={128} tone="coral" direction="in" />
        <span className="architecture-operator">−</span>
        <Row name={memory} size={128} tone="teal" direction="in" />
        <span className="architecture-operator">=</span>
        <Row name={`e_{${scope}}`} size={128} tone="orange" />
      </div>
      <div className="architecture-equation">
        {scalar(beta, "gold", "in")}
        <span className="architecture-operator">×</span>
        <Row name={`e_{${scope}}`} size={128} tone="orange" />
        <span className="architecture-operator">=</span>
        <Row name={delta} size={128} tone="crimson" direction="out" />
      </div>
    </>,
    delta,
  );
  edge("split", "delta", v);
  edge("memory", "delta", memory);
  edge("gates", "delta", beta);
  add(
    "outer",
    "④ Key 列 × 修正行 · 外积产生整张状态增量",
    <>
      <Row name={k} size={128} tone="violet" direction="in" />
      <Down label="同一个 Key 转置为列" />
      <div className="architecture-equation">
        <Matrix
          name={`${k}^{\\mathsf T}`}
          shape={"128\\times1"}
          rows={reps(128)}
          columns={["1"]}
          tone="violet"
          element={(r) => `k_{${scope},${r}}`}
        />
        <span className="architecture-operator">×</span>
        <Row name={delta} size={128} tone="crimson" direction="in" />
        <span className="architecture-operator">=</span>
        {stateMatrix(increment, "mint", "out")}
      </div>
      <p className="architecture-note">
        <M tex={`(${increment})_{i,j}=k_{${scope},i}\\delta_{${scope},j}`} /> ·
        外积保留两个轴。
      </p>
    </>,
    increment,
  );
  edge("split", "outer", k);
  edge("delta", "outer", delta);
  add(
    "write",
    "⑤ 写入本步状态 · 下一步沿用这一张矩阵",
    <>
      <Sum
        inputs={[
          stateMatrix(decayed, "slate", "in"),
          stateMatrix(increment, "mint", "in"),
        ]}
        result={stateMatrix(state, "ocean", "out")}
      />
      <p className="architecture-note">
        <M tex={`${state}=${decayed}+${increment}`} /> · 本层缓存保存 48
        张独立矩阵，下一 token 将它们作为旧状态。
      </p>
    </>,
    state,
  );
  edge("decay", "write", decayed);
  edge("outer", "write", increment);
  add(
    "read",
    "⑥ Query 读取刚更新的状态 · 不读取上一时刻的状态",
    <>
      <div className="architecture-equation">
        <div className="architecture-fraction">
          <Row name={q} size={128} tone="blue" direction="in" />
          <M tex={"\\sqrt{128}"} />
        </div>
        <span className="architecture-operator">×</span>
        {stateMatrix(state, "ocean", "in")}
        <span className="architecture-operator">=</span>
        <Row name={output} size={128} tone="coral" direction="out" />
      </div>
    </>,
    output,
  );
  edge("split", "read", q);
  edge("write", "read", state);
  add(
    "output",
    "每头 RMSNorm 与 sigmoid 输出门 · 48 头拼接后投影",
    <>
      <Columns>
        {[
          <Rms
            key="rms"
            input={output}
            output={`n_{${scope}}`}
            size={128}
            gamma={`\\gamma^G_{${l}}`}
            eps={1e-6}
            inputPort
          />,
          <div key="gate">
            <Row name={z} size={128} tone="rose" direction="in" />
            <Down label="逐元素 sigmoid" />
            <Row name={`\\sigma(${z})`} size={128} tone="rose" />
          </div>,
        ]}
      </Columns>
      <div className="architecture-equation">
        <Row name={`n_{${scope}}`} size={128} tone="green" />
        <span className="architecture-operator">⊙</span>
        <Row name={`\\sigma(${z})`} size={128} tone="rose" />
        <span className="architecture-operator">=</span>
        <Row name={gated} size={128} tone="coral" />
      </div>
      <Down label="全部 48 个 Head 沿特征轴拼接" />
      <Matrix
        name={`Y_{${l},t}`}
        shape={"48\\times128"}
        rows={reps(48)}
        columns={reps(128)}
        tone="coral"
        element={(r, c) => `y_{${l},${r},t,${c}}`}
      />
      <Down label="按 Head 顺序展平，48 × 128 = 6144" />
      <Project
        input={`y^{flat}_{${l},t}`}
        weight={`W^o_{${l}}`}
        output={`o^A_{${l},t}`}
        from={6144}
        to={2560}
        outputPort
        tone="coral"
      />
      <p className="architecture-note">
        输出交回本层 Attention 门控残差，按四个写门分别写回四路状态。
      </p>
    </>,
    `o^A_{${l},t}`,
    2200,
  );
  edge("read", "output", output);
  edge("gates", "output", z);
  return {
    introduction:
      "Qwen3.8-Flash-Next · GDN 机制展开，固定当前 token t 和 Value Head h。完整逐层图仍在制作。",
    exportName: `Qwen3.8-Flash-Next-L${layer}-GDN-${phase}`,
    stages,
    links,
    references: [
      {
        title: "固定版本官方实现 · GatedDeltaNet 与 recurrent_gated_delta_rule",
        url: QWEN_IMPLEMENTATION,
      },
      {
        title: "官方模型配置",
        url: "https://huggingface.co/Qwen/Qwen3.8-Flash-Next/blob/de4b8e4d43b917e7706784d8bb445c9af86a3540/config.json",
      },
    ],
  };
}
