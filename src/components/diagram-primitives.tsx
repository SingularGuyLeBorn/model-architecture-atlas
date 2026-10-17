import { frameColor } from "./diagram-appearance";
import React, {
  memo,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SVGProps,
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
  | "plum"
  | "indigo"
  | "orange"
  | "olive"
  | "slate"
  | "ochre"
  | "forest"
  | "gold"
  | "teal"
  | "coral"
  | "lavender"
  | "sand"
  | "mint"
  | "crimson"
  | "ocean"
  | "cyan";
export const COLORS = {
  paper: "#ffffff",
  card: "#fffefa",
  ink: "#2a2924",
  muted: "#716d63",
  faint: "#a39e92",
  line: "#b9b5ac",
  green: "#327463",
  greenSoft: "#dceee3",
  amber: "#ad792a",
  amberSoft: "#f6e5c9",
  blue: "#547999",
  blueSoft: "#dfeaf5",
  rose: "#ac6575",
  roseSoft: "#f4dde4",
  plum: "#995b8b",
  plumSoft: "#eedcec",
  violet: "#795ca5",
  violetSoft: "#e7dcf6",
  cyan: "#2c8490",
  cyanSoft: "#d6edf0",
  // [OM-FREEPLAY] 靛蓝用于学习到的投影参数，与琥珀色缩放系数区分。
  indigo: "#5266a2",
  indigoSoft: "#dfe4f7",
  // [OM-FREEPLAY] 扩展语义色：Attention 概率、打分、归约量、反量化尺度。
  orange: "#b76126",
  orangeSoft: "#fae0ce",
  olive: "#6d782f",
  oliveSoft: "#e9edcf",
  slate: "#526a7a",
  slateSoft: "#dfe7eb",
  ochre: "#927638",
  ochreSoft: "#eee5c9",
  // [OM-FREEPLAY] 色相是视觉选择；角色在生产、暂存与消费端统一，不新增模型含义。
  forest: "#42652b",
  forestSoft: "#d2e5bc", // 压缩候选内容 v^c
  gold: "#8a680f",
  goldSoft: "#fff0a8", // 压缩权重 α
  teal: "#166d73",
  tealSoft: "#bce5df", // α ⊙ v^c
  coral: "#a85041",
  coralSoft: "#f8cdc1", // 池化结果 ĝ
  lavender: "#6850a1",
  lavenderSoft: "#d7cdf6", // Gate 投影参数
  sand: "#846047",
  sandSoft: "#e7d3bf", // mHC 偏置 b
  mint: "#39764e",
  mintSoft: "#c2f0cf", // mHC sigmoid 中间结果
  crimson: "#a13e58",
  crimsonSoft: "#f3c2d3", // RMSNorm 可学习缩放 γ
  // [OM-FREEPLAY] 全局缓存专用海蓝，避免与输入蓝、本地绿共用身份。
  ocean: "#246aab",
  oceanSoft: "#c5e2fc",
};

/** 对象身份映射；选中、追加状态不能覆盖这些来源色。 */
export const CACHE_TONES = {
  local: "green",
  global: "ocean",
} as const;

// Indexer 的 Query / Key / Head 系数 / 分数 / 行号是不同对象，贯穿生成和消费。
export const INDEX_TONES = {
  query: "blue",
  key: "green",
  headWeight: "amber",
  headScore: "olive",
  score: "plum",
  indices: "amber",
  mask: "violet",
} as const;

export const COMPRESSION_TONES = {
  candidate: "forest",
  gateParameter: "lavender",
  gateScore: "plum",
  weight: "gold",
  product: "teal",
  pooled: "coral",
} as const;

export const MathFormula = memo(function MathFormula({
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
});

export function Box({
  children,
  tone = "neutral",
  expanded = false,
  selected = false,
}: {
  children: ReactNode;
  tone?: DiagramTone;
  expanded?: boolean;
  selected?: boolean;
}) {
  const { color, background } = selected
    ? selectionPalette(tone)
    : tonePalette(tone);
  return (
    <div
      data-expanded-tensor={expanded || undefined}
      data-tone={tone}
      data-semantic-selected={selected || undefined}
      style={{
        minWidth: 0,
        width: "fit-content",
        maxWidth: "100%",
        justifySelf: "center",
        border: `1.5px solid ${tone === "neutral" ? color : frameColor(color)}`,
        borderRadius: 8,
        padding: "7px 8px",
        background: expanded ? "transparent" : background,
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

// 列名只表示整列的引用；没有展开列元素时，尺寸由公式决定。
export function ParameterColumn({
  tex,
  tone = "indigo",
}: {
  tex: string;
  tone?: DiagramTone;
}) {
  const palette = tonePalette(tone);
  return (
    <div
      data-parameter-column
      style={{
        display: "grid",
        placeItems: "center",
        width: "max-content",
        height: "max-content",
        placeSelf: "center",
        border: `1px solid ${frameColor(palette.color)}`,
        borderRadius: 4,
        padding: "4px 8px",
        background: palette.background,
      }}
    >
      <MathFormula tex={tex} />
    </div>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <div
      data-module-title
      style={{
        padding: "10px 14px 9px",
        borderBottom: `1px solid ${COLORS.line}`,
        fontSize: 21,
        fontWeight: 800,
      }}
    >
      {children}
    </div>
  );
}

export function ModuleHeading({ children }: { children: ReactNode }) {
  // [OM-FREEPLAY] 字号按 2px 一档提高三档；子模块保留低于顶层标题的层级。
  return (
    <strong data-module-title style={{ fontSize: 19, lineHeight: 1.4 }}>
      {children}
    </strong>
  );
}

/** 独立支路有自己的透明边界；不是张量，也不承担输入输出端口。 */
export function BranchFrame({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      data-branch-frame
      style={{
        border: `1px solid ${COLORS.line}`,
        borderRadius: 8,
        padding: 10,
        display: "grid",
        gap: 8,
        minWidth: "min-content",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <strong
        data-branch-title
        style={{ borderBottom: `1px solid ${COLORS.line}`, paddingBottom: 6 }}
      >
        {title}
      </strong>
      {children}
    </section>
  );
}

/** 省略的同构对象占据整个所属轨道，点串在该区域中心，而非标题旁。 */
export function StructureEllipsis({
  vertical = false,
}: {
  vertical?: boolean;
}) {
  return (
    <span
      data-structure-ellipsis
      style={{
        display: "grid",
        placeItems: "center",
        alignSelf: "stretch",
        justifySelf: "stretch",
        color: COLORS.muted,
      }}
    >
      <MathFormula tex={vertical ? "\\vdots" : "\\cdots"} />
    </span>
  );
}

/** 说明在框外；数据框只包含变量、维度与代表元素。 */
export function ExpandedVector({
  name,
  length,
  elementTex,
  tone = "green",
  title,
}: {
  name: string;
  length: string;
  elementTex: (column: string) => string;
  tone?: DiagramTone;
  title?: string;
}) {
  return (
    <div
      data-labelled-vector
      style={{
        display: "grid",
        gap: 4,
        justifyItems: "center",
        width: "fit-content",
        justifySelf: "center",
      }}
    >
      {title && <strong data-tensor-caption>{title}</strong>}
      <Box tone={tone} expanded>
        <TensorHeading name={name} shape={`1\\times${length}`} />
        <VectorStrip
          name=""
          nameWidth={0}
          length={length}
          elementTex={elementTex}
          tone={tone}
          uniformCells
        />
      </Box>
    </div>
  );
}

export function tonePalette(tone: DiagramTone) {
  return tone === "neutral"
    ? { color: COLORS.line, background: COLORS.card }
    : { color: COLORS[tone], background: COLORS[`${tone}Soft`] };
}

/** 选中可同色加深或琥珀填充，描边始终保留来源身份。 */
export function selectionPalette(
  tone: DiagramTone,
  style: "deepen" | "amber" = "deepen",
) {
  const palette = tonePalette(tone);
  if (style === "amber") return { ...palette, background: COLORS.amberSoft };
  // [OM-FREEPLAY] 20% 描边色混入浅底，兼顾选区辨识与深色公式的可读性。
  const background = `#${[1, 3, 5]
    .map((i) =>
      Math.round(
        parseInt(palette.background.slice(i, i + 2), 16) * 0.8 +
          parseInt(palette.color.slice(i, i + 2), 16) * 0.2,
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
  return { color: palette.color, background };
}

export function VectorStrip({
  name,
  length,
  elementTex,
  tone = "neutral",
  compact = false,
  selected = false,
  selectionStyle = "deepen",
  columns: displayedColumns,
  nameWidth,
  nameLineHeight,
  outlineSelection = true,
  contentWidth = true,
  columnSubgrid = false,
  uniformCells = false,
  cellPadding = 8,
}: {
  name: string;
  length: string;
  elementTex: (column: string) => string;
  tone?: DiagramTone;
  compact?: boolean;
  selected?: boolean;
  selectionStyle?: "deepen" | "amber";
  columns?: string[];
  nameWidth?: number;
  nameLineHeight?: number;
  outlineSelection?: boolean;
  contentWidth?: boolean;
  columnSubgrid?: boolean;
  uniformCells?: boolean;
  cellPadding?: number;
}) {
  const palette = selected
    ? selectionPalette(tone, selectionStyle)
    : tonePalette(tone);
  const columns = displayedColumns ?? ["1", "2", "\\cdots", length];
  return (
    <div
      data-vector-elements
      data-tone={tone}
      data-content-width={contentWidth || undefined}
      data-vector-selected={selected || undefined}
      data-selection-style={selected ? selectionStyle : undefined}
      style={{
        minWidth: 0,
        justifySelf: "center",
        width: contentWidth && !columnSubgrid ? "max-content" : undefined,
        maxWidth: contentWidth ? "100%" : undefined,
        display: "grid",
        gridColumn: columnSubgrid ? "1 / -1" : undefined,
        gridTemplateColumns: columnSubgrid
          ? "subgrid"
          : `${nameWidth ?? (compact ? 52 : 92)}px ${contentWidth ? "max-content" : "minmax(0,1fr)"}`,
        gap: uniformCells ? 3 : 5,
        alignItems: uniformCells ? "stretch" : "center",
        padding: uniformCells ? "2px 0" : compact ? 2 : 5,
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
          alignSelf: uniformCells ? "center" : undefined,
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
          gridColumn: columnSubgrid ? "2 / -1" : undefined,
          gridTemplateColumns: columnSubgrid
            ? "subgrid"
            : columns
                .map((column) =>
                  contentWidth
                    ? column === "\\cdots"
                      ? "24px"
                      : uniformCells
                        ? "minmax(max-content,1fr)"
                        : "max-content"
                    : column === "\\cdots"
                      ? ".55fr"
                      : "minmax(0,1fr)",
                )
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
              data-vector-cell
              style={{
                minWidth: 0,
                display: uniformCells ? "grid" : undefined,
                placeItems: uniformCells ? "center" : undefined,
                padding: contentWidth
                  ? compact
                    ? `2px ${cellPadding}px`
                    : `4px ${cellPadding}px`
                  : compact
                    ? "2px 3px"
                    : "4px 3px",
                border: `1px solid ${frameColor(palette.color)}`,
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

/** 数据列共用最长内容的尺寸；行名与省略列单独占轨道。 */
export function matrixColumnTracks(columns: string[], nameTrack = "52px") {
  return `${nameTrack} ${columns.map((column) => (column === "\\cdots" ? "24px" : "minmax(max-content, 1fr)")).join(" ")}`;
}

/** 沿每个已展示的数据列省略，不能用整行中央的一个点串代替。 */
export function MatrixEllipsis({ columns }: { columns: string[] }) {
  return (
    <div
      data-matrix-ellipsis-row
      style={{
        display: "grid",
        gridColumn: "1 / -1",
        gridTemplateColumns: "subgrid",
        textAlign: "center",
        alignItems: "center",
        fontSize: 9,
      }}
    >
      <span />
      {columns.map((column, index) =>
        column === "\\cdots" ? (
          <span key={index} />
        ) : (
          <span key={index} data-matrix-ellipsis-column={column}>
            <MathFormula tex="\vdots" />
          </span>
        ),
      )}
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
  tone?: DiagramTone;
  vectorLength?: string;
  lastRow?: string;
  rowIndices?: string[];
}) {
  const rows = rowIndices ?? ["1", "2", "\\vdots", lastRow];
  const columns = ["1", "2", "3", "\\cdots", vectorLength];
  const palette = tonePalette(tone);
  return (
    <div
      data-expanded-tensor
      data-uniform-matrix
      style={{
        width: "fit-content",
        maxWidth: "100%",
        justifySelf: "center",
        border: `1.5px solid ${frameColor(palette.color)}`,
        borderRadius: 9,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "6px 9px",
          background: "transparent",
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
          width: "max-content",
          justifySelf: "center",
          gridTemplateColumns: matrixColumnTracks(columns),
          gridTemplateRows: rows
            .map((row) => (row === "\\vdots" ? "min-content" : "1fr"))
            .join(" "),
          gap: 3,
          borderTop: `1px solid ${COLORS.line}`,
          fontSize: 9.5,
        }}
      >
        {rows.map((row, index) =>
          row === "\\vdots" ? (
            <MatrixEllipsis key={`${row}-${index}`} columns={columns} />
          ) : (
            <VectorStrip
              key={`${row}-${index}`}
              name={rowTex(row)}
              length={vectorLength}
              columns={columns}
              elementTex={(column) => elementTex(row, column)}
              selected={rowIndices !== undefined && row === "t"}
              tone={tone}
              compact
              columnSubgrid
              uniformCells
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
  columnLabels,
  headerLineHeight,
  contentWidth = true,
}: {
  tex: string;
  shape: string;
  rows: string[];
  selected?: number;
  tone?: DiagramTone;
  rowLength?: string;
  elementTex?: (rowIndex: number, column: string) => string;
  elementColumns?: string[];
  columnLabels?: string[];
  headerLineHeight?: number;
  contentWidth?: boolean;
}) {
  const palette = tonePalette(tone);
  const columns = elementColumns ?? ["1", "2", "\\cdots", rowLength ?? "5120"];
  const columnSubgrid = contentWidth && Boolean(elementTex && rowLength);
  return (
    <div
      data-expanded-tensor
      data-content-width={contentWidth || undefined}
      data-uniform-matrix={columnSubgrid || undefined}
      style={{
        // 内容宽度包含行名、共享列轨道、标题、内边距和边框，不能被父栏压窄。
        minWidth: contentWidth ? "max-content" : 0,
        width: contentWidth ? "max-content" : undefined,
        justifySelf: "center",
        padding: 6,
        border: `1.3px solid ${frameColor(palette.color)}`,
        borderRadius: 7,
        background: "transparent",
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
      <div
        style={{
          display: "grid",
          gap: 3,
          width: columnSubgrid ? "max-content" : undefined,
          justifySelf: columnSubgrid ? "center" : undefined,
          gridTemplateColumns: columnSubgrid
            ? matrixColumnTracks(columns)
            : undefined,
          gridTemplateRows: columnSubgrid
            ? `${columnLabels ? "max-content " : ""}${rows.map((row) => (row === "\\vdots" ? "min-content" : "1fr")).join(" ")}`
            : undefined,
        }}
      >
        {columnSubgrid && columnLabels && (
          <div
            data-matrix-column-labels
            style={{
              display: "grid",
              gridColumn: "1 / -1",
              gridTemplateColumns: "subgrid",
              fontSize: 10,
              textAlign: "center",
            }}
          >
            <span>查询行</span>
            {columnLabels.map((label, i) => (
              <MathFormula key={i} tex={label} />
            ))}
          </div>
        )}
        {rows.map((row, index) =>
          row === "\\vdots" && columnSubgrid ? (
            <MatrixEllipsis key={index} columns={columns} />
          ) : row === "\\vdots" ? (
            <div
              key={index}
              style={{
                gridColumn: columnSubgrid ? "1 / -1" : undefined,
                textAlign: "center",
                fontSize: 9,
              }}
            >
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
              contentWidth={contentWidth}
              columnSubgrid={columnSubgrid}
              uniformCells={columnSubgrid}
            />
          ) : (
            <div
              key={index}
              style={{
                border: `1px solid ${palette.color}`,
                borderRadius: 4,
                background:
                  selected === index
                    ? selectionPalette(tone).background
                    : palette.background,
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

export function SumNode({ size = 36 }: { size?: number }) {
  return (
    <div
      data-sum-node
      style={{
        width: size,
        height: size,
        boxSizing: "border-box",
        border: `2px solid ${COLORS.ink}`,
        borderRadius: 0,
        background: "transparent",
        color: COLORS.ink,
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

// 汇入箭头按真实像素指向框边，避免 SVG 非等比拉伸后箭头变形。
function useDiagramSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 400, height: 100 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width,
        height = entry.contentRect.height;
      if (width && height)
        setSize((current) =>
          current.width === width && current.height === height
            ? current
            : { width, height },
        );
    });
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

// [OM-FREEPLAY] 命中带取 12px；细线保持原有外观，透明命中带用于选中内部连接。
function WirePath(
  props: SVGProps<SVGPathElement> & { "data-sum-input"?: number },
) {
  return (
    <g data-wire-path>
      <path {...props} />
      <path
        d={props.d}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        data-wire-hit
        data-wire-input={props["data-sum-input"]}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
      />
    </g>
  );
}

/** 串行步骤可横排并折行；箭头依赖实际框边，不把换行误画成并行。 */
// [OM-FREEPLAY] 按收紧后的矩阵内容为每段保留 640px、净空 48px；折回线占半个净空，窄框自动退回单列。
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
      setWide(root.offsetWidth >= 640 * 2 + 48);
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
    // 由浏览器完成本批 DOM/MathML 更新后通知实际几何，避免多个布局 effect 交错读写强制重排。
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
        gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,640px),1fr))",
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
            <WirePath
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

export function SumJunction({
  count,
  sourceSelector,
  targetSelector,
  inputColor = COLORS.cyan,
  outputColor = COLORS.cyan,
}: {
  count: number;
  sourceSelector?: string;
  targetSelector?: string;
  inputColor?: string;
  outputColor?: string;
}) {
  const marker = `sum-arrow-${useId().replace(/:/g, "")}`;
  const { ref, width } = useDiagramSize();
  const radius = count > 2 ? 32 : 18;
  const centerY = radius + 24;
  const height = radius * 2 + 42;
  const [ports, setPorts] = useState<{
    sources: { x: number; y: number }[];
    target: { x: number; y: number };
  }>();
  useLayoutEffect(() => {
    const root = ref.current,
      parent = root?.parentElement;
    if (!root || !parent || !sourceSelector || !targetSelector) return;
    const sources = [...parent.querySelectorAll<HTMLElement>(sourceSelector)];
    const target = parent.querySelector<HTMLElement>(targetSelector);
    if (sources.length !== count || !target) return;
    const measure = () => {
      const bounds = root.getBoundingClientRect();
      if (!bounds.width || !root.offsetWidth) return;
      const scale = bounds.width / root.offsetWidth;
      const point = (element: HTMLElement, bottom: boolean) => {
        const r = element.getBoundingClientRect();
        return {
          x: (r.left + r.width / 2 - bounds.left) / scale,
          y: ((bottom ? r.bottom : r.top) - bounds.top) / scale,
        };
      };
      const next = {
        sources: sources.map((el) => point(el, true)),
        target: point(target, false),
      };
      setPorts((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    const observer = new ResizeObserver(measure);
    [root, parent, ...sources, target].forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [count, sourceSelector, targetSelector, ref]);
  return (
    <div
      ref={ref}
      data-sum-junction={count}
      style={{ position: "relative", height, width: "100%" }}
    >
      <svg
        data-merge-arrows={count}
        aria-hidden
        style={{
          width: "100%",
          height,
          display: "block",
          overflow: ports ? "visible" : undefined,
        }}
      >
        <defs>
          {[inputColor, outputColor].map((color, index) => (
            <marker
              key={index}
              id={`${marker}-${index}`}
              markerWidth="9"
              markerHeight="9"
              refX="8"
              refY="4"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path
                d="M1 1 L8 4 L1 7"
                fill="none"
                stroke={color}
                strokeWidth="1.5"
              />
            </marker>
          ))}
        </defs>
        {Array.from({ length: count }, (_, i) => {
          const sourceX = ports?.sources[i].x ?? ((i + 0.5) * width) / count;
          const sourceOffset = sourceX - width / 2;
          // 中间输入直达上边；两侧来源分别接左右边，外侧横段低于内侧，互不交叉。
          const straight = Math.abs(sourceOffset) < radius - 8;
          const x = straight
            ? sourceX
            : width / 2 + Math.sign(sourceOffset) * radius;
          const sideCount = Math.floor(count / 2);
          const rank = Math.min(i, count - 1 - i);
          const y = straight
            ? centerY - radius
            : centerY +
              radius -
              12 -
              rank * ((2 * radius - 24) / Math.max(1, sideCount - 1));
          return (
            <WirePath
              key={i}
              data-sum-input={i}
              data-sum-input-arrow={i}
              d={`M${sourceX} ${ports?.sources[i].y ?? 0} V${y}${straight ? "" : ` H${x}`}`}
              markerEnd={`url(#${marker}-0)`}
              fill="none"
              stroke={inputColor}
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        <path
          data-sum-output
          d={
            ports && Math.abs(ports.target.x - width / 2) > 0.5
              ? `M${width / 2} ${centerY + radius} V${(centerY + radius + ports.target.y) / 2} H${ports.target.x} V${ports.target.y}`
              : `M${width / 2} ${centerY + radius} V${ports?.target.y ?? height - 1}`
          }
          markerEnd={`url(#${marker}-1)`}
          fill="none"
          stroke={outputColor}
          strokeWidth="1.5"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: `calc(50% - ${radius}px)`,
          top: 24,
        }}
      >
        <SumNode size={radius * 2} />
      </div>
    </div>
  );
}

export function StackedSum({
  children,
  omittedBefore,
  outputDirection = "bottom",
}: {
  children: ReactNode[];
  omittedBefore?: number;
  outputDirection?: "bottom" | "right";
}) {
  const { ref, height } = useDiagramSize();
  const { ref: resultRef, width: resultWidth } = useDiagramSize();
  // [OM-FREEPLAY] 在原有通道内为右侧出线预留 12px 起步段与至少 10px 箭头引入段。
  const wireWidth = 88;
  const centerX = 44;
  const outputX = 80;
  const outputInset = wireWidth - outputX;
  const omittedHeight = omittedBefore === undefined ? 0 : 18;
  const tracks = children.flatMap((_, i) =>
    i === omittedBefore ? ["18px", "minmax(0,1fr)"] : ["minmax(0,1fr)"],
  );
  return (
    <div
      data-stacked-sum
      style={{
        display: "grid",
        gridTemplateColumns: `max-content ${wireWidth}px`,
        gridTemplateRows: outputDirection === "right" ? "1fr" : "1fr 22px",
        minWidth: 0,
        width: "fit-content",
        maxWidth: "100%",
        alignSelf: "center",
        justifySelf: "center",
        marginInline: "auto",
        flex: outputDirection === "right" ? "0 0 auto" : 1,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateRows: tracks.join(" "),
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
              data-sum-operand={i}
              style={{
                padding: "4px 0",
                display: "flex",
                justifyContent: "flex-end",
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
          viewBox={`0 0 ${wireWidth} ${height}`}
          style={{ position: "absolute", width: "100%", height: "100%" }}
        >
          {children.map((_, i) => {
            const startY =
              ((i + 0.5) * (height - omittedHeight)) / children.length +
              (omittedBefore !== undefined && i >= omittedBefore
                ? omittedHeight
                : 0);
            const top = children.length > 2 && i === 0;
            const bottom = children.length > 2 && i === children.length - 1;
            const middleCount =
              children.length > 2 ? children.length - 2 : children.length;
            const rank = children.length > 2 ? i - 1 : i;
            const x = top || bottom ? centerX : centerX - 18;
            const y =
              height / 2 +
              (top
                ? -18
                : bottom
                  ? 18
                  : middleCount === 1
                    ? 0
                    : -8 + (rank * 16) / (middleCount - 1));
            const laneX = 12;
            return (
              <g key={i}>
                <WirePath
                  data-sum-input={i}
                  d={
                    top || bottom
                      ? `M0 ${startY} H${x} V${y}`
                      : Math.abs(startY - y) < 0.01
                        ? `M0 ${startY} H${x}`
                        : `M0 ${startY} H${laneX} V${y} H${x}`
                  }
                  fill="none"
                  stroke={COLORS.cyan}
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  data-sum-input-arrow={i}
                  d={arrowTip(
                    x,
                    y,
                    top ? Math.PI / 2 : bottom ? -Math.PI / 2 : 0,
                  )}
                  fill="none"
                  stroke={COLORS.cyan}
                  strokeWidth={1.5}
                />
              </g>
            );
          })}
          <path
            data-sum-output
            d={
              outputDirection === "right"
                ? `M${centerX + 18} ${height / 2} H${wireWidth}`
                : `M${centerX + 18} ${height / 2} H${outputX} V${height}`
            }
            fill="none"
            stroke={COLORS.cyan}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          {outputDirection === "right" && (
            <path
              d={arrowTip(wireWidth, height / 2, 0)}
              fill="none"
              stroke={COLORS.cyan}
              strokeWidth="1.5"
            />
          )}
        </svg>
        <div
          style={{
            position: "absolute",
            left: centerX - 18,
            top: "calc(50% - 18px)",
          }}
        >
          <SumNode />
        </div>
      </div>
      {outputDirection === "bottom" && (
        <div
          ref={resultRef}
          data-sum-result-line
          style={{
            gridColumn: "1 / -1",
            position: "relative",
            height: 22,
            minWidth: 0,
          }}
        >
          <svg
            aria-hidden
            width="100%"
            height="22"
            style={{ position: "absolute", inset: 0, display: "block" }}
          >
            <WirePath
              d={`M${resultWidth - outputInset} 0 V9 H${resultWidth / 2} V21`}
              fill="none"
              stroke={COLORS.cyan}
              strokeWidth="1.5"
            />
            <path
              d={arrowTip(resultWidth / 2, 21, Math.PI / 2)}
              fill="none"
              stroke={COLORS.cyan}
              strokeWidth="1.5"
            />
          </svg>
        </div>
      )}
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
      data-expanded-tensor
      style={{
        width: "max-content",
        maxWidth: "100%",
        justifySelf: "center",
        marginInline: "auto",
        border: `1px solid ${frameColor(palette.color)}`,
        background: "transparent",
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
        cellPadding={4}
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
