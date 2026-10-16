import React, { useMemo, type ReactNode } from "react";
import { latexHtml } from "./EditableArchitectureGraph";

export type DiagramTone =
  | "neutral"
  | "green"
  | "amber"
  | "blue"
  | "violet"
  | "rose"
  | "cyan";
export const COLORS = {
  paper: "#f7f5f0",
  card: "#fffefa",
  ink: "#2a2924",
  muted: "#716d63",
  faint: "#a39e92",
  line: "#d9d4c8",
  green: "#37685a",
  greenSoft: "#e6efeb",
  amber: "#a87335",
  amberSoft: "#f4ecdf",
  blue: "#667c96",
  blueSoft: "#e9edf2",
  rose: "#9a625d",
  roseSoft: "#f4e7e5",
  violet: "#795a97",
  violetSoft: "#eee7f5",
  cyan: "#287e87",
  cyanSoft: "#e1f0f2",
};

export function MathFormula({
  tex,
  display = false,
}: {
  tex: string;
  display?: boolean;
}) {
  const html = useMemo(() => latexHtml(tex, display), [display, tex]);
  // [OM-FREEPLAY] 小字号下限取 10.5px，放大矩阵元素而不缩小已有的大公式。
  return (
    <span
      aria-label={tex}
      style={{ fontSize: "max(1em, 10.5px)" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function Box({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: DiagramTone;
}) {
  const { color, background } = tonePalette(tone);
  return (
    <div
      style={{
        minWidth: 0,
        border: `1.5px solid ${color}`,
        borderRadius: 8,
        padding: "7px 8px",
        background,
        textAlign: "center",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

export function Arrow({ vertical = false }: { vertical?: boolean }) {
  return (
    <span
      aria-hidden
      style={
        vertical
          ? { width: 2, height: 12, justifySelf: "center" }
          : { minWidth: 12, minHeight: 2 }
      }
    />
  );
}

export function Operator({ tex }: { tex: string }) {
  return (
    <span
      style={{
        color: COLORS.green,
        fontSize: 18,
        fontWeight: 900,
        textAlign: "center",
      }}
    >
      <MathFormula tex={tex} />
    </span>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 14px 9px",
        borderBottom: `1px solid ${COLORS.line}`,
        fontSize: 15,
        fontWeight: 800,
      }}
    >
      {children}
    </div>
  );
}

export function tonePalette(tone: DiagramTone) {
  return tone === "neutral"
    ? { color: COLORS.line, background: COLORS.card }
    : { color: COLORS[tone], background: COLORS[`${tone}Soft`] };
}

export function VectorStrip({
  name,
  length,
  elementTex,
  tone = "neutral",
  compact = false,
  selected = false,
  columns: displayedColumns,
  nameWidth,
  nameLineHeight,
  outlineSelection = true,
}: {
  name: string;
  length: string;
  elementTex: (column: string) => string;
  tone?: DiagramTone;
  compact?: boolean;
  selected?: boolean;
  columns?: string[];
  nameWidth?: number;
  nameLineHeight?: number;
  outlineSelection?: boolean;
}) {
  const palette = tonePalette(selected ? "amber" : tone);
  const columns = displayedColumns ?? ["1", "2", "\\cdots", length];
  return (
    <div
      data-vector-elements
      data-vector-selected={selected || undefined}
      style={{
        minWidth: 0,
        display: "grid",
        gridTemplateColumns: `${nameWidth ?? (compact ? 52 : 92)}px minmax(0,1fr)`,
        gap: 5,
        alignItems: "center",
        padding: compact ? 2 : 5,
        fontSize: compact ? 9 : 10.5,
        lineHeight: 1.2,
        outline:
          selected && outlineSelection
            ? `1px dashed ${palette.color}`
            : undefined,
        borderRadius: 4,
      }}
    >
      <div
        style={{
          minWidth: 0,
          textAlign: "center",
          color: palette.color,
          fontSize: compact ? 9 : 10.5,
          lineHeight: nameLineHeight,
          fontWeight: 800,
          overflow: "hidden",
        }}
      >
        <MathFormula tex={name} />
      </div>
      <div
        style={{
          minWidth: 0,
          display: "grid",
          gridTemplateColumns: columns
            .map((column) => (column === "\\cdots" ? ".55fr" : "minmax(0,1fr)"))
            .join(" "),
          gap: 3,
        }}
      >
        {columns.map((column, index) =>
          column === "\\cdots" ? (
            <span
              key={`${column}-${index}`}
              style={{
                display: "grid",
                placeItems: "center",
                color: COLORS.muted,
              }}
            >
              <MathFormula tex="\cdots" />
            </span>
          ) : (
            <span
              key={`${column}-${index}`}
              style={{
                minWidth: 0,
                padding: compact ? "2px 3px" : "4px 3px",
                border: `1px solid ${palette.color}`,
                borderRadius: 4,
                background: palette.background,
                textAlign: "center",
                fontSize: compact ? 8.5 : 9.5,
                overflow: "hidden",
              }}
            >
              <MathFormula tex={elementTex(column)} />
            </span>
          ),
        )}
      </div>
    </div>
  );
}

export function Matrix({
  tex,
  shape,
  rowTex,
  elementTex,
  tone = "blue",
  vectorLength = "5120",
  lastRow = "N",
  rowIndices,
}: {
  tex: string;
  shape: string;
  rowTex: (row: string) => string;
  elementTex: (row: string, column: string) => string;
  tone?: "blue" | "green" | "amber";
  vectorLength?: string;
  lastRow?: string;
  rowIndices?: string[];
}) {
  const rows = rowIndices ?? ["1", "2", "\\vdots", lastRow];
  const palette = tonePalette(tone);
  return (
    <div
      style={{
        border: `1.5px solid ${palette.color}`,
        borderRadius: 9,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "6px 9px",
          background: palette.background,
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <MathFormula tex={tex} />
        <MathFormula tex={shape} />
      </div>
      <div
        style={{
          padding: 6,
          display: "grid",
          gap: 3,
          borderTop: `1px solid ${COLORS.line}`,
          fontSize: 9.5,
        }}
      >
        {rows.map((row, index) =>
          row === "\\vdots" ? (
            <div
              key={`${row}-${index}`}
              style={{ minHeight: 22, display: "grid", placeItems: "center" }}
            >
              <MathFormula tex="\vdots" />
            </div>
          ) : (
            <VectorStrip
              key={`${row}-${index}`}
              name={rowTex(row)}
              length={vectorLength}
              columns={["1", "2", "3", "\\cdots", vectorLength]}
              elementTex={(column) => elementTex(row, column)}
              selected={rowIndices !== undefined && row === "t"}
              tone={tone}
              compact
            />
          ),
        )}
      </div>
    </div>
  );
}

export function RowMatrix({
  tex,
  shape,
  rows,
  selected,
  tone = "green",
  rowLength,
  elementTex,
  elementColumns,
  headerLineHeight,
}: {
  tex: string;
  shape: string;
  rows: string[];
  selected?: number;
  tone?: "blue" | "green";
  rowLength?: string;
  elementTex?: (rowIndex: number, column: string) => string;
  elementColumns?: string[];
  headerLineHeight?: number;
}) {
  const palette = tonePalette(tone);
  return (
    <div
      style={{
        minWidth: 0,
        padding: 6,
        border: `1.3px solid ${palette.color}`,
        borderRadius: 7,
        background: palette.background,
        display: "grid",
        gap: 5,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 4,
          fontSize: 10,
          lineHeight: headerLineHeight,
        }}
      >
        <MathFormula tex={tex} />
        <MathFormula tex={shape} />
      </div>
      <div style={{ display: "grid", gap: 3 }}>
        {rows.map((row, index) =>
          row === "\\vdots" ? (
            <div key={index} style={{ textAlign: "center", fontSize: 9 }}>
              <MathFormula tex={row} />
            </div>
          ) : elementTex && rowLength ? (
            <VectorStrip
              key={index}
              name={row}
              length={rowLength}
              columns={elementColumns}
              elementTex={(column) => elementTex(index, column)}
              tone={tone}
              selected={selected === index}
              compact
            />
          ) : (
            <div
              key={index}
              style={{
                border: `1px solid ${selected === index ? COLORS.amber : palette.color}`,
                borderRadius: 4,
                background:
                  selected === index ? COLORS.amberSoft : palette.background,
                padding: "4px 2px",
                textAlign: "center",
                fontSize: 10,
              }}
            >
              <MathFormula tex={row} />
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function MergeArrows({
  count,
  target = 0.5,
}: {
  count: number;
  target?: number;
}) {
  const x = target * 400;
  return (
    <svg
      data-merge-arrows={count}
      aria-hidden
      viewBox="0 0 400 28"
      preserveAspectRatio="none"
      style={{ width: "100%", height: 28 }}
    >
      <path
        d={`${Array.from({ length: count }, (_, i) => `M${((i + 0.5) * 400) / count} 0 V12 H${x}`).join(" ")} M${x} 12 V26 M${x - 4} 21 L${x} 26 L${x + 4} 21`}
        fill="none"
        stroke={COLORS.green}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function SumCircle({ tone = "cyan" }: { tone?: DiagramTone }) {
  const palette = tonePalette(tone);
  return (
    <div
      data-sum-circle
      style={{
        width: 36,
        height: 36,
        boxSizing: "border-box",
        border: `2px solid ${palette.color}`,
        borderRadius: "50%",
        background: palette.background,
        display: "grid",
        placeItems: "center",
        fontSize: 20,
        flexShrink: 0,
      }}
    >
      <MathFormula tex="\Sigma" />
    </div>
  );
}

export function SumJunction({ count }: { count: number }) {
  return (
    <div
      data-sum-junction={count}
      style={{ display: "grid", justifyItems: "center", gap: 0, width: "100%" }}
    >
      <svg
        data-merge-arrows={count}
        aria-hidden
        viewBox="0 0 400 24"
        preserveAspectRatio="none"
        style={{ width: "100%", height: 24 }}
      >
        {Array.from({ length: count }, (_, i) => (
          <path
            key={i}
            data-sum-input={i}
            d={`M${((i + 0.5) * 400) / count} 0 V10 L200 24`}
            fill="none"
            stroke={COLORS.cyan}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <SumCircle />
      <svg
        data-sum-output
        aria-hidden
        width="20"
        height="18"
        viewBox="0 0 20 18"
      >
        <path
          d="M10 0 V17 M5 12 L10 17 L15 12"
          fill="none"
          stroke={COLORS.cyan}
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

export function StackedSum({ children }: { children: ReactNode[] }) {
  return (
    <div
      data-stacked-sum
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 64px",
        gridTemplateRows: "1fr 22px",
        minWidth: 0,
        flex: 1,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateRows: `repeat(${children.length},minmax(0,1fr))`,
        }}
      >
        {children.map((child, i) => (
          <div
            key={i}
            style={{ padding: "4px 0", display: "grid", alignItems: "center" }}
          >
            {child}
          </div>
        ))}
      </div>
      <div style={{ position: "relative" }}>
        <svg
          aria-hidden
          viewBox="0 0 64 100"
          preserveAspectRatio="none"
          style={{ position: "absolute", width: "100%", height: "100%" }}
        >
          {children.map((_, i) => (
            <path
              key={i}
              data-sum-input={i}
              d={`M0 ${((i + 0.5) * 100) / children.length} L32 50`}
              fill="none"
              stroke={COLORS.cyan}
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path
            data-sum-output
            d="M32 50 V100"
            fill="none"
            stroke={COLORS.cyan}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          style={{ position: "absolute", left: 14, top: "calc(50% - 18px)" }}
        >
          <SumCircle />
        </div>
      </div>
      <div
        data-sum-result-line
        style={{ gridColumn: "1 / -1", position: "relative", height: 22 }}
      >
        <span
          style={{
            position: "absolute",
            right: 32,
            top: 0,
            height: 9,
            borderLeft: `1.5px solid ${COLORS.cyan}`,
          }}
        />
        <span
          style={{
            position: "absolute",
            left: "50%",
            right: 32,
            top: 9,
            borderTop: `1.5px solid ${COLORS.cyan}`,
          }}
        />
        <svg
          aria-hidden
          width="20"
          height="13"
          viewBox="0 0 20 13"
          style={{ position: "absolute", left: "calc(50% - 10px)", top: 9 }}
        >
          <path
            d="M10 0 V12 M5 7 L10 12 L15 7"
            fill="none"
            stroke={COLORS.cyan}
            strokeWidth="1.5"
          />
        </svg>
      </div>
    </div>
  );
}

export function FeatureVector({
  name,
  scalar,
  tone = "blue",
}: {
  name: string;
  scalar: (column: string) => string;
  tone?: DiagramTone;
}) {
  const palette = tonePalette(tone);
  return (
    <div
      data-feature-vector={name}
      style={{
        border: `1px solid ${palette.color}`,
        background: palette.background,
        borderRadius: 7,
        padding: 6,
        minWidth: 0,
        display: "grid",
        gap: 5,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 6,
          fontSize: 12,
        }}
      >
        <MathFormula tex={name} />
        <MathFormula tex="1\times5120" />
      </div>
      <VectorStrip
        name=""
        nameWidth={0}
        length="5120"
        elementTex={scalar}
        tone={tone}
        compact
      />
    </div>
  );
}

export function TensorHeading({
  name,
  shape,
}: {
  name: string;
  shape: string;
}) {
  return (
    <div
      data-tensor-heading
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 10,
      }}
    >
      <MathFormula tex={name} />
      <span style={{ fontSize: 11 }}>
        <MathFormula tex={shape} />
      </span>
    </div>
  );
}

export function SplitArrows({ count }: { count: number }) {
  return (
    <svg
      data-split-arrows={count}
      aria-hidden
      viewBox="0 0 400 28"
      preserveAspectRatio="none"
      style={{ width: "100%", height: 28 }}
    >
      <path
        d={`M200 0 V10 ${Array.from({ length: count }, (_, i) => {
          const x = ((i + 0.5) * 400) / count;
          return `M200 10 H${x} V26 M${x - 4} 21 L${x} 26 L${x + 4} 21`;
        }).join(" ")}`}
        fill="none"
        stroke={COLORS.green}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
