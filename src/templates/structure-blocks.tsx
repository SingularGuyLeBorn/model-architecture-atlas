import type { ReactNode } from "react";
export function Sequence({ children }: { children: ReactNode[] }) {
  return (
    <div className="sequence">
      {children.flatMap((child, i) =>
        i
          ? [
              <span key={"arrow-" + i} className="operator">
                →
              </span>,
              <div key={i}>{child}</div>,
            ]
          : [<div key={i}>{child}</div>],
      )}
    </div>
  );
}
import {
  MathFormula as M,
  SumJunction,
  SplitArrows,
  tonePalette,
  selectionPalette,
  matrixColumnTracks,
  MatrixEllipsis,
  type DiagramTone,
} from "../components/diagram-primitives";

export function Tensor({
  name,
  shape,
  rows: specifiedRows,
  columns = ["1", "2", "…", "d"],
  tone = "green",
  selected,
  elementTex,
  rowLabels = true,
  rowTrace,
  rowTone,
}: {
  name: string;
  shape: string;
  rows?: string[];
  columns?: string[];
  tone?: DiagramTone;
  selected?: string;
  elementTex?: (row: string, column: string) => string;
  rowLabels?: boolean;
  rowTrace?: (row: string) => string | undefined;
  rowTone?: (row: string) => DiagramTone;
}) {
  const palette = tonePalette(tone);
  const count = shape.split("\\times")[0];
  const rows =
    specifiedRows ??
    (count === "1"
      ? ["t"]
      : count === "N"
        ? ["1", "2", "…", "t", "…", "N"]
        : ["1", "2", "…", count]);
  return (
    <section
      className="tensor"
      data-expanded-tensor
      style={{ borderColor: palette.color, background: "transparent" }}
    >
      <header>
        <M tex={name} />
        <small>
          <M tex={shape} />
        </small>
      </header>
      <div
        className="tensor-rows"
        style={{
          gridTemplateColumns: matrixColumnTracks(
            columns.map((c) => (c === "…" ? "\\cdots" : c)),
            rowLabels ? "max-content" : "0px",
          ),
          width: "max-content",
          marginInline: "auto",
        }}
      >
        {rows.map((row, index) =>
          row === "…" ? (
            <MatrixEllipsis
              key={index}
              columns={columns.map((c) => (c === "…" ? "\\cdots" : c))}
            />
          ) : (
            <div
              key={index}
              data-trace-object={rowTrace?.(row)}
              className={selected === row ? "tensor-row picked" : "tensor-row"}
              style={{
                gridColumn: "1 / -1",
                gridTemplateColumns: "subgrid",
                alignItems: "stretch",
                ...(selected === row
                  ? { outlineOffset: 4, marginBlock: 5 }
                  : {}),
              }}
            >
              <small>{rowLabels && <M tex={row} />}</small>
              {columns.map((col, i) =>
                col === "…" ? (
                  <span key={i} className="ellipsis">
                    ⋯
                  </span>
                ) : (
                  <span
                    key={i}
                    className="scalar"
                    style={{
                      borderColor: (selected === row
                        ? selectionPalette(tone, "amber")
                        : rowTone
                          ? tonePalette(rowTone(row))
                          : palette
                      ).color,
                      background: (selected === row
                        ? selectionPalette(tone, "amber")
                        : rowTone
                          ? tonePalette(rowTone(row))
                          : palette
                      ).background,
                    }}
                  >
                    <M
                      tex={
                        elementTex
                          ? elementTex(row, col)
                          : elementIndex(
                              name,
                              rows.length === 1 ? col : `${row},${col}`,
                            )
                      }
                    />
                  </span>
                ),
              )}
            </div>
          ),
        )}
      </div>
    </section>
  );
}
export function elementIndex(name: string, suffix: string) {
  const subscript = /_(?:\{([^}]+)\}|([a-zA-Z0-9]))/;
  return subscript.test(name)
    ? name.replace(
        subscript,
        (_, group: string, single: string) => `_{${group ?? single},${suffix}}`,
      )
    : `${name}_{${suffix}}`;
}
export function Vector({
  name,
  size,
  tone = "green",
}: {
  name: string;
  size: string | number;
  tone?: DiagramTone;
}) {
  return (
    <Tensor
      name={name}
      shape={`1\\times ${size}`}
      rows={["t"]}
      columns={["1", "2", "…", String(size)]}
      tone={tone}
    />
  );
}
export function Data({
  children,
  tone = "green",
  selected = false,
}: {
  children: ReactNode;
  tone?: DiagramTone;
  selected?: boolean;
}) {
  const palette = selected ? selectionPalette(tone) : tonePalette(tone);
  return (
    <div
      className="data-box"
      style={{ borderColor: palette.color, background: palette.background }}
    >
      {children}
    </div>
  );
}
export function Down({ label }: { label?: string }) {
  return (
    <div className="down">
      <svg width="20" height="25" viewBox="0 0 20 25" aria-hidden>
        <path
          d="M10 0 V23 M4 17 L10 23 L16 17"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
      {label && <span>{label}</span>}
    </div>
  );
}
export function Parallel({
  children,
  label,
  proportions,
}: {
  children: ReactNode[];
  label?: string;
  proportions?: number[];
}) {
  return (
    <section className="parallel-group">
      {label && <h4>{label}</h4>}
      <div
        className="parallel"
        style={{
          gridTemplateColumns: proportions
            ? proportions.map((value) => `minmax(0,${value}fr)`).join(" ")
            : `repeat(${children.length}, minmax(0,1fr))`,
        }}
      >
        {children}
      </div>
    </section>
  );
}
export function Projection({
  input,
  weight,
  output,
  rows,
  from,
  to,
}: {
  input: string;
  weight: string;
  output: string;
  rows: string;
  from: number | string;
  to: number | string;
}) {
  return (
    <div className="projection">
      <Tensor
        name={input}
        shape={`${rows}\\times${from}`}
        columns={["1", "2", "…", String(from)]}
      />
      <span className="operator">×</span>
      <Tensor
        name={weight}
        shape={`${from}\\times${to}`}
        rows={["1", "2", "…", String(from)]}
        columns={["1", "2", "…", String(to)]}
        tone="amber"
      />
      <span className="operator">=</span>
      <Tensor
        name={output}
        shape={`${rows}\\times${to}`}
        columns={["1", "2", "…", String(to)]}
      />
    </div>
  );
}
export function Add({
  children,
  result,
}: {
  children: ReactNode[];
  result: ReactNode;
}) {
  return (
    <div className="sum-structure">
      <Parallel>{children}</Parallel>
      <SumJunction count={children.length} />
      {result}
    </div>
  );
}
export function Silu({ example = 2 }: { example?: number }) {
  return (
    <div className="silu">
      <Data>
        <M tex="z" />
      </Data>
      <SplitArrows count={2} />
      <Parallel>
        {[
          <Data key="z">
            <M tex="z" />
          </Data>,
          <Data key="s" tone="rose">
            <M tex="\sigma(z)=\frac{1}{1+e^{-z}}" />
          </Data>,
        ]}
      </Parallel>
      <div className="multiply-join">
        <svg
          width="100%"
          height="20"
          viewBox="0 0 400 20"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M100 0 V8 H200 V20 M300 0 V8 H200"
            fill="none"
            stroke="currentColor"
          />
        </svg>
        <span>×</span>
      </div>
      <Data tone="cyan">
        <M tex="a=z\,\sigma(z)" />
      </Data>
      <p className="example">
        <M
          tex={`z=${example}:\\quad a\\approx ${(example / (1 + Math.exp(-example))).toFixed(4)}`}
        />
      </p>
    </div>
  );
}
