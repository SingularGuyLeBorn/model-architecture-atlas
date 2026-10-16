import React, {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { latexHtml } from "./EditableArchitectureGraph";
import { MathMarkup } from "./MathMarkup";

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
    <MathMarkup
      tex={tex}
      html={html}
      style={{ fontSize: "max(1em, 10.5px)" }}
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

// 汇入箭头按真实像素指向圆边，避免 SVG 非等比拉伸后箭头变形或藏进圆内。
function useDiagramSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 400, height: 100 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth,
        height = element.clientHeight;
      if (width && height)
        setSize((current) =>
          current.width === width && current.height === height
            ? current
            : { width, height },
        );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}

function arrowTip(x: number, y: number, angle: number) {
  const backX = x - 7 * Math.cos(angle),
    backY = y - 7 * Math.sin(angle);
  return `M${backX + 4 * Math.sin(angle)} ${backY - 4 * Math.cos(angle)} L${x} ${y} L${backX - 4 * Math.sin(angle)} ${backY + 4 * Math.cos(angle)}`;
}

/** 串行步骤可横排并折行；箭头依赖实际框边，不把换行误画成并行。 */
// [OM-FREEPLAY] 每段最小 680px、净空 48px 是排版取值；折回线占半个净空，窄框自动退回单列。
export function SerialFlow({
  children,
  returnColumn = false,
}: {
  children: ReactNode[];
  returnColumn?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const packed = returnColumn && children.length === 4 && wide;
  const [paths, setPaths] = useState<Array<{ line: string; arrow: string }>>(
    [],
  );
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const steps = [
      ...root.querySelectorAll<HTMLElement>(":scope > [data-serial-step]"),
    ];
    const measure = () => {
      const bounds = root.getBoundingClientRect();
      if (!bounds.width || !root.offsetWidth) return;
      setWide(root.offsetWidth >= 680 * 2 + 48);
      const scale = bounds.width / root.offsetWidth;
      const rects = steps.map((step) => {
        const r = step.getBoundingClientRect();
        return {
          left: (r.left - bounds.left) / scale,
          right: (r.right - bounds.left) / scale,
          top: (r.top - bounds.top) / scale,
          bottom: (r.bottom - bounds.top) / scale,
          width: r.width / scale,
          height: r.height / scale,
        };
      });
      const next = rects.slice(1).map((to, i) => {
        const from = rects[i];
        if (packed && i === 1) {
          const y2 = to.top + to.height / 2;
          const mid = (from.left + to.right) / 2;
          return {
            line: `M${from.left + from.width / 2} ${from.bottom} V${from.bottom + 24} H${mid} V${y2} H${to.right}`,
            arrow: arrowTip(to.right, y2, Math.PI),
          };
        }
        if (Math.abs(from.top - to.top) < 2) {
          const y1 = from.top + from.height / 2,
            y2 = packed
              ? Math.min(to.bottom - 12, Math.max(to.top + 12, y1))
              : to.top + to.height / 2,
            mid = (from.right + to.left) / 2;
          return {
            line: `M${from.right} ${y1} H${mid} V${y2} H${to.left}`,
            arrow: arrowTip(to.left, y2, 0),
          };
        }
        const rowBottom = packed
          ? from.bottom
          : Math.max(
              ...rects
                .filter((rect) => Math.abs(rect.top - from.top) < 2)
                .map((rect) => rect.bottom),
            );
        const x1 = from.left + from.width / 2,
          x2 = to.left + to.width / 2,
          mid = (rowBottom + to.top) / 2;
        return {
          line: `M${x1} ${from.bottom} V${mid} H${x2} V${to.top}`,
          arrow: arrowTip(x2, to.top, Math.PI / 2),
        };
      });
      setPaths((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    [root, ...steps].forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [children.length, packed]);
  return (
    <div
      ref={ref}
      data-serial-flow={packed ? "return-column" : "rows"}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,680px),1fr))",
        gap: 48,
        alignItems: "start",
      }}
    >
      {children.map((child, i) => (
        <section
          key={i}
          data-serial-step={i + 1}
          style={{
            minWidth: 0,
            display: "grid",
            gap: 8,
            ...(packed
              ? {
                  gridColumn: i === 1 ? 2 : 1,
                  gridRow: i === 1 ? "1 / span 3" : i === 0 ? 1 : i,
                }
              : {}),
          }}
        >
          {child}
        </section>
      ))}
      <svg
        aria-hidden
        data-serial-links
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          overflow: "visible",
        }}
      >
        {paths.map((path, i) => (
          <g key={i}>
            <path
              data-serial-link={i}
              d={path.line}
              fill="none"
              stroke={COLORS.green}
              strokeWidth={1.5}
            />
            <path
              d={path.arrow}
              fill="none"
              stroke={COLORS.green}
              strokeWidth={1.5}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

export function SumJunction({ count }: { count: number }) {
  const { ref, width } = useDiagramSize();
  const center = width / 2;
  return (
    <div
      ref={ref}
      data-sum-junction={count}
      style={{ position: "relative", height: 78, width: "100%" }}
    >
      <svg
        data-merge-arrows={count}
        aria-hidden
        viewBox={`0 0 ${width} 78`}
        style={{ width: "100%", height: 78, display: "block" }}
      >
        {Array.from({ length: count }, (_, i) => {
          const angle =
            count === 1
              ? 0
              : -Math.PI / 3 + (i * ((2 * Math.PI) / 3)) / (count - 1);
          const x = center + 18 * Math.sin(angle),
            y = 42 - 18 * Math.cos(angle);
          const start = ((i + 0.5) * width) / count;
          return (
            <g key={i}>
              <path
                data-sum-input={i}
                d={`M${start} 0 V8 L${x} ${y}`}
                fill="none"
                stroke={COLORS.cyan}
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
              <path
                data-sum-input-arrow={i}
                d={arrowTip(x, y, Math.atan2(y - 8, x - start))}
                fill="none"
                stroke={COLORS.cyan}
                strokeWidth={1.5}
              />
            </g>
          );
        })}
        <path
          data-sum-output
          d={`M${center} 60 V77 M${center - 5} 72 L${center} 77 L${center + 5} 72`}
          fill="none"
          stroke={COLORS.cyan}
          strokeWidth="1.5"
        />
      </svg>
      <div style={{ position: "absolute", left: "calc(50% - 18px)", top: 24 }}>
        <SumCircle />
      </div>
    </div>
  );
}

export function StackedSum({
  children,
  omittedBefore,
}: {
  children: ReactNode[];
  omittedBefore?: number;
}) {
  const { ref, height } = useDiagramSize();
  const slots = children.length + (omittedBefore === undefined ? 0 : 1);
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
          gridTemplateRows: `repeat(${slots},minmax(0,1fr))`,
        }}
      >
        {children.map((child, i) => (
          <React.Fragment key={i}>
            {i === omittedBefore && (
              <div
                data-sum-omitted
                style={{ display: "grid", placeItems: "center" }}
              >
                <MathFormula tex="\vdots" />
              </div>
            )}
            <div
              style={{
                padding: "4px 0",
                display: "grid",
                alignItems: "center",
              }}
            >
              {child}
            </div>
          </React.Fragment>
        ))}
      </div>
      <div ref={ref} style={{ position: "relative" }}>
        <svg
          aria-hidden
          viewBox={`0 0 64 ${height}`}
          style={{ position: "absolute", width: "100%", height: "100%" }}
        >
          {children.map((_, i) => {
            const slot =
              i + (omittedBefore !== undefined && i >= omittedBefore ? 1 : 0);
            const startY = ((slot + 0.5) * height) / slots;
            const angle = Math.atan2(height / 2 - startY, 32);
            const x = 32 - 18 * Math.cos(angle),
              y = height / 2 - 18 * Math.sin(angle);
            return (
              <g key={i}>
                <path
                  data-sum-input={i}
                  d={`M0 ${startY} L${x} ${y}`}
                  fill="none"
                  stroke={COLORS.cyan}
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  data-sum-input-arrow={i}
                  d={arrowTip(x, y, angle)}
                  fill="none"
                  stroke={COLORS.cyan}
                  strokeWidth={1.5}
                />
              </g>
            );
          })}
          <path
            data-sum-output
            d={`M32 ${height / 2 + 18} V${height}`}
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
