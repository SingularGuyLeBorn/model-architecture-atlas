import type { ReactNode } from "react";
import {
  MathFormula as M,
  SumJunction,
  type DiagramTone,
} from "../components/diagram-primitives";
import { Tensor, Data, Down, elementIndex } from "./structure-blocks";
import { RecipePort } from "./RecipePorts";
import { ObjectConnections } from "../components/ObjectConnections";

// [OM-FREEPLAY] 复用现有身份色；输入、Query、潜缓存和输出在生产/消费端用同一规则。
export function architectureTone(name: string): DiagramTone {
  const symbol = name.replace(/\\(?:widehat|widetilde|bar)\s*/g, "");
  if (/^c\^/.test(symbol)) return "ocean";
  if (/^k\^R/.test(symbol)) return "violet";
  if (/^[hxyzq]/.test(symbol)) return "blue";
  if (/^[ofv]/.test(symbol)) return "coral";
  if (/^p/.test(symbol)) return "teal";
  if (/^\\alpha/.test(symbol)) return "gold";
  return "green";
}

export function Row({
  name,
  size,
  tone = architectureTone(name),
  direction,
  title,
  trace,
  columns,
  element,
  selectedColumns,
  columnTrace,
}: {
  name: string;
  size: number | string;
  tone?: DiagramTone;
  direction?: "in" | "out";
  title?: string;
  trace?: string;
  columns?: string[];
  element?: (column: string) => string;
  selectedColumns?: readonly string[];
  columnTrace?: (column: string) => string | undefined;
}) {
  const tensor = (
    <Tensor
      name={name}
      shape={`1\\times ${size}`}
      rows={["t"]}
      rowLabels={false}
      selectedColumns={selectedColumns}
      columnTrace={columnTrace}
      elementTex={(_, column) =>
        element?.(column) ??
        elementIndex(
          name.replace(/^[A-Z]/, (letter) => letter.toLowerCase()),
          column,
        )
      }
      columns={
        columns ??
        (Number(size) <= 4
          ? Array.from({ length: Number(size) }, (_, i) => String(i + 1))
          : ["1", "2", "…", String(size)])
      }
      tone={tone}
    />
  );
  return (
    <div className="architecture-object">
      {title && <p className="architecture-caption">{title}</p>}
      <div data-trace-object={trace}>
        {direction ? (
          <RecipePort tex={name} direction={direction}>
            {tensor}
          </RecipePort>
        ) : (
          tensor
        )}
      </div>
    </div>
  );
}

export function Matrix({
  name,
  element,
  rows,
  columns,
  shape,
  tone = architectureTone(name),
  selected,
  direction,
  title,
  rowTrace,
  rowTone,
  trace,
}: {
  name: string;
  element: (row: string, column: string) => string;
  rows: string[];
  columns: string[];
  shape: string;
  tone?: DiagramTone;
  selected?: string | readonly string[];
  direction?: "in" | "out";
  title?: string;
  rowTrace?: (row: string) => string | undefined;
  rowTone?: (row: string) => DiagramTone;
  trace?: string;
}) {
  const tensor = (
    <Tensor
      name={name}
      shape={shape}
      rows={rows}
      columns={columns}
      elementTex={element}
      tone={tone}
      selected={selected}
      rowTrace={rowTrace}
      rowTone={rowTone}
    />
  );
  return (
    <div className="architecture-object">
      {title && <p className="architecture-caption">{title}</p>}
      <div data-trace-object={trace}>
        {direction ? (
          <RecipePort tex={name} direction={direction}>
            {tensor}
          </RecipePort>
        ) : (
          tensor
        )}
      </div>
    </div>
  );
}

export function Flow({ children }: { children: ReactNode[] }) {
  return (
    <div className="architecture-flow">
      {children.flatMap((child, i) => [
        ...(i
          ? [
              <span key={`a${i}`} className="architecture-arrow" aria-hidden>
                →
              </span>,
            ]
          : []),
        <div className="architecture-flow-step" key={i}>
          {child}
        </div>,
      ])}
    </div>
  );
}

export function Columns({ children }: { children: ReactNode[] }) {
  return (
    <div className="architecture-columns">
      {children.map((child, i) => (
        <div key={i}>{child}</div>
      ))}
    </div>
  );
}

export function Operation({ tex, label }: { tex: string; label?: string }) {
  return (
    <div className="architecture-operation">
      {label && <small>{label}</small>}
      <M tex={tex} />
    </div>
  );
}

