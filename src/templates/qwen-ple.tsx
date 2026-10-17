import type { Recipe, Stage, RecipeLink, Phase } from "./recipes";
import { MathFormula as M } from "../components/diagram-primitives";
import {
  Row,
  Matrix,
  Columns,
  Flow,
  Project,
  Rms,
  Sum,
  Scalar,
  Operation,
  SiluRow,
} from "./architecture-blocks";
import { Down } from "./structure-blocks";
import { ObjectConnections } from "../components/ObjectConnections";
import { qwenPle } from "../data/qwen-ple";
import { QWEN_IMPLEMENTATION } from "./qwen-gdn";

const lanes = [1, 2, 3, 4],
  reps = ["1", "2", "…", "2560"];
const selected = ["2,1", "2,2", "2,8", "3,1", "3,2", "3,8"];
const address = (n: string | number, h: string | number) => `b_{2,${n},${h},t}`;
const selectedRows = selected.map((s) =>
  address(...(s.split(",") as [string, string])),
);
const hpre = "H^{pre}_{2,t}",
  hin = "H^{in}_{2,t}",
  ids = "C_{2,t}",
  addresses = "B_{2,t}",
  embedding = "e^P_{2,t}";
const rawKey = "K^P_{2,t}",
  key = "\\bar K^P_{2,t}",
  query = "Q^P_{2,t}",
  value = "v^P_{2,t}",
  gate = "\\beta^P_{2,t}",
  gated = "Z^P_{2,t}",
  normed = "N^P_{2,t}",
  conv = "Y^P_{2,t}";
function PleMatrix({
  name,
  symbol,
  direction,
  tone = "green",
  trace,
}: {
  name: string;
  symbol: string;
  direction?: "in" | "out";
  tone?: "blue" | "green" | "violet" | "cyan" | "coral";
  trace?: string;
}) {
  return (
    <Matrix
      name={name}
      shape="4\times2560"
      rows={lanes.map(String)}
      columns={reps}
      element={(j, d) => `${symbol}_{2,${j},t,${d}}`}
      direction={direction}
      tone={tone}
      trace={trace}
    />
  );
}
function AddressMatrix({ direction }: { direction: "in" | "out" }) {
  return (
    <Matrix
      name={addresses}
      shape="2\times8"
      rows={["2", "3"]}
      columns={["1", "2", "…", "8"]}
      element={address}
      direction={direction}
      tone="amber"
    />
  );
}