export function Project({
  input,
  weight,
  output,
  from,
  to,
  inputPort = false,
  outputPort = false,
  tone = architectureTone(output),
  inputTrace,
  outputTrace,
  inputTone = architectureTone(input),
}: {
  input: string;
  weight: string;
  output: string;
  from: number;
  to: number;
  inputPort?: boolean;
  outputPort?: boolean;
  tone?: DiagramTone;
  inputTrace?: string;
  outputTrace?: string;
  inputTone?: DiagramTone;
}) {
  return (
    <div className="architecture-equation">
      <Row
        name={input}
        size={from}
        direction={inputPort ? "in" : undefined}
        trace={inputTrace}
        tone={inputTone}
      />
      <span className="architecture-operator">×</span>
      <Matrix
        name={weight}
        element={(r, c) => elementIndex(weight.replace(/^W/, "w"), `${r},${c}`)}
        shape={`${from}\\times${to}`}
        rows={
          from <= 4
            ? Array.from({ length: from }, (_, i) => String(i + 1))
            : ["1", "2", "…", String(from)]
        }
        columns={
          to <= 4
            ? Array.from({ length: to }, (_, i) => String(i + 1))
            : ["1", "2", "…", String(to)]
        }
        tone="indigo"
      />
      <span className="architecture-operator">=</span>
      <Row
        name={output}
        size={to}
        tone={tone}
        direction={outputPort ? "out" : undefined}
        trace={outputTrace}
      />
    </div>
  );
}

/** 按真实操作数和结果框测量 Σ 的路径；省略号仅表示未画出的同构项。 */
export function Sum({
  inputs,
  result,
  ellipsis = false,
  termSelector = "[data-expanded-tensor]",
}: {
  inputs: ReactNode[];
  result: ReactNode;
  ellipsis?: boolean;
  termSelector?: string;
}) {
  return (
    <div className="architecture-sum">
      <div className="architecture-columns">
        {inputs.flatMap((input, i) => [
          ...(ellipsis && i === inputs.length - 1
            ? [
                <span key="ellipsis" className="architecture-operator">
                  ⋯
                </span>,
              ]
            : []),
          <div data-architecture-summand key={i}>
            {input}
          </div>,
        ])}
      </div>
      <SumJunction
        count={inputs.length}
        sourceSelector={`[data-architecture-summand] ${termSelector}`}
        targetSelector="[data-architecture-sum-result] [data-expanded-tensor], [data-architecture-sum-result] .data-box"
      />
      <div data-architecture-sum-result>{result}</div>
    </div>
  );
}

/** 一条输入行的归约与整行缩放；输入旁路避免暗示 r 已包含向量内容。 */
export function Rms({
  input,
  output,
  size,
  gamma,
  eps,
  inputPort = false,
  outputPort = false,
  inputSource = false,
  compact = false,
  inputTrace,
  outputTrace,
  gammaTitle = "可学习缩放 · 各行共用",
  inputTone = architectureTone(input),
  outputTone = architectureTone(output),
}: {
  input: string;
  output: string;
  size: number;
  gamma: string;
  eps: number;
  inputPort?: boolean;
  outputPort?: boolean;
  inputSource?: boolean;
  compact?: boolean;
  inputTrace?: string;
  outputTrace?: string;
  gammaTitle?: string;
  inputTone?: DiagramTone;
  outputTone?: DiagramTone;
}) {
  return (
    <div
      className={
        compact
          ? "architecture-rms architecture-rms-compact"
          : "architecture-rms"
      }
    >
      <Flow>
        {[
          <Row
            key="input"
            name={input}
            trace={inputTrace}
            size={size}
            direction={inputPort ? "in" : inputSource ? "out" : undefined}
            tone={inputTone}
          />,
          <Operation
            key="r"
            label="同一行归约 · 共用分母"
            tex={`r=\\sqrt{\\frac{\\sum_{d=1}^{${size}}(${input})_d^2}{${size}}+${eps}}`}
          />,
        ]}
      </Flow>
      <div className="architecture-equation">
        <div className="architecture-fraction">
          <Row name={input} size={size} tone={inputTone} />
          <M tex="r" />
        </div>
        <span className="architecture-operator">⊙</span>
        <Row name={gamma} size={size} tone="crimson" title={gammaTitle} />
        {!compact && <span className="architecture-operator">=</span>}
        {!compact && (
          <Row
            name={output}
            trace={outputTrace}
            size={size}
            direction={outputPort ? "out" : undefined}
            tone={outputTone}
          />
        )}
      </div>
      {compact && (
        <>
          <Down />
          <Row
            name={output}
            trace={outputTrace}
            size={size}
            direction={outputPort ? "out" : undefined}
            tone={outputTone}
          />
        </>
      )}
    </div>
  );
}

export function SwiGlu({
  input,
  output,
  hidden,
  intermediate,
  scope,
  inputPort = false,
  outputPort = false,
  outputTrace,
}: {
  input: string;
  output: string;
  hidden: number;
  intermediate: number;
  scope: string;
  inputPort?: boolean;
  outputPort?: boolean;
  outputTrace?: string;
}) {
  const gate = `g_{${scope},t}`,
    up = `u_{${scope},t}`,
    product = `p_{${scope},t}`;
  return (
    <ObjectConnections
      links={[
        { from: "input", to: "gate-in" },
        { from: "input", to: "up-in" },
        { from: "activated", to: "multiply-a" },
        { from: "up-out", to: "multiply-u" },
        { from: "product", to: "down-in" },
      ]}
    >
      <div className="architecture-swiglu">
        <Row
          name={input}
          size={hidden}
          trace="input"
          direction={inputPort ? "in" : undefined}
        />
        <Columns>
          {[
            <div key="gate">
              <Project
                input={input}
                weight={`W^{gate}_{${scope}}`}
                output={gate}
                inputTrace="gate-in"
                from={hidden}
                to={intermediate}
              />
              <Flow>
                {[
                  <Operation
                    key="s"
                    tex={`\\operatorname{SiLU}(${gate})=${gate}\\odot\\sigma(${gate})`}
                  />,
                  <Row
                    key="a"
                    trace="activated"
                    name={`a_{${scope},t}`}
                    size={intermediate}
                    tone="mint"
                  />,
                ]}
              </Flow>
            </div>,
            <Project
              key="up"
              input={input}
              weight={`W^{up}_{${scope}}`}
              output={up}
              inputTrace="up-in"
              outputTrace="up-out"
              from={hidden}
              to={intermediate}
            />,
          ]}
        </Columns>
        <div className="architecture-equation">
          <Row
            name={`a_{${scope},t}`}
            size={intermediate}
            tone="mint"
            trace="multiply-a"
          />
          <span className="architecture-operator">⊙</span>
          <Row name={up} size={intermediate} trace="multiply-u" />
          <span className="architecture-operator">=</span>
          <Row name={product} size={intermediate} tone="teal" trace="product" />
        </div>
        <Project
          input={product}
          weight={`W^{down}_{${scope}}`}
          output={output}
          inputTrace="down-in"
          outputPort={outputPort}
          outputTrace={outputTrace}
          from={intermediate}
          to={hidden}
          tone="coral"
        />
      </div>
    </ObjectConnections>
  );
}

export function Scalar({
  tex,
  tone = "amber",
}: {
  tex: string;
  tone?: DiagramTone;
}) {
  return (
    <Data tone={tone}>
      <M tex={tex} />
    </Data>
  );
}

/** rotate_half 对应前后半段配对；这里的维号从 1 开始，位置从 0 开始。 */
export function HalfRoPE({
  input,
  output,
  size,
  rotary,
  theta,
  position = "t-1",
  positionIndex = "t",
  inputTone = architectureTone(input),
  outputTone = architectureTone(output),
}: {
  input: string;
  output: string;
  size: number;
  rotary: number;
  theta: number;
  position?: string;
  positionIndex?: string;
  inputTone?: DiagramTone;
  outputTone?: DiagramTone;
}) {
  const half = rotary / 2;
  return (
    <div className="architecture-rope">
      <p className="architecture-note">
        <M
          tex={`\\phi_{${positionIndex},j}=(${position})\\,${theta}^{-2(j-1)/${rotary}},\\quad j=1,\\ldots,${half}`}
        />
      </p>
      <Columns>
        {[1, 2, half].map((j) => (
          <div key={j}>
            <p className="architecture-caption">
              第 {j}、{j + half} 维
            </p>
            <div className="architecture-equation">
              <Matrix
                name={`R_{${positionIndex},${j}}`}
                shape={"2\\times2"}
                rows={["1", "2"]}
                columns={["1", "2"]}
                tone="crimson"
                element={(r, c) =>
                  r === c
                    ? `\\cos\\phi_{${positionIndex},${j}}`
                    : `${r === "1" ? "-" : ""}\\sin\\phi_{${positionIndex},${j}}`
                }
              />
              <span className="architecture-operator">×</span>
              <Matrix
                name={`(${input})^{(${j})}`}
                shape={"2\\times1"}
                rows={["1", "2"]}
                columns={["1"]}
                tone={inputTone}
                element={(r) =>
                  elementIndex(input, String(r === "1" ? j : j + half))
                }
              />
              <span className="architecture-operator">=</span>
              <Matrix
                name={`(${output})^{(${j})}`}
                shape={"2\\times1"}
                rows={["1", "2"]}
                columns={["1"]}
                tone={outputTone}
                element={(r) =>
                  elementIndex(output, String(r === "1" ? j : j + half))
                }
              />
            </div>
          </div>
        ))}
      </Columns>
      <p className="architecture-note">
        <M
          tex={`${elementIndex(output, "d")}=${elementIndex(input, "d")},\\quad d=${rotary + 1},\\ldots,${size}`}
        />{" "}
        · 其余维原样传递
      </p>
    </div>
  );
}