/** 固定第 2 层；无 padding 文本的 token t，物理查表地址保持零基。 */
export function qwenPleRecipe(phase: Phase): Recipe {
  const stages: Stage[] = [],
    links: RecipeLink[] = [];
  const add = (
    id: string,
    title: string,
    body: Stage["body"],
    output: string,
    width: number,
  ) => stages.push({ id, title, body, output, width, inlinePorts: true });
  const edge = (source: string, target: string, tex: string) =>
    links.push({ source, target, tex });
  add(
    "input",
    "Layer 2 · PLE 读取 token 后缀与上一层四路状态",
    <>
      <Columns>
        {[
          <PleMatrix
            key="h"
            name={hpre}
            symbol="h^{pre}"
            direction="out"
            tone="blue"
          />,
          <div key="ids">
            <Row
              name={ids}
              size={3}
              tone="amber"
              direction="out"
              element={(j) => `c_{t,${Number(j) - 1}}`}
            />
            <p className="architecture-note">
              当前 ID、前 1 个 ID、前 2 个 ID；不读取未来 token。
            </p>
            <M
              tex={
                "c_{t,j}=\\begin{cases}\\mathrm{id}_{t-j}&\\text{同一 EOS 段内且位置存在}\\\\248044&\\text{否则}\\end{cases}"
              }
            />
          </div>,
        ]}
      </Columns>
      <p className="architecture-note">
        {phase === "decode"
          ? "Decode：读取上步保存的两个 ID，使用当前 ID 后保留最新两个；首次用 EOS 补足。"
          : "Prefill：每个位置只取自身结尾的二元、三元后缀；序列开头与跨 EOS 的历史以 EOS 补足。"}{" "}
        <M tex="h^{pre}_{2,j,t,d}=h^{out}_{1,j,t,d}" />
        ；尚未注入 PLE。
      </p>
    </>,
    `${hpre},${ids}`,
    1500,
  );
  add(
    "ple-hash",
    "二元、三元后缀并行哈希 · 各生成 8 个行号",
    <>
      <Row
        name={ids}
        size={3}
        tone="amber"
        direction="in"
        element={(j) => `c_{t,${Number(j) - 1}}`}
      />
      <p className="architecture-note">
        固定奇数乘数 a₀、a₁、a₂；第 n 组各头使用不同质数 pₙ,ₕ 与偏移
        oₙ,ₕ。均为固定地址规则，与注意力权重分开。
      </p>
      <Columns>
        {[2, 3].map((n) => (
          <div key={n} className="architecture-cache-branch">
            <p className="architecture-caption">{n}-gram · 以当前 t 结尾</p>
            <ObjectConnections
              links={[1, 2, 8].map((h) => ({ from: "mixed", to: `head-${h}` }))}
            >
              <Sum
                operator="\mathord{\oplus}"
                termSelector=".data-box"
                inputs={Array.from({ length: n }, (_, j) => (
                  <Scalar
                    key={j}
                    tex={`a_${j}\\cdot c_{t,${j}}`}
                    tone="amber"
                  />
                ))}
                result={
                  <div
                    className="architecture-id-anchor"
                    data-trace-object="mixed"
                  >
                    <Scalar tex={`u_{2,${n},t}`} tone="ochre" />
                  </div>
                }
              />
              <div className="architecture-gate-branches">
                <Columns>
                  {[1, 2, 8].flatMap((h) => [
                    ...(h === 8
                      ? [
                          <span
                            key="ellipsis"
                            className="architecture-operator"
                          >
                            ⋯
                          </span>,
                        ]
                      : []),
                    <div key={h}>
                      <div
                        className="architecture-id-anchor"
                        data-trace-object={`head-${h}`}
                      >
                        <Operation
                          tex={`b_{2,${n},${h},t}=o_{${n},${h}}+(u_{2,${n},t}\\bmod p_{${n},${h}})`}
                        />
                      </div>
                    </div>,
                  ])}
                </Columns>
              </div>
            </ObjectConnections>
            <Row
              name={`b_{2,${n},t}`}
              size={8}
              tone="amber"
              element={(h) => address(n, h)}
            />
          </div>
        ))}
      </Columns>
      <Down label="按 2-gram 的 8 项、3-gram 的 8 项保留顺序" />
      <AddressMatrix direction="out" />
      <p className="architecture-note">
        ⊕ 为整数按位异或；每项地址从 0 开始。16 个独立地址区间共用一张参数表。
      </p>
    </>,
    addresses,
    2200,
  );
  edge("input", "ple-hash", ids);
  add(
    "ple-lookup",
    "16 个地址逐行查表 · 每行 160 维，拼接成 2560 维",
    <>
      <ObjectConnections
        links={[
          ...selected.flatMap((s) => [
            {
              from: `addr-${s}`,
              to: `table-${s}`,
              direction: "right" as const,
            },
            {
              from: `table-${s}`,
              to: `read-${s}`,
              direction: "right" as const,
            },
          ]),
          { from: "readout", to: "embedding" },
        ]}
      >
        <div className="architecture-cache-transfer ple-lookup-transfer">
          <div>
            <AddressMatrix direction="in" />
            <Down label="先 n=2，再 n=3" />
            <Matrix
              name="b^{P,col}_{2,t}"
              shape="16\times1"
              rows={["1", "2", "…", "8", "9", "10", "…", "16"]}
              columns={["1"]}
              tone="amber"
              element={(s) =>
                address(Number(s) <= 8 ? 2 : 3, ((Number(s) - 1) % 8) + 1)
              }
              rowTrace={(s) =>
                `addr-${Number(s) <= 8 ? 2 : 3},${((Number(s) - 1) % 8) + 1}`
              }
            />
          </div>
          <div>
            <p className="architecture-caption">
              本层独立参数表 · BF16；高亮行就是地址指定的原行
            </p>
            <Matrix
              name="E^P_2"
              shape={`${qwenPle.rows}\\times160`}
              rows={[
                "0",
                "1",
                "…",
                ...selectedRows.slice(0, 2),
                "…",
                selectedRows[2],
                ...selectedRows.slice(3, 5),
                "…",
                selectedRows[5],
                "…",
                String(qwenPle.rows - 1),
              ]}
              columns={["1", "2", "…", "160"]}
              selected={selectedRows}
              tone="indigo"
              rowTrace={(r) =>
                selectedRows.includes(r)
                  ? `table-${selected[selectedRows.indexOf(r)]}`
                  : undefined
              }
              element={(r, d) => `e^P_{2,${r},${d}}`}
            />
          </div>
          <Matrix
            name="R^P_{2,t}"
            trace="readout"
            shape="16\times160"
            rows={["1", "2", "…", "8", "9", "10", "…", "16"]}
            columns={["1", "2", "…", "160"]}
            tone="green"
            title="按地址顺序读出的 16 个块 · 下方沿特征拼接"
            rowTrace={(s) =>
              `read-${Number(s) <= 8 ? 2 : 3},${((Number(s) - 1) % 8) + 1}`
            }
            element={(s, d) =>
              `e^P_{2,${address(Number(s) <= 8 ? 2 : 3, ((Number(s) - 1) % 8) + 1)},${d}}`
            }
          />
        </div>
        <div className="architecture-object architecture-gate-branches">
          <Row
            name={embedding}
            trace="embedding"
            size={2560}
            tone="green"
            direction="out"
            columns={[
              "1",
              "2",
              "…",
              "160",
              "161",
              "…",
              "1280",
              "1281",
              "…",
              "2560",
            ]}
            element={(d) => {
              const i = Number(d) - 1,
                n = i < 1280 ? 2 : 3,
                h = Math.floor((i % 1280) / 160) + 1,
                k = (i % 160) + 1;
              return `e^P_{2,${address(n, h)},${k}}`;
            }}
          />
        </div>
      </ObjectConnections>
      <p className="architecture-note">
        仅沿特征轴拼接：先 2-gram，再 3-gram；每组 Head
        1…8。原查表元素保留在对应列区间。
      </p>
      <p className="architecture-note">
        <M tex="e^P_{2,t,((n-2)8+h-1)160+d}=e^P_{2,b_{2,n,h,t},d}" />
      </p>
    </>,
    embedding,
    1550,
  );
  edge("ple-hash", "ple-lookup", addresses);
  add(
    "ple-key",
    "查表向量 → 四条 Key · 参数按四路分列",
    <>
      <Project
        input={embedding}
        weight="W^{P,K}_2"
        output="k^{P,cat}_{2,t}"
        from={2560}
        to={10240}
        inputPort
        tone="violet"
        inputTone="green"
      />
      <Down label="顺序拆为四条 2560 维 Key" />
      <PleMatrix name={rawKey} symbol="k^P" direction="out" tone="violet" />
      <p className="architecture-note">
        <M tex="k^P_{2,j,t,d}=k^{P,cat}_{2,t,(j-1)2560+d}" />
      </p>
    </>,
    rawKey,
    1600,
  );
  add(
    "ple-value",
    "查表向量 → 一条共享 Value",
    <Project
      input={embedding}
      weight="W^{P,V}_2"
      output={value}
      from={2560}
      to={2560}
      inputPort
      outputPort
      inputTone="green"
      tone="coral"
    />,
    value,
    1400,
  );
  edge("ple-lookup", "ple-key", embedding);
  edge("ple-lookup", "ple-value", embedding);
  const normalize = (
    id: string,
    title: string,
    src: string,
    symbol: string,
    out: string,
    outSymbol: string,
    tone: "blue" | "violet" | "cyan",
    outTone: "blue" | "violet" | "green",
  ) => {
    const normBranch =
      id === "ple-qnorm" ? "Q" : id === "ple-knorm" ? "K" : "C";
    add(
      id,
      title,
      <ObjectConnections
        links={lanes.flatMap((j) => [
          { from: "norm-source", to: `in-${j}` },
          { from: `out-${j}`, to: "norm-result" },
        ])}
      >
        <PleMatrix
          name={src}
          symbol={symbol}
          direction="in"
          tone={tone}
          trace="norm-source"
        />
        <div className="architecture-gate-branches">
          <Columns>
            {lanes.map((j) => (
              <div className="architecture-cache-branch" key={j}>
                <Rms
                  input={`${symbol}_{2,${j},t}`}
                  output={`${outSymbol}_{2,${j},t}`}
                  size={2560}
                  gamma={`\\gamma^{P,${normBranch}}_{2,${j}}`}
                  eps={1e-6}
                  inputTone={tone}
                  outputTone={outTone}
                  compact
                  inputTrace={`in-${j}`}
                  outputTrace={`out-${j}`}
                  gammaTitle="本路参数 · 跨 token 共用"
                />
              </div>
            ))}
          </Columns>
        </div>
        <div className="architecture-gate-branches">
          <PleMatrix
            name={out}
            symbol={outSymbol}
            direction="out"
            tone={outTone}
            trace="norm-result"
          />
        </div>
        <p className="architecture-note">
          每路独立归一化 2560 维；γ = 1 + w，均方与缩放使用 FP32
          后转回输入类型。
        </p>
      </ObjectConnections>,
      out,
      2600,
    );
  };
  normalize(
    "ple-qnorm",
    "原始四路状态各自归一化 → 四条 Query",
    hpre,
    "h^{pre}",
    query,
    "q^P",
    "blue",
    "blue",
  );
  normalize(
    "ple-knorm",
    "四条 Key 各自归一化",
    rawKey,
    "k^P",
    key,
    "\\bar k^P",
    "violet",
    "violet",
  );
  edge("input", "ple-qnorm", hpre);
  edge("ple-key", "ple-knorm", rawKey);
  add(
    "ple-gates",
    "同路 Query · Key 点积 → 四个标量门",
    <>
      <Columns>
        {[
          <PleMatrix
            key="q"
            name={query}
            symbol="q^P"
            tone="blue"
            direction="in"
          />,
          <PleMatrix
            key="k"
            name={key}
            symbol="\bar k^P"
            tone="violet"
            direction="in"
          />,
        ]}
      </Columns>
      <Columns>
        {lanes.map((j) => (
          <div key={j} className="architecture-cache-branch">
            <p className="architecture-caption">第 {j} 路 · 归约 2560 个特征</p>
            <Sum
              ellipsis
              termSelector=".data-box"
              inputs={[1, 2, 2560].map((d) => (
                <Scalar
                  key={d}
                  tex={`q^P_{2,${j},t,${d}}\\cdot\\bar k^P_{2,${j},t,${d}}`}
                  tone="olive"
                />
              ))}
              result={<Scalar tex={`s^P_{2,${j},t}`} tone="olive" />}
            />
            <Operation
              tex={`a^P_{2,${j},t}=\\frac{s^P_{2,${j},t}}{\\sqrt{2560}}`}
            />
            <Operation
              tex={`g^P_{2,${j},t}=\\operatorname{sign}(a^P_{2,${j},t})\\sqrt{\\max(|a^P_{2,${j},t}|,10^{-6})}`}
            />
            <Flow>
              {[
                <Operation
                  key="sigmoid"
                  tex={`\\beta^P_{2,t,${j}}=\\sigma(g^P_{2,${j},t})`}
                />,
                <Scalar key="b" tex={`\\beta^P_{2,t,${j}}`} tone="rose" />,
              ]}
            </Flow>
          </div>
        ))}
      </Columns>
      <Down />
      <Row name={gate} size={4} tone="rose" direction="out" />
    </>,
    gate,
    2800,
  );
  edge("ple-qnorm", "ple-gates", query);
  edge("ple-knorm", "ple-gates", key);
  add(
    "ple-broadcast",
    "同一条 Value 分给四路 · 每路乘自己的标量门",
    <>
      <Columns>
        {[
          <Row key="b" name={gate} size={4} tone="rose" direction="in" />,
          <Row key="v" name={value} size={2560} tone="coral" direction="in" />,
        ]}
      </Columns>
      <Columns>
        {lanes.map((j) => (
          <div key={j} className="architecture-cache-branch">
            <div className="architecture-equation">
              <Scalar tex={`\\beta^P_{2,t,${j}}`} tone="rose" />
              <span className="architecture-operator">×</span>
              <Row name={value} size={2560} tone="coral" />
            </div>
            <Down />
            <Row
              name={`z^P_{2,${j},t}`}
              size={2560}
              tone="cyan"
              element={(d) => `\\beta^P_{2,t,${j}}\\cdot v^P_{2,t,${d}}`}
            />
          </div>
        ))}
      </Columns>
      <Down />
      <PleMatrix name={gated} symbol="z^P" tone="cyan" direction="out" />
    </>,
    gated,
    1800,
  );
  edge("ple-gates", "ple-broadcast", gate);
  edge("ple-value", "ple-broadcast", value);
  normalize(
    "ple-cnorm",
    "卷积支路 · 门控后四路各自归一化",
    gated,
    "z^P",
    normed,
    "n^P",
    "cyan",
    "green",
  );
  edge("ple-broadcast", "ple-cnorm", gated);
  const convInput = "T^{P,conv}_{2,t}";
  const temporalRows = ["t-9", "t-8", "…", "t-6", "…", "t-3", "…", "t-1", "t"];
  const temporalElement = (s: string, d: string) =>
    `n^P_{2,${d === "10240" ? 4 : 1},${s},${d === "10240" ? 2560 : d}}`;
  add(
    "ple-conv-state",
    "卷积历史与当前输入 · 取间隔 3 的四个位置",
    <>
      <ObjectConnections
        links={[
          ...["t-9", "t-8", "t-6", "t-3", "t-1"].map((s) => ({
            from: `old-${s}`,
            to: `window-${s}`,
            direction: "right" as const,
          })),
          { from: "new", to: "window-t", direction: "right" as const },
        ]}
      >
        <div className="architecture-cache-transfer">
          <div>
            <Matrix
              name="N^{P,past}_{2,t}"
              shape="9\times10240"
              rows={temporalRows.slice(0, -1)}
              columns={["1", "2", "…", "10240"]}
              element={temporalElement}
              rowTrace={(s) => `old-${s}`}
              tone="green"
              title="进入本步前 · 历史归一化四路，起始不足处补零"
            />
            <PleMatrix name={normed} symbol="n^P" direction="in" trace="new" />
          </div>
          <Matrix
            name={convInput}
            shape="10\times10240"
            rows={temporalRows}
            columns={["1", "2", "…", "10240"]}
            element={temporalElement}
            selected={["t-9", "t-6", "t-3", "t"]}
            rowTrace={(s) => `window-${s}`}
            direction="out"
            tone="green"
            title="本次卷积读 t−9、t−6、t−3、t；四路按特征拼接"
          />
        </div>
      </ObjectConnections>
      <p className="architecture-note">
        <M tex="(T^{P,conv}_{2,t})_{k+1,(j-1)2560+d}=n^P_{2,j,t-9+k,d},\quad k=0,\ldots,9" />
        ；本步后保留 t−8…t 的 9 行供下一次调用，t−9 不再缓存。
      </p>
    </>,
    convInput,
    1100,
  );
  edge("ple-cnorm", "ple-conv-state", normed);
  add(
    "ple-conv",
    "深度卷积 · 每路每维独立，核 4、间隔 3",
    <ObjectConnections links={[{ from: "conv-sum", to: "silu-input" }]}>
      <p className="architecture-note">
        固定一路 j（1–4）；从四个位置各取第 j 路的 2560
        列。各维独立卷积，序列前补零，无偏置。
      </p>
      <ObjectConnections
        links={[9, 6, 3, 0].map((lag) => ({
          from: "conv-window",
          to: `tap-${lag}`,
        }))}
      >
        <Matrix
          name={convInput}
          shape="10\times10240"
          rows={temporalRows}
          columns={["1", "2", "…", "10240"]}
          element={temporalElement}
          selected={["t-9", "t-6", "t-3", "t"]}
          direction="in"
          tone="green"
          trace="conv-window"
        />
        <div className="architecture-gate-branches">
          <Sum
            termSelector="[data-conv-product] [data-expanded-tensor]"
            inputs={[9, 6, 3, 0].map((lag, k) => (
              <div className="architecture-cache-branch" key={lag}>
                <div className="architecture-equation">
                  <Row
                    name={`n^P_{2,j,${lag ? `t-${lag}` : "t"}}`}
                    trace={`tap-${lag}`}
                    size={2560}
                    tone="green"
                  />
                  <span className="architecture-operator">⊙</span>
                  <Row
                    name={`w^{P,conv}_{2,j,${k + 1}}`}
                    size={2560}
                    tone="indigo"
                    title={`第 ${k + 1} 个卷积核位置 · 各维独立参数`}
                  />
                </div>
                <Down />
                <div data-conv-product>
                  <Row
                    name={`p^{P,conv}_{2,j,${k + 1},t}`}
                    size={2560}
                    tone="teal"
                    element={(d) =>
                      `n^P_{2,j,${lag ? `t-${lag}` : "t"},${d}}\\cdot w^{P,conv}_{2,j,${k + 1},${d}}`
                    }
                  />
                </div>
              </div>
            ))}
            result={
              <Row
                name="c^P_{2,j,t}"
                size={2560}
                tone="teal"
                trace="conv-sum"
              />
            }
          />
        </div>
      </ObjectConnections>
      <SiluRow
        input="c^P_{2,j,t}"
        compact
        output="y^P_{2,j,t}"
        size={2560}
        inputTone="teal"
        outputTone="coral"
      />
      <Down label="四路同构计算，各路参数不同" />
      <PleMatrix name={conv} symbol="y^P" tone="coral" direction="out" />
      <p className="architecture-note">
        {phase === "decode"
          ? "Decode：缓存最近 9 个位置的归一化四路值。读旧状态和当前值后，保留 t−8…t；与注意力 K/V 缓存分开。"
          : "Prefill：因果空洞卷积并行处理各位置；为下一次调用保存末尾 9 个归一化状态。"}{" "}
        无 padding 文本；批处理中 padding 位置的门控值和卷积输入均置零。
      </p>
    </ObjectConnections>,
    conv,
    2900,
  );
  edge("ple-conv-state", "ple-conv", convInput);
  add(
    "ple-inject",
    "PLE 加回原始四路 · 然后才进入 Attention GR",
    <>
      <Sum
        inputs={[
          <PleMatrix
            key="h"
            name={hpre}
            symbol="h^{pre}"
            tone="blue"
            direction="in"
          />,
          <PleMatrix
            key="z"
            name={gated}
            symbol="z^P"
            tone="cyan"
            direction="in"
          />,
          <PleMatrix
            key="y"
            name={conv}
            symbol="y^P"
            tone="coral"
            direction="in"
          />,
        ]}
        result={
          <PleMatrix name={hin} symbol="h^{in}" tone="blue" direction="out" />
        }
      />
      <p className="architecture-note">
        <M tex="h^{in}_{2,j,t,d}=h^{pre}_{2,j,t,d}+z^P_{2,j,t,d}+y^P_{2,j,t,d}" />
      </p>
    </>,
    hin,
    1500,
  );
  edge("input", "ple-inject", hpre);
  edge("ple-broadcast", "ple-inject", gated);
  edge("ple-conv", "ple-inject", conv);
  return {
    introduction:
      "Qwen3.8-Flash-Next · 第 2 层 PLE；16 个哈希地址、单表取行与四路注入。",
    exportName: `Qwen3.8-PLE-${phase}`,
    stages,
    links,
    references: [
      {
        title: "Qwen 官方实现 · NGramEmbedding 与 PLE",
        url: QWEN_IMPLEMENTATION,
      },
      {
        title: "Qwen 官方配置 · PLE 层号、查表维度与卷积参数",
        url: "https://huggingface.co/Qwen/Qwen3.8-Flash-Next/blob/de4b8e4d43b917e7706784d8bb445c9af86a3540/config.json",
      },
    ],
  };
}
