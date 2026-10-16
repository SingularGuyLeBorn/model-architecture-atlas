import { frameColor } from "../components/diagram-appearance";
import {
  MathFormula,
  Box,
  Arrow,
  Operator,
  Title,
  tonePalette,
  VectorStrip,
  Matrix,
  RowMatrix,
  MergeArrows,
  SumCircle,
  SumJunction,
  StackedSum,
  SerialFlow,
  FeatureVector,
  TensorHeading,
  SplitArrows,
  COLORS,
  type DiagramTone,
} from "../components/diagram-primitives";
import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  MhcFlatten,
  MhcJointNorm,
  MhcProjection,
  MhcGate,
  SigmoidDefinition,
  MhcSinkhorn,
} from "../components/MhcCoefficientStages";
import { BookOpen } from "lucide-react";
import {
  ModuleInspector,
  explainModule,
  inspectorReducer,
  type InspectorState,
  type ModuleConnection,
} from "../components/ModuleInspector";
import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  type Connection,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  EditableOrthogonalEdge,
  EditableConnectionLine,
  ConnectionGestureControl,
  EditHistoryProvider,
  EightConnectionPorts,
  EightResizeHandles,
  findBoundaryConnection,
  architectureFanoutGap,
  architectureArrowMarker,
  type BoundaryAnchor,
  type EditableEdge,
  type EditableEdgeData,
} from "../components/EditableArchitectureGraph";

type LayerMode = "swa" | "full" | "reindex" | "reuse";
type ExecutionPhase = "prefill" | "decode";
const ExecutionContext = createContext<ExecutionPhase>("prefill");
// 当前计算的 token 轴与缓存的历史轴分别建模，Decode 的一行仍使用全局位置 t。
export function executionAxis(phase: ExecutionPhase) {
  return {
    count: phase === "prefill" ? "N" : "1",
    rows:
      phase === "prefill" ? ["1", "2", "\\vdots", "t", "\\vdots", "N"] : ["t"],
  };
}
function useExecutionAxis() {
  const phase = useContext(ExecutionContext);
  return { phase, ...executionAxis(phase) };
}
type NodeKind =
  | "tokenizer"
  | "embedding"
  | "prior-layers"
  | "hc-expand"
  | "hc-pre"
  | "hc-mix"
  | "engram-lookup"
  | "engram-inject"
  | "execution-guide"
  | "query-row"
  | "tensor"
  | "norm1"
  | "query-norm"
  | "projection-q"
  | "projection-kv"
  | "swa-window"
  | "swa-output"
  | "compressor"
  | "indexer"
  | "global-select"
  | "kv-merge"
  | "heads"
  | "concat"
  | "add1"
  | "state1"
  | "norm2"
  | "moe-input"
  | "router"
  | "scores"
  | "experts"
  | "expert-output"
  | "expert-weight"
  | "expert-scale"
  | "expert-weighted"
  | "moe-sum"
  | "moe-output"
  | "add2"
  | "output"
  | "next-inputs"
  | "structure"
  | "structure-group"
  | "structure-operator";

type DiagramData = {
  kind: NodeKind;
  layer: number;
  mode: LayerMode;
  title?: string;
  tex?: string;
  subtitle?: string;
  tone?: DiagramTone;
  matrixRows?: string[];
  matrixRowCells?: string[][];
  vectorCells?: string[];
  columnVectors?: boolean;
  matrixSelectedRow?: number;
  expertId?: number;
  phase?: ExecutionPhase;
  queryNormHeight?: number;
  sublayer?: "A" | "F";
};
type DiagramNode = Node<DiagramData>;
type Props = { initialLayer?: number };

// [OM-FREEPLAY] 数值仅展示 Router 排序、选择与加权关系，不代表真实 token 的输出。
const ROUTED_EXPERTS = [
  { id: 7, score: ".91" },
  { id: 31, score: ".86" },
  { id: 96, score: ".79" },
  { id: 142, score: ".73" },
  { id: 228, score: ".69" },
  { id: 351, score: ".64" },
] as const;
const VISIBLE_ROUTED_EXPERTS = [
  ROUTED_EXPERTS[0],
  ROUTED_EXPERTS[1],
  ROUTED_EXPERTS[5],
] as const;
const EXPERT_ELLIPSIS_WIDTH = 56;
const EXPERT_GRID_COLUMNS = `minmax(0,1fr) minmax(0,1fr) ${EXPERT_ELLIPSIS_WIDTH}px minmax(0,1fr)`;

// [OM-FREEPLAY] 为专家内两列展开矩阵预留组宽；端口与得分列由同一组参数推导。
const EXPERTS_WIDTH = 2800;
// [OM-FREEPLAY] 系数支路放在最宽主流程右侧，180px 留给长距离传递的转折通道。
const COMPRESSOR_X = 2620;
const COMPRESSOR_WIDTH = 800;
const HC_COEFFICIENT_X =
  Math.max(70 + EXPERTS_WIDTH, COMPRESSOR_X + COMPRESSOR_WIDTH) + 180;
const EXPERTS_PADDING = 12;
const SHARED_GROUP_WIDTH = 600;
const EXPERT_GROUP_GAP = 18;
const EXPERT_GROUP_INSET = 11;
const EXPERT_CARD_GAP = 8;
const ROUTED_CONTENT_START =
  EXPERTS_PADDING + SHARED_GROUP_WIDTH + EXPERT_GROUP_GAP + EXPERT_GROUP_INSET;
const ROUTED_CONTENT_WIDTH =
  EXPERTS_WIDTH -
  2 * EXPERTS_PADDING -
  SHARED_GROUP_WIDTH -
  EXPERT_GROUP_GAP -
  2 * EXPERT_GROUP_INSET;
const EXPERT_CARD_WIDTH =
  (ROUTED_CONTENT_WIDTH - EXPERT_ELLIPSIS_WIDTH - 3 * EXPERT_CARD_GAP) /
  VISIBLE_ROUTED_EXPERTS.length;
const ROUTED_HANDLE_LEFT = VISIBLE_ROUTED_EXPERTS.map(
  (_, index) =>
    (100 *
      (ROUTED_CONTENT_START +
        index * (EXPERT_CARD_WIDTH + EXPERT_CARD_GAP) +
        (index === 2 ? EXPERT_ELLIPSIS_WIDTH + EXPERT_CARD_GAP : 0) +
        EXPERT_CARD_WIDTH / 2)) /
    EXPERTS_WIDTH,
);
const SHARED_HANDLE_LEFT =
  (100 * (EXPERTS_PADDING + SHARED_GROUP_WIDTH / 2)) / EXPERTS_WIDTH;
const EXPERT_OUTPUT_BRANCHES = [
  {
    key: "shared",
    expertId: undefined,
    center: 70 + (EXPERTS_WIDTH * SHARED_HANDLE_LEFT) / 100,
    width: SHARED_GROUP_WIDTH - 24,
  },
  ...VISIBLE_ROUTED_EXPERTS.map((expert, index) => ({
    key: String(expert.id),
    expertId: expert.id,
    center: 70 + (EXPERTS_WIDTH * ROUTED_HANDLE_LEFT[index]) / 100,
    width: EXPERT_CARD_WIDTH - 24,
  })),
];
const ROUTER_SCORE_COLUMNS = [
  1,
  2,
  3,
  null,
  7,
  null,
  31,
  null,
  96,
  null,
  142,
  null,
  228,
  null,
  351,
  null,
  384,
] as const;
// [OM-FREEPLAY] 得分格按可读字号分配 72px，省略号 24px；可见专家另留 28px 出线通道。
const ROUTER_SCORE_TRACKS = ROUTER_SCORE_COLUMNS.map((column) =>
  column === null
    ? 24
    : 72 +
      (VISIBLE_ROUTED_EXPERTS.some((expert) => expert.id === column) ? 28 : 0),
);
const ROUTER_SCORE_GAP = 4;
const ROUTER_SCORES_WIDTH =
  4 +
  20 +
  28 +
  ROUTER_SCORE_TRACKS.reduce((sum, width) => sum + width, 0) +
  ROUTER_SCORE_COLUMNS.length * ROUTER_SCORE_GAP;

const panel: CSSProperties = {
  width: "100%",
  height: "100%",
  boxSizing: "border-box",
  border: `2px solid ${COLORS.line}`,
  borderRadius: 16,
  background: "transparent",
  color: COLORS.ink,
  boxShadow: "none",
  overflow: "hidden",
};

const handle: CSSProperties = {
  width: 10,
  height: 10,
  border: `2px solid ${COLORS.card}`,
  background: COLORS.green,
};

// [OM-FREEPLAY] 独立阅读器从输入开始，默认保留可读字号；全图鸟瞰仍可通过画布控件进入。
const FIT_VIEW_OPTIONS = {
  padding: 0.12,
  minZoom: 0.65,
  maxZoom: 1,
  nodes: [{ id: "tokenizer" }],
};
const EDIT_DELETE_KEYS = ["Backspace", "Delete"];
const CONTENT_SIZED_KINDS = new Set<NodeKind>([
  "tokenizer",
  "embedding",
  "execution-guide",
  "norm1",
  "norm2",
  "query-norm",
  "projection-kv",
  "heads",
  "concat",
  "compressor",
  "indexer",
  "router",
  "scores",
  "experts",
  "expert-output",
  "expert-weighted",
]);
for (const kind of [
  "hc-expand",
  "hc-pre",
  "hc-mix",
  "engram-lookup",
  "engram-inject",
  "tensor",
  "state1",
  "output",
  "next-inputs",
  "add1",
  "add2",
] as const)
  CONTENT_SIZED_KINDS.add(kind);

// 官方配置使用从 0 开始的层号 1、14；图的层号从 1 开始。
export function hasEngram(layer: number) {
  return layer === 2 || layer === 15;
}
const HC_COPIES = [1, 2, 3, 4] as const;

function modeForLayer(layer: number): LayerMode {
  if (layer <= 2) return "swa";
  if ([3, 9, 15, 21].includes(layer)) return "full";
  if ([25, 29, 33, 37].includes(layer)) return "reindex";
  return "reuse";
}

function modeLabel(mode: LayerMode) {
  if (mode === "swa") return "SWA-only";
  if (mode === "full") return "Full";
  if (mode === "reindex") return "Reindex";
  return "Reuse";
}

function globalKvSourceLayer(layer: number) {
  if (layer < 3) return null;
  if (layer < 9) return 3;
  if (layer < 15) return 9;
  if (layer < 21) return 15;
  return 21;
}

function globalIndexSourceLayer(layer: number) {
  if (layer < 3) return null;
  if (layer < 9) return 3;
  if (layer < 15) return 9;
  if (layer < 21) return 15;
  if (layer < 25) return 21;
  if (layer < 29) return 25;
  if (layer < 33) return 29;
  if (layer < 37) return 33;
  return 37;
}

// 只列下一子层实际读取的跨层对象；Full 层会重建全局 KV 与索引。
export function nextLayerDependencies(layer: number) {
  const next = layer + 1;
  if (layer === 40)
    return {
      next: null,
      kv: null,
      indices: null,
      indexKey: null,
      candidates: null,
      engram: false,
    };
  const mode = modeForLayer(next);
  const kv =
    mode === "reuse" || mode === "reindex" ? globalKvSourceLayer(next) : null;
  return {
    next,
    kv,
    indices: mode === "reuse" ? globalIndexSourceLayer(next) : null,
    indexKey: mode === "reindex" ? kv : null,
    candidates: mode === "reindex" ? 21 : null,
    engram: hasEngram(next),
  };
}

function compressionRatioForLayer(layer: number) {
  return layer <= 20 ? 2 : 1;
}

function queryProjectionLayout(phase: ExecutionPhase, normHeight = 620) {
  const firstY = 68;
  const rowHeight = phase === "prefill" ? 174 : 128;
  const normY = firstY + rowHeight + 28;
  const secondY = normY + normHeight + 42;
  const resultHeight = phase === "prefill" ? 232 : 128;
  return {
    firstY,
    rowHeight,
    normY,
    secondY,
    resultHeight,
    height: secondY + resultHeight + 24,
  };
}

function QueryProjection({
  layer,
  normHeight,
}: {
  layer: number;
  normHeight?: number;
}) {
  const { phase } = useExecutionAxis();
  const layout = queryProjectionLayout(phase, normHeight);
  return (
    <div style={panel}>
      <Title>
        Layer {layer} · Query ·{" "}
        {phase === "prefill" ? "Prefill 整段投影" : "Decode 当前一行投影"}
      </Title>
      <div
        style={{
          position: "absolute",
          left: 28,
          top: 47,
          color: COLORS.blue,
          fontSize: 10.5,
          fontWeight: 800,
        }}
      >
        ① 5120 → 1280 → 逐行 RMSNorm
      </div>
      <div
        style={{
          position: "absolute",
          left: 28,
          top: layout.secondY - 24,
          color: COLORS.blue,
          fontSize: 10.5,
          fontWeight: 800,
        }}
      >
        ② 1280 → 64 × 512
      </div>
    </div>
  );
}

// 图中的向量沿行展开；省略号不占元素格，也不着色。
function AttentionTensor({
  tex,
  rows,
  columns,
  scalar,
  tone = "green",
}: {
  tex: string;
  rows: string;
  columns: string;
  scalar: (row: string, column: string) => string;
  tone?: DiagramTone;
}) {
  const palette = tonePalette(tone);
  const { phase } = useExecutionAxis();
  const rowLabels =
    rows === "1"
      ? [phase === "decode" ? "t" : "1"]
      : ["1", "2", "3", "\\vdots", rows];
  return (
    <div
      data-attention-tensor={tex}
      data-expanded-tensor
      style={{
        minWidth: 0,
        padding: 8,
        border: `1.5px solid ${frameColor(palette.color)}`,
        borderRadius: 8,
        background: "transparent",
        display: "grid",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "baseline",
          fontSize: 13,
        }}
      >
        <MathFormula tex={tex} />
        <span style={{ fontSize: 11 }}>
          <MathFormula tex={`${rows}\\times ${columns}`} />
        </span>
      </div>
      {rowLabels.map((row) => (
        <div
          key={row}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr .35fr 1fr",
            gap: 4,
            textAlign: "center",
            alignItems: "center",
            fontSize: 12,
          }}
        >
          {["1", "2", "3", "\\cdots", columns].map((column, index) => (
            <span
              key={index}
              style={{
                minWidth: 0,
                padding: "4px 1px",
                border:
                  row === "\\vdots" || column === "\\cdots"
                    ? undefined
                    : `1px solid ${palette.color}`,
                borderRadius: 4,
              }}
            >
              <MathFormula
                tex={
                  row === "\\vdots"
                    ? index === 2
                      ? row
                      : ""
                    : column === "\\cdots"
                      ? column
                      : scalar(row, column)
                }
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function FlowStep({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        color: COLORS.green,
        fontSize: 12,
        padding: "2px 0",
      }}
    >
      <Operator tex="\downarrow" />
      <span>{children}</span>
    </div>
  );
}

// 各 RMSNorm 使用各自的 gamma；z、y 仅为框内输入/输出行的局部记号。
// 对齐官方 RMSNorm.forward：FP32 平方均值 → 加 epsilon → 归一化 → 逐元素缩放。
export function RmsNormProcess({
  input,
  output,
  dimension,
  rowCount,
  gamma,
  label,
  rowIndex,
  horizontal = false,
}: {
  input: string;
  output: string;
  dimension: number;
  rowCount: string;
  gamma?: string;
  label: string;
  rowIndex?: string;
  horizontal?: boolean;
}) {
  const { phase } = useExecutionAxis();
  const row =
    rowIndex ?? (rowCount === "M" ? "i" : phase === "decode" ? "t" : "s");
  const indices = rowCount === "1" ? [row] : ["1", "2", "\\vdots", rowCount];
  const columns = ["1", "2", String(dimension)];
  const layoutRef = useRef<HTMLDivElement>(null);
  const rootResultRef = useRef<HTMLDivElement>(null);
  const broadcastRef = useRef<HTMLDivElement>(null);
  const [transfer, setTransfer] = useState<{
    path: string;
    arrow: string;
  } | null>(null);
  useLayoutEffect(() => {
    if (!horizontal) return;
    const layout = layoutRef.current,
      source = rootResultRef.current,
      target = broadcastRef.current;
    if (!layout || !source || !target) return;
    const measure = () => {
      const bounds = layout.getBoundingClientRect();
      if (!bounds.width || !layout.offsetWidth) return;
      const scale = bounds.width / layout.offsetWidth;
      const from = source.getBoundingClientRect(),
        to = target.getBoundingClientRect();
      const x1 = (from.right - bounds.left) / scale,
        y1 = (from.top + from.height / 2 - bounds.top) / scale;
      const x2 = (to.left - bounds.left) / scale,
        y2 = (to.top + to.height / 2 - bounds.top) / scale;
      const sourceStage = source
        .closest('[data-rmsnorm-stage="root"]')!
        .getBoundingClientRect();
      // 通道位于两段结构之间，不能取两个小框中心的中点而穿过左侧输入矩阵。
      const mid = ((sourceStage.right - bounds.left) / scale + x2) / 2;
      const path = `M${x1} ${y1} H${mid} V${y2} H${x2}`;
      const arrow = `M${x2 - 6} ${y2 - 5} L${x2} ${y2} L${x2 - 6} ${y2 + 5}`;
      setTransfer((current) =>
        current?.path === path ? current : { path, arrow },
      );
    };
    const observer = new ResizeObserver(measure);
    for (const element of [layout, source, target]) observer.observe(element);
    return () => observer.disconnect();
  }, [horizontal]);
  const matrix = (tex: string, symbol: string, tone: "blue" | "green") => (
    <RowMatrix
      tex={tex}
      shape={`${rowCount}\\times${dimension}`}
      rows={indices.map((index) =>
        index === "\\vdots" ? index : `\\mathbf ${symbol}_{${index}}`,
      )}
      rowLength={String(dimension)}
      elementTex={(index, column) => `${symbol}_{${indices[index]},${column}}`}
      tone={tone}
      headerLineHeight={2.4}
    />
  );
  return (
    <div
      data-rmsnorm={label}
      data-rmsnorm-dimension={dimension}
      style={{
        border: `1px solid ${frameColor(COLORS.green)}`,
        borderRadius: 9,
        padding: 10,
        display: "grid",
        gap: 7,
        fontSize: 13,
        minWidth: 0,
        background: "transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <strong>RMSNorm · {label}</strong>
        <MathFormula tex={`d=${dimension}`} />
      </div>
      <span style={{ fontSize: 11, color: COLORS.muted }}>
        本框输入行记作 z，输出行记作 y；每行独立计算
      </span>
      <div
        ref={layoutRef}
        data-rmsnorm-layout={horizontal ? "horizontal" : "vertical"}
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: horizontal
            ? "minmax(0,1fr) 38px minmax(0,1fr)"
            : "minmax(0,1fr)",
          gap: 8,
          alignItems: "start",
        }}
      >
        <div
          data-rmsnorm-stage="root"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr)",
            gap: 5,
            minWidth: 0,
          }}
        >
          {horizontal && <strong style={{ fontSize: 11 }}>① 本行均方根</strong>}
          {matrix(input, "z", "blue")}
          <FlowStep>
            <MathFormula tex={`\\mathbf z_{${row}}`} /> · 展开这一行的第
            1、2、…、{dimension} 个数
          </FlowStep>
          <div style={{ display: "grid", gap: 0 }}>
            <div
              data-rmsnorm-square
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                alignItems: "center",
                position: "relative",
                textAlign: "center",
              }}
            >
              {columns.map((column) => (
                <React.Fragment key={column}>
                  <div
                    style={{
                      display: "grid",
                      gap: 3,
                      padding: "0 4px",
                      minWidth: 0,
                    }}
                  >
                    <Box tone="blue">
                      <MathFormula tex={`z_{${row},${column}}`} />
                    </Box>
                    <Operator tex="\downarrow\;(\cdot)^2" />
                    <Box tone="green">
                      <MathFormula tex={`z_{${row},${column}}^2`} />
                    </Box>
                  </div>
                </React.Fragment>
              ))}
              <span
                style={{
                  position: "absolute",
                  left: "66.6667%",
                  top: "50%",
                  transform: "translate(-50%,-50%)",
                }}
              >
                <MathFormula tex="\cdots" />
              </span>
            </div>
            <SumJunction count={3} />
            <div
              data-rmsnorm-reduction
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr)",
                gap: 3,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MathFormula
                  tex={`\\sum_{j=1}^{${dimension}}z_{${row},j}^{2}`}
                />
                <Operator tex="\div" />
                <MathFormula tex={String(dimension)} />
                <Operator tex="=" />
                <Box tone="green">
                  <MathFormula tex={`m_{${row}}`} />
                </Box>
              </div>
              <FlowStep>
                <MathFormula tex="+\varepsilon\;\longrightarrow\;\sqrt{\phantom{x}}" />
              </FlowStep>
              <div
                ref={rootResultRef}
                data-rmsnorm-root-result
                style={{ width: "fit-content", justifySelf: "center" }}
              >
                <Box tone="green">
                  <MathFormula tex={`r_{${row}}`} />
                </Box>
              </div>
            </div>
          </div>
        </div>
        {horizontal && <div aria-hidden />}
        <div
          data-rmsnorm-stage="scale"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr)",
            gap: 5,
            minWidth: 0,
          }}
        >
          {horizontal && (
            <strong style={{ fontSize: 11 }}>
              ② 用①的结果归一化{gamma ? "与缩放" : ""}
            </strong>
          )}
          <div ref={broadcastRef} data-rmsnorm-broadcast>
            {horizontal ? (
              <Box tone="green">
                <MathFormula tex={`r_{${row}}`} /> · 同一分母用于本行各元素
              </Box>
            ) : (
              <FlowStep>
                <MathFormula tex={`r_{${row}}`} /> · 同一分母用于本行各元素
              </FlowStep>
            )}
          </div>
          <div
            data-rmsnorm-scale
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,minmax(0,1fr))",
              position: "relative",
              gap: 3,
              textAlign: "center",
              alignItems: "center",
            }}
          >
            {columns.map((column) => (
              <React.Fragment key={column}>
                <div style={{ display: "grid", gap: 4 }}>
                  <div
                    data-rmsnorm-operands
                    style={{
                      display: "grid",
                      gridTemplateColumns: gamma ? "1fr 1fr" : "1fr",
                      gap: 4,
                    }}
                  >
                    <Box tone="blue">
                      <MathFormula
                        tex={`\\frac{z_{${row},${column}}}{r_{${row}}}`}
                      />
                    </Box>
                    {gamma && (
                      <Box tone="amber">
                        <MathFormula tex={`\\gamma_{${column}}`} />
                      </Box>
                    )}
                  </div>
                  {gamma && (
                    <>
                      <svg
                        data-rmsnorm-product-arrows
                        aria-hidden
                        viewBox="0 0 100 30"
                        preserveAspectRatio="none"
                        style={{ width: "100%", height: 25 }}
                      >
                        <path
                          d="M25 0 V10 H50 V28 M75 0 V10 H50 M46 23 L50 28 L54 23"
                          fill="none"
                          stroke={COLORS.green}
                          strokeWidth="1.5"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                      <Operator tex="\times" />
                    </>
                  )}
                  <Operator tex="\downarrow" />
                  <Box tone="green">
                    <MathFormula tex={`y_{${row},${column}}`} />
                  </Box>
                </div>
              </React.Fragment>
            ))}
            <span
              style={{
                position: "absolute",
                left: "66.6667%",
                top: "55%",
                transform: "translate(-50%,-50%)",
              }}
            >
              <MathFormula tex="\cdots" />
            </span>
          </div>
          {gamma ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
                fontSize: 11,
                lineHeight: 2.4,
              }}
            >
              <span>本框 γ：各行共用的可学习参数</span>
              <MathFormula
                tex={`\\boldsymbol\\gamma=${gamma}\\in\\mathbb R^{${dimension}}`}
              />
            </div>
          ) : (
            <span>本处只除以均方根，无可学习缩放参数。</span>
          )}
          <FlowStep>各输出行组成</FlowStep>
          {matrix(output, "y", "green")}
        </div>
        {horizontal && transfer && (
          <svg
            data-rmsnorm-transfer
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              overflow: "visible",
              pointerEvents: "none",
            }}
          >
            <path
              d={transfer.path}
              fill="none"
              stroke={COLORS.green}
              strokeWidth={1.5}
            />
            <path
              d={transfer.arrow}
              fill="none"
              stroke={COLORS.green}
              strokeWidth={1.5}
            />
          </svg>
        )}
      </div>
      {/* [OM-FREEPLAY] 四维小例子只解释运算；实际宽度以上方 d 为准。 */}
      <div
        data-rmsnorm-example
        style={{
          borderTop: `1px solid ${COLORS.line}`,
          paddingTop: 7,
          display: horizontal ? "flex" : "grid",
          flexWrap: "wrap",
          alignItems: "center",
          gap: horizontal ? "4px 14px" : 4,
          fontSize: 12,
        }}
      >
        <strong>4 维算例 · ε 很小时</strong>
        <MathFormula tex="\mathbf z=(1,-1,3,-3),\quad m=(1+1+9+9)/4=5" />
        <MathFormula
          tex={
            gamma
              ? "r\\approx2.236,\\quad\\boldsymbol\\gamma=(1,2,1,2)"
              : "r\\approx2.236"
          }
        />
        <MathFormula
          tex={
            gamma
              ? "\\mathbf y\\approx(0.447,-0.894,1.342,-2.683)"
              : "\\mathbf y\\approx(0.447,-0.447,1.342,-1.342)"
          }
        />
      </div>
    </div>
  );
}

// [OM-FREEPLAY] 用同一合流组件画重复分支；沿用 RMSNorm 的开放箭头样式。

// 求和输入线与圆形算子分开布局，圆不会随 SVG 的宽高缩放变形。

// 四个乘积共用等高网格，连线起点跟随各行中心；右侧圆形 Σ 接收每一行。

// 官方实现：四路残差、跨子层传递 pre 系数、20 轮 Sinkhorn。
// https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/main/inference/model.py
// https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/main/inference/kernel.py
function StreamTensor({
  layer,
  stage,
  count,
}: {
  layer: number;
  stage: string;
  count: string;
}) {
  const rows =
    count === "1" ? ["t"] : ["1", "2", "\\vdots", "t", "\\vdots", "N"];
  return (
    <div data-hc-streams={stage} style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          lineHeight: 2.4,
          padding: "0 3px",
        }}
      >
        <MathFormula tex={`\\mathcal H_{${layer}}^{${stage}}`} />
        <MathFormula tex={`${count}\\times4\\times5120`} />
      </div>
      <div
        data-four-stream-row
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,minmax(0,1fr))",
          gap: 8,
        }}
      >
        {HC_COPIES.map((c) => (
          <RowMatrix
            key={c}
            tex={`H_{${layer},${c}}^{${stage}}`}
            shape={`${count}\\times5120`}
            rows={rows.map((s) =>
              s === "\\vdots" ? s : `\\mathbf h_{${c},${s}}`,
            )}
            selected={rows.indexOf("t")}
            rowLength="5120"
            elementTex={(s, j) => `h_{${c},${rows[s]},${j}}`}
            headerLineHeight={2.4}
            tone="blue"
          />
        ))}
      </div>
      <span style={{ fontSize: 11 }}>
        内部元素省略统一的层号 {layer} 与阶段上标；4 路各保留相同的 token 轴。
      </span>
    </div>
  );
}

export function MhcMix({
  layer,
  sublayer,
  connected = false,
}: {
  layer: number;
  sublayer: "A" | "F";
  connected?: boolean;
}) {
  const source =
    sublayer === "A" ? (hasEngram(layer) ? "E" : "\\mathrm{in}") : "A";
  const coefficient = (symbol: "p" | "q" | "C") => {
    const tone = symbol === "p" ? "green" : symbol === "q" ? "rose" : "violet";
    return (
      <div
        data-mhc-coefficient-output={symbol}
        data-expanded-tensor
        style={{
          position: "relative",
          border: `1px solid ${frameColor(COLORS[tone])}`,
          borderRadius: 9,
          padding: 10,
          display: "grid",
          gap: 8,
          background: "transparent",
        }}
      >
        {connected && (
          <Handle
            id={symbol === "p" ? "pre" : symbol === "q" ? "post" : "comb"}
            type="source"
            position={
              symbol === "p"
                ? Position.Left
                : symbol === "q"
                  ? Position.Bottom
                  : Position.Right
            }
            style={handle}
          />
        )}
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
        >
          <strong>
            输出{" "}
            <MathFormula
              tex={
                symbol === "C"
                  ? `C_{${layer},t}^{${sublayer}}`
                  : `\\mathbf ${symbol}_{${layer},t}^{${sublayer}}`
              }
            />
          </strong>
          <span style={{ fontSize: 12 }}>
            <MathFormula tex={symbol === "C" ? "4\\times4" : "1\\times4"} />
          </span>
        </div>
        {symbol === "C" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,minmax(0,1fr))",
              gap: 4,
            }}
          >
            {HC_COPIES.flatMap((k) =>
              HC_COPIES.map((j) => (
                <Box key={`${k}-${j}`} tone="violet">
                  <MathFormula tex={`c_{${k}${j}}`} />
                </Box>
              )),
            )}
          </div>
        ) : (
          <VectorStrip
            name=""
            nameWidth={0}
            length="4"
            columns={["1", "2", "3", "4"]}
            elementTex={(j) => `${symbol}_${j}`}
            tone={tone}
          />
        )}
        <span>
          {symbol === "p"
            ? sublayer === "A"
              ? "供本层 FFN 汇合使用"
              : layer === 40
                ? "供主干末尾四路汇合使用"
                : "传给下一层 Attention 汇合"
            : symbol === "q"
              ? "当前子层的输出 o 送往四路，各路乘自己的 q"
              : "行 k 为来源路、列 j 为目标路；送入当前子层残差混合"}
        </span>
      </div>
    );
  };
  return (
    <div
      data-mhc-mix={sublayer}
      style={{ display: "grid", gap: 16, fontSize: 13, lineHeight: 1.6 }}
    >
      <strong>
        mHC 系数生成 · Layer {layer} · {sublayer === "A" ? "Attention" : "FFN"}
      </strong>
      <MhcFlatten layer={layer} stage={source} />
      <div
        data-mhc-preparation
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 52px minmax(0,1.15fr)",
          gap: 12,
          alignItems: "center",
        }}
      >
        <MhcJointNorm />
        <Operator tex="\xrightarrow{\bar{\mathbf f}_t}" />
        <MhcProjection layer={layer} sub={sublayer} />
      </div>
      <div
        data-mhc-gate-branches
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
          <SigmoidDefinition />
          <div
            data-mhc-pq-parallel
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2,minmax(0,1fr))",
              gap: 12,
            }}
          >
            <MhcGate kind="p">{coefficient("p")}</MhcGate>
            <MhcGate kind="q">{coefficient("q")}</MhcGate>
          </div>
        </div>
        <MhcSinkhorn>{coefficient("C")}</MhcSinkhorn>
      </div>
    </div>
  );
}

export function MhcPre({
  layer,
  sublayer,
  count,
  connected = false,
}: {
  layer: number;
  sublayer: "A" | "F";
  count: string;
  connected?: boolean;
}) {
  const p =
    sublayer === "A"
      ? layer === 1
        ? "(1,0,0,0)"
        : `\\mathbf p_{${layer - 1},t}^{F}`
      : `\\mathbf p_{${layer},t}^{A}`;
  const stage =
    sublayer === "F" ? "A" : hasEngram(layer) ? "E" : "\\mathrm{in}";
  return (
    <div
      data-mhc-pre={sublayer}
      style={{ display: "grid", gap: 8, fontSize: 13, lineHeight: 2.2 }}
    >
      <strong>
        mHC 汇合 · 4 路 → {sublayer === "A" ? "Attention" : "FFN"} 的一路输入
      </strong>
      <div
        style={{
          position: "relative",
          maxWidth: 560,
          width: "100%",
          justifySelf: "end",
        }}
      >
        {connected && (
          <Handle
            id="weights"
            type="target"
            position={Position.Top}
            style={handle}
          />
        )}
        <Box tone="amber">
          <MathFormula tex={`\\mathbf p=${p}`} /> ·{" "}
          {sublayer === "F"
            ? "来自本层 Attention 的系数分支"
            : layer === 1
              ? "首层初始化"
              : "来自前一层 FFN 的系数分支"}
        </Box>
      </div>
      <div
        data-four-stream-row
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,minmax(0,1fr))",
          gap: 7,
        }}
      >
        {HC_COPIES.map((c) => (
          <div key={c} style={{ display: "grid", gap: 6 }}>
            <FeatureVector
              name={`\\mathbf h_{${layer},${c},t}^{${stage}}`}
              scalar={(d) => `h_{${c},${d}}`}
            />
            <Operator tex={`\\downarrow\\;\\times p_${c}`} />
            <FeatureVector
              name={`p_${c}\\mathbf h_{${layer},${c},t}^{${stage}}`}
              scalar={(d) => `p_${c}h_{${c},${d}}`}
              tone="green"
            />
          </div>
        ))}
      </div>
      <SumJunction count={4} />
      <RowMatrix
        tex={sublayer === "A" ? `H_{${layer}}^{\\mathrm{in}}` : `H_{${layer}}'`}
        shape={`${count}\\times5120`}
        rows={
          count === "1"
            ? ["\\mathbf h_t"]
            : ["\\mathbf h_1", "\\mathbf h_2", "\\vdots", "\\mathbf h_N"]
        }
        rowLength="5120"
        elementTex={(i, j) =>
          `h_{${count === "1" ? "t" : ["1", "2", "", "N"][i]},${j}}`
        }
      />
      {/* [OM-FREEPLAY] 单个特征的数值例子说明加权汇合，不代表真实激活。 */}
      <span>
        单元素例：
        <MathFormula
          tex={
            layer === 1 && sublayer === "A"
              ? "(1,0,0,0)\\cdot(2,2,2,2)=2"
              : "(0.25,0.25,0.25,0.25)\\cdot(1,2,3,4)=2.5"
          }
        />
      </span>
    </div>
  );
}

// 每个外部操作数进入自己的数据框，随后按列分配到四条平等的残差路。

export function MhcPost({
  layer,
  sublayer,
  connected = false,
}: {
  layer: number;
  sublayer: "A" | "F";
  connected?: boolean;
}) {
  const { count, rows } = useExecutionAxis();
  const stage =
    sublayer === "F" ? "A" : hasEngram(layer) ? "E" : "\\mathrm{in}";
  const output =
    sublayer === "A"
      ? `\\mathbf o_{${layer},t}`
      : `\\mathbf o_{${layer},t}^{\\mathrm{FFN}}`;
  const outputScalar = (d: string) =>
    `o_{${layer},t,${d}}${sublayer === "F" ? "^{\\mathrm{FFN}}" : ""}`;
  const residual = (j: number) => `\\mathbf r_{${layer},${j},t}^{${sublayer}}`;
  const old = (k: number) => `\\mathbf h_{${layer},${k},t}^{${stage}}`;
  const result = (j: number) =>
    `\\mathbf h_{${layer},${j},t}^{${sublayer === "A" ? "A" : "\\mathrm{out}"}}`;
  return (
    <div
      data-mhc-post={sublayer}
      style={{ display: "grid", gap: 14, fontSize: 13 }}
    >
      <strong>mHC 回写 · 残差混合与输出分发并行，再按目标路相加</strong>
      {/* [OM-FREEPLAY] 扩展为角色配色：紫色 C、玫瑰色 q、青色乘积；沿途保持同色。 */}
      <div
        data-mhc-color-legend
        style={{ display: "flex", gap: 20, flexWrap: "wrap" }}
      >
        {(
          [
            ["blue", "旧残差 h"],
            ["violet", "混合系数 C"],
            ["rose", "各路接收权重 q"],
            ["green", "子层输出 o"],
            ["cyan", "加权结果"],
          ] as const
        ).map(([tone, label]) => (
          <span
            key={tone}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: tonePalette(tone).background,
                border: `1.5px solid ${frameColor(COLORS[tone])}`,
              }}
            />
            {label}
          </span>
        ))}
      </div>
      <div
        data-mhc-parallel-inputs
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
          gap: 24,
          alignItems: "start",
        }}
      >
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,320px) minmax(0,1fr)",
            border: `1px solid ${frameColor(COLORS.violet)}`,
            borderRadius: 12,
            padding: 12,
            gap: 16,
            alignItems: "start",
          }}
        >
          <div
            data-mhc-comb-input
            data-expanded-tensor
            style={{
              position: "relative",
              border: `1px solid ${frameColor(COLORS.violet)}`,
              background: "transparent",
              borderRadius: 8,
              padding: 8,
            }}
          >
            {connected && (
              <Handle
                id="comb"
                type="target"
                position={Position.Left}
                style={handle}
              />
            )}
            <TensorHeading
              name={`C_{${layer},t}^{${sublayer}}`}
              shape="4\times4"
            />
            <div
              data-mhc-comb-matrix
              style={{
                display: "grid",
                gridTemplateColumns: "42px repeat(4,minmax(0,1fr))",
                gap: 4,
                marginTop: 8,
                alignItems: "center",
                textAlign: "center",
              }}
            >
              <span>源↓ / 目标→</span>
              {HC_COPIES.map((j) => (
                <strong key={j}>路 {j}</strong>
              ))}
              {HC_COPIES.map((k) => (
                <React.Fragment key={k}>
                  <strong>路 {k}</strong>
                  {HC_COPIES.map((j) => (
                    <Box key={j} tone="violet">
                      <MathFormula tex={`c_{${k}${j}}`} />
                    </Box>
                  ))}
                </React.Fragment>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              来自本子层 mHC 系数分支 · 每列供一个目标路使用
            </div>
          </div>
          <div
            data-mhc-residual-input
            style={{ position: "relative", display: "grid", gap: 8 }}
          >
            {connected && (
              <Handle
                id="skip"
                type="target"
                position={Position.Top}
                style={handle}
              />
            )}
            <RowMatrix
              tex={`\\mathcal H_{${layer},t}^{${stage}}`}
              shape="4\times5120"
              rows={HC_COPIES.map(old)}
              rowLength="5120"
              elementTex={(k, d) => `h_{${k + 1},${d}}`}
              tone="blue"
            />
            <span>旁路保留的四路旧残差 · 每行一路、同一 token t</span>
          </div>
        </section>
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,420px) minmax(0,1fr)",
            border: `1px solid ${frameColor(COLORS.green)}`,
            borderRadius: 12,
            padding: 12,
            gap: 20,
            alignItems: "start",
          }}
        >
          <div
            data-mhc-sublayer-input
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 420,
              display: "grid",
              gap: 6,
            }}
          >
            {connected && (
              <Handle
                id="main-in"
                type="target"
                position={Position.Top}
                style={handle}
              />
            )}
            <RowMatrix
              tex={
                sublayer === "A"
                  ? `O_{${layer}}`
                  : `O_{${layer}}^{\\mathrm{FFN}}`
              }
              shape={`${count}\\times5120`}
              rows={rows.map((t) =>
                t === "\\vdots"
                  ? t
                  : `\\mathbf o_{${layer},${t}}${sublayer === "F" ? "^{\\mathrm{FFN}}" : ""}`,
              )}
              selected={rows.indexOf("t")}
              rowLength="5120"
              elementTex={(i, d) =>
                `o_{${layer},${rows[i]},${d}}${sublayer === "F" ? "^{\\mathrm{FFN}}" : ""}`
              }
            />
            <span>
              来自本层{" "}
              {sublayer === "A" ? "Attention 输出投影" : "FFN 专家加权汇总"}
            </span>
            <FlowStep>
              展开第 t 行 · 同一个输出向量 o 分给四路，各路乘自己的 q
            </FlowStep>
            <FeatureVector name={output} scalar={outputScalar} tone="green" />
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <div
              data-mhc-q-input
              data-expanded-tensor
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 420,
                border: `1px solid ${frameColor(COLORS.rose)}`,
                background: "transparent",
                borderRadius: 8,
                padding: 8,
                display: "grid",
                gap: 8,
              }}
            >
              {connected && (
                <Handle
                  id="post"
                  type="target"
                  position={Position.Right}
                  style={handle}
                />
              )}
              <TensorHeading
                name={`\\mathbf q_{${layer},t}^{${sublayer}}`}
                shape="1\times4"
              />
              <VectorStrip
                name=""
                nameWidth={0}
                length="4"
                columns={["1", "2", "3", "4"]}
                elementTex={(j) => `q_${j}`}
                tone="rose"
              />
              <span>来自本子层 mHC 系数分支 · 第 j 个权重供目标路 j 使用</span>
            </div>
            <div data-mhc-broadcast-map style={{ display: "grid", gap: 6 }}>
              <strong>同一个 o，按目标路分发；每路使用自己的 q</strong>
              <Box tone="green">
                <MathFormula tex={output} />
              </Box>
              <SplitArrows count={4} />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                  gap: 8,
                }}
              >
                {HC_COPIES.map((j) => (
                  <div
                    key={j}
                    style={{ display: "grid", gap: 5, textAlign: "center" }}
                  >
                    <Box tone="green">
                      <MathFormula tex="\mathbf o" />
                    </Box>
                    <Operator tex="\times" />
                    <Box tone="rose">
                      <MathFormula tex={`q_${j}`} />
                    </Box>
                    <span>目标路 {j}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
      <div
        data-four-stream-row
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,minmax(0,1fr))",
          gap: 16,
        }}
      >
        {HC_COPIES.map((j) => (
          <section
            key={j}
            data-mhc-output-copy={j}
            style={{
              border: `1px solid ${frameColor(COLORS.green)}`,
              borderRadius: 9,
              padding: 10,
              display: "grid",
              gap: 0,
            }}
          >
            <strong style={{ marginBottom: 10 }}>
              目标路 {j} · 两个并行分支
            </strong>
            <div
              data-mhc-parallel-branches
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                gap: 14,
              }}
            >
              <div
                data-mhc-residual-mix={j}
                style={{
                  border: `1px solid ${frameColor(COLORS.violet)}`,
                  borderRadius: 9,
                  padding: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  minWidth: 0,
                }}
              >
                <strong style={{ color: COLORS.blue, marginBottom: 7 }}>
                  残差混合 · C 的第 {j} 列
                </strong>
                <StackedSum>
                  {HC_COPIES.map((k) => (
                    <div
                      key={k}
                      data-mhc-residual-product={`${j}-${k}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "38px 18px minmax(0,1fr)",
                        gap: 4,
                        alignItems: "center",
                      }}
                    >
                      <Box tone="violet">
                        <MathFormula tex={`c_{${k}${j}}`} />
                      </Box>
                      <Operator tex="\times" />
                      <FeatureVector
                        name={old(k)}
                        scalar={(d) => `h_{${k},${d}}`}
                      />
                    </div>
                  ))}
                </StackedSum>
                <div data-mhc-residual-result style={{ marginTop: "auto" }}>
                  <FeatureVector
                    name={residual(j)}
                    scalar={(d) => `r_{${j},${d}}`}
                    tone="cyan"
                  />
                </div>
              </div>
              <div
                data-mhc-broadcast={j}
                style={{
                  border: `1px solid ${frameColor(COLORS.green)}`,
                  borderRadius: 9,
                  padding: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                  minWidth: 0,
                }}
              >
                <strong style={{ color: COLORS.green }}>
                  接收同一个 o · 乘权重 q{j}
                </strong>
                <div
                  data-mhc-post-product={j}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "38px 18px minmax(0,1fr)",
                    gap: 4,
                    alignItems: "center",
                  }}
                >
                  <Box tone="rose">
                    <MathFormula tex={`q_${j}`} />
                  </Box>
                  <Operator tex="\times" />
                  <FeatureVector
                    name={output}
                    scalar={outputScalar}
                    tone="green"
                  />
                </div>
                <div
                  data-mhc-elementwise-broadcast
                  style={{
                    display: "grid",
                    gap: 8,
                    padding: "8px 0",
                    flex: 1,
                    alignContent: "center",
                  }}
                >
                  <span>同一权重乘遍 5120 个元素</span>
                  {["1", "2", "\\cdots", "5120"].map((d) =>
                    d === "\\cdots" ? (
                      <div key={d} style={{ textAlign: "center" }}>
                        <MathFormula tex="\vdots" />
                      </div>
                    ) : (
                      <div
                        key={d}
                        data-mhc-broadcast-element={d}
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "38px 18px minmax(0,1fr) 18px minmax(0,1fr)",
                          gap: 4,
                          alignItems: "center",
                        }}
                      >
                        <Box tone="rose">
                          <MathFormula tex={`q_${j}`} />
                        </Box>
                        <Operator tex="\times" />
                        <Box tone="green">
                          <MathFormula tex={`o_{${d}}`} />
                        </Box>
                        <Operator tex="\to" />
                        <Box tone="cyan">
                          <MathFormula tex={`q_${j}\\cdot o_{${d}}`} />
                        </Box>
                      </div>
                    ),
                  )}
                  <span>元素索引 d 对齐；此处省略共同的层号与 t</span>
                </div>
                <div data-mhc-broadcast-result>
                  <FeatureVector
                    name={`q_${j}\\cdot ${output}`}
                    scalar={(d) => `q_${j}\\cdot ${outputScalar(d)}`}
                    tone="cyan"
                  />
                </div>
              </div>
            </div>
            <div data-mhc-final-sum={j}>
              <SumJunction count={2} />
            </div>
            <FeatureVector
              name={result(j)}
              scalar={(d) => `h'_{${j},${d}}`}
              tone="green"
            />
            <div style={{ textAlign: "center", fontSize: 12, marginTop: 10 }}>
              <MathFormula
                tex={`${result(j)}=${residual(j)}+q_${j}\\cdot ${output}`}
              />
            </div>
          </section>
        ))}
      </div>
      {/* [OM-FREEPLAY] 用同一个特征的四路值说明两个并行结果如何相加，不代表真实激活。 */}
      <div
        data-mhc-parallel-example
        style={{
          display: "grid",
          gridTemplateColumns: "max-content 24px max-content 24px max-content",
          justifySelf: "start",
          gap: 10,
          alignItems: "center",
          padding: 10,
          border: `1px solid ${COLORS.line}`,
          borderRadius: 8,
        }}
      >
        <div>
          单元素例：C 每格 0.25，旧值 (1,2,3,4)
          <br />
          <MathFormula tex="\mathbf r=(2.5,2.5,2.5,2.5)" />
        </div>
        <Operator tex="+" />
        <div>
          q=(0.5,1,1.5,2)，o=2
          <br />
          <MathFormula tex="\mathbf q\cdot o=(1,2,3,4)" />
        </div>
        <Operator tex="=" />
        <MathFormula tex="\mathbf h'=(3.5,4.5,5.5,6.5)" />
      </div>
    </div>
  );
}

// 本层返回两个独立对象；p 不参与本层回写，由下一次 hc_pre 消费。
export function LayerHandoff({
  layer,
  count,
  connected = false,
  preview = false,
}: {
  layer: number;
  count: string;
  connected?: boolean;
  preview?: boolean;
}) {
  const dependencies = nextLayerDependencies(layer);
  const next = layer + 1;
  const engram = layer < 40 && hasEngram(next);
  const state =
    layer === 40
      ? `\\mathbf h_{40,j,t}^{\\mathrm{out}}`
      : `\\mathbf h_{${next},j,t}^{${engram ? "E" : "\\mathrm{in}"}}`;
  return (
    <div
      data-layer-handoff
      style={{ display: "grid", gap: 12, padding: 12, fontSize: 13 }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,3fr) minmax(0,1fr)",
          gap: 24,
          alignItems: "start",
        }}
      >
        <div
          data-layer-state-output
          style={{ position: "relative", display: "grid", gap: 8 }}
        >
          {connected && (
            <Handle
              id="main-in"
              type="target"
              position={Position.Top}
              style={handle}
            />
          )}
          {connected && !preview && (
            <Handle
              id="state-next"
              type="source"
              position={Position.Bottom}
              style={handle}
            />
          )}
          <strong>① 四路残差状态 · 来自本层 FFN 回写</strong>
          <StreamTensor layer={layer} stage="\mathrm{out}" count={count} />
        </div>
        <div
          data-layer-pre-output
          data-expanded-tensor
          style={{
            position: "relative",
            border: `1px solid ${frameColor(COLORS.green)}`,
            background: "transparent",
            padding: 10,
            borderRadius: 8,
            display: "grid",
            gap: 10,
          }}
        >
          {connected && (
            <Handle
              id="coefficients"
              type="target"
              position={Position.Right}
              style={handle}
            />
          )}
          {connected && !preview && (
            <Handle
              id="pre-next"
              type="source"
              position={Position.Bottom}
              style={handle}
            />
          )}
          <strong>② 下次汇合的四个权重 · 来自本层 FFN 的 mHC 系数分支</strong>
          {count !== "1" && (
            <RowMatrix
              tex={`P_{${layer}}^{F}`}
              shape="N\times4"
              rows={[
                `\\mathbf p_{${layer},1}^{F}`,
                `\\mathbf p_{${layer},2}^{F}`,
                "\\vdots",
                `\\mathbf p_{${layer},N}^{F}`,
              ]}
              rowLength="4"
              elementTex={(i, d) => `p_{${["1", "2", "", "N"][i]},${d}}`}
            />
          )}
          <TensorHeading
            name={`\\mathbf p_{${layer},t}^{F}`}
            shape="1\times4"
          />
          <VectorStrip
            name=""
            nameWidth={0}
            length="4"
            columns={["1", "2", "3", "4"]}
            elementTex={(j) => `p_${j}`}
          />
          <span>
            p：pre 汇合权重；F：FFN 侧生成；t：当前 token
            位置。每个位置有自己的四个数。
          </span>
          <span>
            由四路残差的系数投影与 sigmoid 分支生成，和 ① 分别传递，不与 ①
            相加。
          </span>
        </div>
      </div>
      {preview && (
        <>
          <div
            data-next-layer-inventory
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2,minmax(0,1fr))",
              gap: 16,
            }}
          >
            {dependencies.kv !== null && (
              <div data-next-global-kv style={{ display: "grid", gap: 6 }}>
                <strong>
                  共享全局 KV · 来自 Layer {dependencies.kv}，下一层直接读取
                </strong>
                <RowMatrix
                  tex={`G_{${dependencies.kv}}`}
                  shape="M\times512"
                  rows={[
                    "\\mathbf g_1",
                    "\\mathbf g_2",
                    "\\vdots",
                    "\\mathbf g_M",
                  ]}
                  rowLength="512"
                  elementTex={(i, d) => `g_{${["1", "2", "", "M"][i]},${d}}`}
                />
                <span>全局历史共有 M 行；与只属于本层的 SWA 窗口分开。</span>
              </div>
            )}
            {dependencies.indices !== null && (
              <div data-next-indices style={{ display: "grid", gap: 6 }}>
                <strong>
                  已选行号 · 来自 Layer {dependencies.indices}
                  ，下一层复用选择结果
                </strong>
                <RowMatrix
                  tex={`I_{${dependencies.indices}}`}
                  shape={`${count}\\times K_t`}
                  rows={
                    count === "1"
                      ? [`I_{${dependencies.indices},t}`]
                      : [
                          `I_{${dependencies.indices},1}`,
                          `I_{${dependencies.indices},2}`,
                          "\\vdots",
                          `I_{${dependencies.indices},N}`,
                        ]
                  }
                  rowLength="K_t"
                  elementTex={(i, d) =>
                    `i_{${count === "1" ? "t" : ["1", "2", "", "N"][i]},${d}}`
                  }
                />
                <span>
                  每个 token 一组行号，Kₜ ≤ 512；用于从 G 中读取对应的 KV
                  行向量。
                </span>
              </div>
            )}
            {dependencies.indexKey !== null && (
              <div data-next-index-key style={{ display: "grid", gap: 6 }}>
                <strong>
                  Indexer Key 缓存 · 来自 Layer {dependencies.indexKey}
                  ，下一层重新打分
                </strong>
                <RowMatrix
                  tex={`K_{${dependencies.indexKey}}^{I\\prime}`}
                  shape="M\times128"
                  rows={[
                    "\\mathbf k^I_1",
                    "\\mathbf k^I_2",
                    "\\vdots",
                    "\\mathbf k^I_M",
                  ]}
                  rowLength="128"
                  elementTex={(i, d) => `k^I_{${["1", "2", "", "M"][i]},${d}}`}
                />
              </div>
            )}
            {dependencies.candidates !== null && (
              <div data-next-candidates style={{ display: "grid", gap: 6 }}>
                <strong>
                  候选位置掩码 · Layer 21 生成，下一层只在候选范围重选
                </strong>
                <RowMatrix
                  tex="\mathcal B_{21}"
                  shape={`${count}\\times M`}
                  rows={
                    count === "1"
                      ? ["\\mathbf b_t"]
                      : [
                          "\\mathbf b_1",
                          "\\mathbf b_2",
                          "\\vdots",
                          "\\mathbf b_N",
                        ]
                  }
                  rowLength="M"
                  elementTex={(i, d) =>
                    `b_{${count === "1" ? "t" : ["1", "2", "", "N"][i]},${d}}\\in\\{0,1\\}`
                  }
                />
                <span>
                  此处 B 表示候选掩码：先选至多 2048 个块，每块 8
                  个位置，再展开成可选位置。
                </span>
              </div>
            )}
          </div>
          <div
            data-next-context
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              fontSize: 12,
            }}
          >
            <strong>同一请求的公共输入：</strong>
            {layer < 40 ? (
              <>
                <Box tone="neutral">位置 t / start_pos → RoPE 与因果范围</Box>
                <Box tone="neutral">图像位置掩码 → 下一层 MoE 路由</Box>
                {dependencies.engram && (
                  <Box tone="blue">
                    Token IDs / 历史 token → 下一层 Engram 检索
                  </Box>
                )}
              </>
            ) : (
              <span>
                末尾消费四路状态与 p，不再读取共享 KV / Indexer 缓存。
              </span>
            )}
          </div>
          {layer < 40 && (
            <span style={{ fontSize: 12 }}>
              下一层使用自己的参数和本地 SWA 缓存；本层
              U、Query、专家中间结果不会作为下一层输入传递。
              {modeForLayer(next) === "full"
                ? "下一层是 Full 层，将重新生成全局 KV 和索引。"
                : ""}
            </span>
          )}
          <section
            data-layer-next-use
            style={{
              borderTop: `1px solid ${COLORS.line}`,
              paddingTop: 12,
              display: "grid",
              gap: 0,
            }}
          >
            <strong style={{ marginBottom: 8 }}>
              {layer === 40
                ? "主干末尾：四路汇合后进入最终归一化与输出头"
                : `下一层 Layer ${next}：Attention 前的四路汇合（展开同一 token t）`}
            </strong>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <MathFormula tex={`\\mathcal H_{${layer}}^{\\mathrm{out}}`} />
              <Operator tex="\to" />
              {layer === 40 ? (
                <span>直接使用这四路</span>
              ) : (
                <>
                  <MathFormula tex={`\\mathcal H_{${next}}^{\\mathrm{in}}`} />
                  {engram && (
                    <>
                      <Operator tex="\to" />
                      <Box tone="green">Layer {next} Engram 门控注入</Box>
                      <Operator tex="\to" />
                      <MathFormula tex={`\\mathcal H_{${next}}^{E}`} />
                    </>
                  )}
                </>
              )}
              <span>；p 原样交给下方四个乘法，不经过 Engram。</span>
            </div>
            <div
              data-handoff-products
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                gap: 12,
              }}
            >
              {HC_COPIES.map((j) => (
                <div key={j} style={{ display: "grid", gap: 5 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "42px 20px minmax(0,1fr)",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Box tone="green">
                      <MathFormula tex={`p_${j}`} />
                    </Box>
                    <Operator tex="\times" />
                    <FeatureVector
                      name={state.replace(",j,", `,${j},`)}
                      scalar={(d) => `h_{${j},${d}}`}
                    />
                  </div>
                  <Operator tex="\downarrow" />
                  <Box tone="cyan">
                    <MathFormula
                      tex={`p_${j}\\cdot ${state.replace(",j,", `,${j},`)}`}
                    />
                  </Box>
                </div>
              ))}
            </div>
            <SumJunction count={4} />
            <div
              style={{ width: 500, maxWidth: "100%", justifySelf: "center" }}
            >
              <FeatureVector
                name={
                  layer === 40
                    ? "\\mathbf h_t^{\\mathrm{head}}"
                    : `\\mathbf h_{${next},t}^{\\mathrm{in}}`
                }
                scalar={(d) => `h_{t,${d}}`}
                tone="green"
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// 本模型的 Engram 不含卷积分支：24 行检索 → 四个 Key 与一个 Value → 四路门控注入。
// https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/main/inference/engram.py
export function EngramLookup({
  layer,
  phase,
}: {
  layer: number;
  phase: ExecutionPhase;
}) {
  const rows = layer === 2 ? 384006168 : 384016682;
  return (
    <div data-engram-lookup style={{ display: "grid", gap: 10, fontSize: 13 }}>
      <strong>Engram · Layer {layer} · Token ID → N-gram → 哈希查表</strong>
      <Box tone="blue">
        沿用 Tokenizer 的真实 ID；同一张压缩映射表将等价文本归到同一 ID
        <br />
        <MathFormula tex="v_t\;\longrightarrow\;c_t,\qquad129280\;\longrightarrow\;99092" />
      </Box>
      <span>
        {phase === "prefill"
          ? "Prefill：为每个位置构造截至自身的历史片段。"
          : "Decode：追加当前压缩 ID，读取已缓存的至多 3 个历史 ID。"}{" "}
        序列开头补 PAD；图像位置截断回看。
      </span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 8,
        }}
      >
        {[2, 3, 4].map((n) => (
          <div
            key={n}
            data-ngram={n}
            style={{
              border: `1px solid ${frameColor(COLORS.blue)}`,
              borderRadius: 8,
              padding: 8,
              display: "grid",
              gap: 8,
            }}
          >
            <strong>{n}-gram · 结束于 t</strong>
            <div
              style={{
                display: "flex",
                justifyContent: "space-around",
                gap: 4,
              }}
            >
              {Array.from({ length: n }, (_, i) => n - 1 - i).map((j) => (
                <Box key={j} tone="blue">
                  <MathFormula tex={`c_{${j ? `t-${j}` : "t"}}`} />
                </Box>
              ))}
            </div>
            <Operator tex="\downarrow" />
            <Box tone="amber">
              <MathFormula
                tex={`u_${n}=\\bigoplus_{j=0}^{${n - 1}}(a_{${layer},j}c_{t-j})`}
              />
            </Box>
            <span>8 个独立模数与桶偏移</span>
            <VectorStrip
              name={`\\mathbf b_${n}`}
              length="8"
              elementTex={(h) => `b_{${n},${h}}`}
              tone="amber"
              compact
            />
            <MathFormula
              tex={`b_{${n},h}=o_{${n},h}+(u_${n}\\bmod p_{${n},h})`}
            />
          </div>
        ))}
      </div>
      <FlowStep>3 种长度 × 8 个哈希头 = 24 个地址；每个地址查一行</FlowStep>
      <div
        style={{
          border: `1px solid ${frameColor(COLORS.blue)}`,
          borderRadius: 8,
          padding: 9,
          display: "grid",
          gap: 5,
        }}
      >
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
        >
          <MathFormula tex={`E_{${layer}}^{\\mathrm{Engram}}`} />
          <MathFormula tex={`${rows}\\times256`} />
        </div>
        {[
          "0",
          "b_{2,1}",
          "b_{2,2}",
          "\\vdots",
          "b_{4,8}",
          String(rows - 1),
        ].map((index, i) =>
          index === "\\vdots" ? (
            <div key={index} style={{ textAlign: "center" }}>
              <MathFormula tex={index} />
            </div>
          ) : (
            <VectorStrip
              key={index}
              name={index}
              nameWidth={88}
              length="256"
              elementTex={(j) => `e_{${index},${j}}`}
              selected={i === 1 || i === 2 || i === 4}
              tone="blue"
              compact
            />
          ),
        )}
        <span style={{ fontSize: 11 }}>
          桶地址从 0 开始；列为该行的 256 个特征。
        </span>
      </div>
      <FlowStep>所选 24 行反量化，再沿特征轴拼接</FlowStep>
      <RowMatrix
        tex={`\\mathcal E_{${layer},t}`}
        shape="3\times8\times256"
        rows={["2\\text{-gram}", "3\\text{-gram}", "4\\text{-gram}"]}
        rowLength="8"
        elementTex={(i, h) => `\\mathbf e_{${i + 2},${h}}^{(256)}`}
        elementColumns={["1", "2", "\\cdots", "8"]}
        headerLineHeight={2.4}
      />
      <FlowStep>
        <MathFormula
          tex={`\\mathbf e_{${layer},t}\\in\\mathbb R^{1\\times6144}`}
        />{" "}
        · 24 个向量沿特征轴拼接
      </FlowStep>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 24px 1fr 24px 1fr",
          alignItems: "center",
          gap: 5,
        }}
      >
        <Box tone="blue" expanded>
          <MathFormula tex={`\\mathbf e_{${layer},t}`} />
          <VectorStrip
            name=""
            nameWidth={0}
            length="6144"
            elementTex={(j) => `e_${j}`}
            tone="blue"
            compact
          />
        </Box>
        <Operator tex="\times" />
        <Box tone="amber" expanded>
          <TensorHeading name={`W_{${layer}}^{E,KV}`} shape="6144\times25600" />
          <div
            style={{
              display: "flex",
              justifyContent: "space-around",
              gap: 4,
              marginTop: 5,
            }}
          >
            {["1", "2", "\\cdots", "25600"].map((j) =>
              j === "\\cdots" ? (
                <MathFormula key={j} tex={j} />
              ) : (
                <span
                  key={j}
                  style={{
                    border: `1px solid ${frameColor(COLORS.amber)}`,
                    background: COLORS.amberSoft,
                    padding: "9px 3px",
                    borderRadius: 4,
                  }}
                >
                  <MathFormula tex={`\\mathbf w_${j}`} />
                </span>
              ),
            )}
          </div>
        </Box>
        <Operator tex="=" />
        <Box tone="green">
          <MathFormula tex="[\mathbf k_1\mid\mathbf k_2\mid\mathbf k_3\mid\mathbf k_4\mid\mathbf v]" />
        </Box>
      </div>
      <SplitArrows count={5} />
      <div
        data-engram-memory-slices
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5,minmax(0,1fr))",
          gap: 6,
        }}
      >
        {HC_COPIES.map((c) => (
          <FeatureVector
            key={c}
            name={`\\mathbf k_{${layer},${c},t}^{E}`}
            scalar={(d) => `k_{${c},${d}}`}
            tone="green"
          />
        ))}
        <FeatureVector
          name={`\\mathbf v_{${layer},t}^{E}`}
          scalar={(d) => `v_${d}`}
          tone="green"
        />
      </div>
      {/* [OM-FREEPLAY] 缩小桶大小的算例展示 XOR 与取模；不是模型的真实地址。 */}
      <Box tone="amber">
        小桶算例：压缩 ID (3,5)，乘数 (1,3)，模数 7，偏移 0<br />
        <MathFormula tex="(3\cdot1)\mathbin{\mathrm{XOR}}(5\cdot3)=12,\quad12\bmod7=5" />
        <br />
        读取第 5 行 · 不做相似度搜索
      </Box>
    </div>
  );
}

export function EngramInject({
  layer,
  phase,
}: {
  layer: number;
  phase: ExecutionPhase;
}) {
  const count = phase === "prefill" ? "N" : "1";
  return (
    <div data-engram-inject style={{ display: "grid", gap: 10, fontSize: 13 }}>
      <strong>
        Engram 注入 · 每个 token、每一路 c 独立计算门控（c=1,2,3,4）
      </strong>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
          gap: 10,
        }}
      >
        <RmsNormProcess
          input={`\\mathbf h_{${layer},c,t}^{\\mathrm{in}}`}
          output={`\\widehat{\\mathbf h}_{${layer},c,t}`}
          dimension={5120}
          rowCount="1"
          rowIndex="t"
          gamma={`\\boldsymbol\\gamma_{${layer},c}^{E,Q}`}
          label="Engram 残差路"
          horizontal
        />
        <RmsNormProcess
          input={`\\mathbf k_{${layer},c,t}^{E}`}
          output={`\\widehat{\\mathbf k}_{${layer},c,t}^{E}`}
          dimension={5120}
          rowCount="1"
          rowIndex="t"
          gamma={`\\boldsymbol\\gamma_{${layer},c}^{E,K}`}
          label="Engram 检索 Key"
          horizontal
        />
      </div>
      <FlowStep>同一路归一化结果逐元素相乘，再沿 5120 维求和</FlowStep>
      <div
        data-engram-dot-sum
        style={{
          width: "fit-content",
          maxWidth: "100%",
          justifySelf: "center",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,max-content)",
            gap: 36,
          }}
        >
          {["1", "2", "5120"].map((j) => (
            <div
              key={j}
              style={{ display: "flex", gap: 6, alignItems: "center" }}
            >
              <Box tone="green">
                <MathFormula tex={`\\widehat h_{c,${j}}`} />
              </Box>
              <Operator tex="\times" />
              <Box tone="green">
                <MathFormula tex={`\\widehat k_{c,${j}}`} />
              </Box>
            </div>
          ))}
        </div>
        <SumJunction count={3} />
      </div>
      <FlowStep>
        <span style={{ lineHeight: 2.4 }}>
          <MathFormula tex="d_c=\sum_{j=1}^{5120}\widehat h_{c,j}\widehat k_{c,j}/\sqrt{5120}" />
        </span>
      </FlowStep>
      <div
        data-engram-gate
        style={{
          display: "grid",
          gridTemplateColumns: "max-content 22px max-content 22px max-content",
          justifyContent: "center",
          gap: 6,
          alignItems: "center",
        }}
      >
        <Box tone="green">
          <MathFormula tex="a_c=\max(|d_c|,10^{-6})" />
        </Box>
        <Operator tex="\to" />
        <Box tone="green">
          <MathFormula tex="s_c=\operatorname{copysign}(\sqrt{a_c},d_c)" />
        </Box>
        <Operator tex="\to" />
        <Box tone="amber">
          <MathFormula tex="g_c=\frac{1}{1+e^{-s_c}}" />
        </Box>
      </div>
      <span>
        copysign 保留 d 的符号（+0 取正号）。两组 γ 各为 4 ×
        5120；逐路归一化。图像位置的 g 全部置 0。
      </span>
      <div
        data-four-stream-row
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,minmax(0,1fr))",
          gap: 10,
        }}
      >
        {HC_COPIES.map((c) => (
          <div
            key={c}
            data-engram-copy={c}
            style={{
              border: `1px solid ${frameColor(COLORS.green)}`,
              borderRadius: 8,
              padding: 9,
              display: "grid",
              gap: 7,
            }}
          >
            <strong>残差路 {c} · 独立 Key 与门控</strong>
            <FeatureVector
              name={`\\mathbf h_{${layer},${c},t}^{\\mathrm{in}}`}
              scalar={(j) => `h_{${c},${j}}`}
            />
            <FeatureVector
              name={`\\mathbf k_{${layer},${c},t}^{E}`}
              scalar={(j) => `k_{${c},${j}}`}
              tone="green"
            />
            <MergeArrows count={2} />
            <FlowStep>上方归一化 → 点积 → 门控</FlowStep>
            <div
              data-engram-value-product={c}
              style={{
                display: "grid",
                gridTemplateColumns: "48px 20px 1fr",
                gap: 5,
                alignItems: "center",
              }}
            >
              <Box tone="amber">
                <MathFormula tex={`g_${c}`} />
              </Box>
              <Operator tex="\times" />
              <FeatureVector
                name={`\\mathbf v_{${layer},t}^{E}`}
                scalar={(j) => `v_${j}`}
                tone="green"
              />
            </div>
            <Operator tex="\downarrow" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
              }}
            >
              <Box tone="blue">
                <MathFormula
                  tex={`\\mathbf h_{${layer},${c},t}^{\\mathrm{in}}`}
                />
              </Box>
              <Box tone="green">
                <MathFormula tex={`g_${c}\\cdot\\mathbf v_{${layer},t}^{E}`} />
              </Box>
            </div>
            <SumJunction count={2} />
            <span style={{ textAlign: "center" }}>
              旧残差与门控后的共享 Value 逐元素相加
            </span>
            <FeatureVector
              name={`\\mathbf h_{${layer},${c},t}^{E}`}
              scalar={(j) => `h_{${c},${j}}^E`}
              tone="green"
            />
          </div>
        ))}
      </div>
      <FlowStep>4 路注入结果送入本层 mHC</FlowStep>
      <Box tone="green">
        <MathFormula
          tex={`\\mathcal H_{${layer}}^E\\in\\mathbb R^{${count}\\times4\\times5120}`}
        />
      </Box>
      {/* [OM-FREEPLAY] 门控及两个特征的数值算例，仅解释注入。 */}
      <Box tone="amber">
        例：d=4 → s=2 → g≈0.8808
        <br />
        <MathFormula tex="(0.1,0.2)+0.8808(1,-1)=(0.9808,-0.6808)" />
      </Box>
    </div>
  );
}

// 模型特有的部分旋转、共享 KV、attention sink 和分组输出投影：
// https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/main/inference/model.py
// https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/main/inference/kernel.py
function RotaryProcess({
  input,
  output,
  position,
  layer,
  inverse = false,
  dimension = 512,
  compact = false,
}: {
  input: string;
  output: string;
  position: string;
  layer: number;
  inverse?: boolean;
  dimension?: 128 | 512;
  compact?: boolean;
}) {
  const compressed = modeForLayer(layer) !== "swa";
  const unchanged = dimension - 64;
  return (
    <div
      data-rotary-process={inverse ? "inverse" : "forward"}
      data-rotary-layout={compact ? "side-detail" : "stacked"}
      style={{
        border: `1px solid ${frameColor(COLORS.amber)}`,
        borderRadius: 9,
        padding: 10,
        display: "grid",
        gridTemplateColumns: compact
          ? "minmax(0,1fr) minmax(0,1.1fr)"
          : "minmax(0,1fr)",
        gap: 9,
        fontSize: 12,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          gridColumn: "1 / -1",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <strong>
          {inverse ? "逆旋转 · 回到输出坐标系" : "RoPE · 相邻两个元素一起旋转"}
        </strong>
        <MathFormula tex={`p=${position}`} />
      </div>
      <div
        style={{
          display: "grid",
          gridColumn: "1 / -1",
          gridTemplateColumns: "1fr 24px 1fr",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Box tone="blue">
          <MathFormula tex={input} />
        </Box>
        <Operator tex="\to" />
        <Box tone="green">
          <MathFormula tex={output} />
        </Box>
      </div>
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>元素 1–{unchanged}：原样传递</span>
        <span>
          元素 {unchanged + 1}–{dimension}：32 对
        </span>
      </div>
      <div
        data-rotary-pairs
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 24px 1fr",
          gap: 7,
          alignItems: "center",
        }}
      >
        {[0, 1, 31].map((pair, index) => (
          <React.Fragment key={pair}>
            {index === 2 && <Operator tex="\cdots" />}
            <div
              style={{
                display: "grid",
                gap: 5,
                textAlign: "center",
                justifyItems: "center",
              }}
            >
              <span style={{ fontSize: 11 }}>
                第 {pair + 1} 对 · {unchanged + 1 + pair * 2},{" "}
                {unchanged + 2 + pair * 2}
              </span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 3,
                }}
              >
                {["a", "b"].map((name) => (
                  <Box key={name} tone="blue">
                    <MathFormula tex={`${name}_{${pair}}`} />
                  </Box>
                ))}
              </div>
              <span>
                <MathFormula
                  tex={`\\downarrow\\; R(${inverse ? "-" : ""}p\\omega_{${pair}})`}
                />
              </span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 3,
                }}
              >
                {["a'", "b'"].map((name) => (
                  <Box key={name} tone="green">
                    <MathFormula tex={`${name}_{${pair}}`} />
                  </Box>
                ))}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
      <div
        style={{
          borderTop: compact ? undefined : `1px solid ${COLORS.line}`,
          borderLeft: compact ? `1px solid ${COLORS.line}` : undefined,
          paddingLeft: compact ? 10 : undefined,
          paddingTop: compact ? 0 : 8,
          display: "grid",
          gap: 5,
        }}
      >
        <MathFormula
          tex={`\\phi=${inverse ? "-" : ""}p\\omega_j,\\qquad j=0,1,\\ldots,31`}
        />
        <div
          data-rotation-matrix
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 22px 1.6fr 22px 1fr",
            alignItems: "center",
            gap: 4,
            textAlign: "center",
          }}
        >
          <div style={{ display: "grid", gap: 3 }}>
            <Box tone="green">
              <MathFormula tex="a'_j" />
            </Box>
            <Box tone="green">
              <MathFormula tex="b'_j" />
            </Box>
          </div>
          <Operator tex="=" />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 3,
              padding: 4,
              borderLeft: `2px solid ${COLORS.amber}`,
              borderRight: `2px solid ${COLORS.amber}`,
            }}
          >
            {["\\cos\\phi", "-\\sin\\phi", "\\sin\\phi", "\\cos\\phi"].map(
              (tex, cell) => (
                <Box key={cell} tone="amber">
                  <MathFormula tex={tex} />
                </Box>
              ),
            )}
          </div>
          <Operator tex="\times" />
          <div style={{ display: "grid", gap: 3 }}>
            <Box tone="blue">
              <MathFormula tex="a_j" />
            </Box>
            <Box tone="blue">
              <MathFormula tex="b_j" />
            </Box>
          </div>
        </div>
        {compressed ? (
          <>
            <MathFormula tex="\bar\omega_j=160000^{-2j/64}" />
            <span>
              本层频率由 YaRN 调整：高频保持，低频除以 16，中间平滑过渡。
            </span>
          </>
        ) : (
          <MathFormula tex="\omega_j=10000^{-2j/64}" />
        )}
      </div>
      {/* [OM-FREEPLAY] 用第一对元素和位置 1 演示旋转，非真实模型激活值。 */}
      <div
        data-rope-example
        style={{
          gridColumn: "1 / -1",
          borderTop: `1px solid ${COLORS.line}`,
          paddingTop: 6,
        }}
      >
        例：
        <MathFormula
          tex={`p=1,\\;(a_0,b_0)=(1,0)\\;\\longrightarrow\\;(0.5403,${inverse ? "-" : ""}0.8415)`}
        />
      </div>
    </div>
  );
}

function IndexProjection({
  title,
  input,
  inputWidth,
  weight,
  output,
  outputWidth,
  rows,
  scale,
  layer,
  inputSymbol,
  outputSymbol,
}: {
  title: string;
  input: string;
  inputWidth: string;
  weight: string;
  output: string;
  outputWidth: string;
  rows: string;
  scale?: string;
  layer: number;
  inputSymbol: string;
  outputSymbol: string;
}) {
  const indices = rows === "1" ? ["t"] : ["1", "2", "\\vdots", rows];
  return (
    <div
      data-index-projection={title}
      style={{ display: "grid", gap: 7, minWidth: 0 }}
    >
      <strong>{title}</strong>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 24px 1fr 24px 1fr",
          alignItems: "center",
          gap: 7,
        }}
      >
        <RowMatrix
          tex={input}
          shape={`${rows}\\times${inputWidth}`}
          rows={indices.map((i) =>
            i === "\\vdots"
              ? i
              : `\\boldsymbol{${inputSymbol}}_{${layer},${i}}`,
          )}
          tone="blue"
        />
        <Operator tex="\times" />
        <div
          data-expanded-tensor
          style={{
            padding: 6,
            border: `1px solid ${frameColor(COLORS.amber)}`,
            background: "transparent",
            borderRadius: 7,
            display: "grid",
            gap: 5,
          }}
        >
          <TensorHeading
            name={weight}
            shape={`${inputWidth}\\times${outputWidth}`}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 20px 1fr",
              gap: 3,
            }}
          >
            {["1", "2", "\\cdots", outputWidth].map((j) =>
              j === "\\cdots" ? (
                <Operator key={j} tex={j} />
              ) : (
                <div
                  key={j}
                  style={{
                    border: `1px solid ${frameColor(COLORS.amber)}`,
                    borderRadius: 4,
                    padding: "8px 3px",
                    background: COLORS.amberSoft,
                  }}
                >
                  <MathFormula tex={`\\mathbf w_{${j}}`} />
                </div>
              ),
            )}
          </div>
        </div>
        <Operator tex="=" />
        <RowMatrix
          tex={output}
          shape={`${rows}\\times${outputWidth}`}
          rows={indices.map((i) =>
            i === "\\vdots"
              ? i
              : `\\boldsymbol{${outputSymbol}}_{${layer},${i}}`,
          )}
        />
      </div>
      {scale && (
        <FlowStep>
          <MathFormula tex={scale} />
        </FlowStep>
      )}
    </div>
  );
}

export function IndexSelection({
  indexSource,
  kvSource,
}: {
  indexSource: number;
  kvSource: number;
}) {
  return (
    <div
      data-index-selection
      style={{
        width: "max-content",
        maxWidth: "100%",
        border: `1px solid ${frameColor(COLORS.amber)}`,
        borderRadius: 8,
        padding: 9,
        display: "grid",
        gap: 8,
      }}
    >
      <strong>④ 因果可见位置 → Top-K → 按位置排序的行号</strong>
      <MathFormula
        tex={`i\\le\\lfloor t/${compressionRatioForLayer(kvSource)}\\rfloor,\\qquad K_{${indexSource},t}=\\min(512,\\lfloor t/${compressionRatioForLayer(kvSource)}\\rfloor)`}
      />
      {/* [OM-FREEPLAY] 五个位置、取两个的缩小算例，说明筛选；实际上限仍为 512。 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5,max-content)",
          gap: 8,
          alignItems: "center",
        }}
      >
        <div>
          <span>小例子 · 前 4 行可见，取 2 行</span>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5,max-content)",
              gap: 5,
            }}
          >
            {[0.4, 0.1, 0.8, 0.3, 0.9].map((score, i) => (
              <div
                key={i}
                style={{
                  textAlign: "center",
                  opacity: i === 4 ? 0.4 : 1,
                }}
              >
                <span>行 {i + 1}</span>
                <Box tone={i === 0 || i === 2 ? "amber" : "blue"}>
                  <MathFormula tex={i === 4 ? "-\\infty" : String(score)} />
                </Box>
              </div>
            ))}
          </div>
        </div>
        <Operator tex="\to" />
        <div>
          <strong>分数最高：第 3、1 行</strong>
          <VectorStrip
            name=""
            nameWidth={0}
            length="2"
            columns={["3", "1"]}
            contentWidth
            elementTex={(i) => i}
            tone="amber"
          />
        </div>
        <Operator tex="\to" />
        <div>
          <strong>按位置排序：第 1、3 行</strong>
          <VectorStrip
            name=""
            nameWidth={0}
            length="2"
            columns={["1", "3"]}
            contentWidth
            elementTex={(i) => i}
            tone="green"
          />
        </div>
      </div>
      <FlowStep>行号连接到下方全局 KV 矩阵，逐行选取</FlowStep>
      <VectorStrip
        name={`I_{${indexSource},t}`}
        contentWidth
        length={`K_{${indexSource},t}`}
        elementTex={(i) => `i_{${indexSource},t,${i}}`}
        tone="amber"
      />
    </div>
  );
}

export function IndexScoreProcess({
  layer,
  kvSource,
  children,
}: {
  layer: number;
  kvSource: number;
  children?: React.ReactNode;
}) {
  const { count } = useExecutionAxis();
  return (
    <div
      data-index-score-process
      style={{ display: "grid", gap: 7, fontSize: 13 }}
    >
      <strong>③ 每个索引 Head 打分 → 32 路加权求和</strong>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 30px 1fr",
          gap: 10,
          alignItems: "start",
        }}
      >
        {[1, 2, 32].map((h, index) => (
          <React.Fragment key={h}>
            {index === 2 && <Operator tex="\cdots" />}
            <div
              data-index-head={h}
              style={{
                display: "grid",
                gap: 6,
                border: `1px solid ${frameColor(COLORS.green)}`,
                padding: 8,
                borderRadius: 8,
              }}
            >
              <strong>索引 Head {h} · 当前行 t</strong>
              <VectorStrip
                name={`\\mathbf q_{${layer},${h},t}^{I\\prime}`}
                nameWidth={80}
                length="128"
                elementTex={(d) => `q^I_{${h},t,${d}}`}
                tone="blue"
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "24px 1fr",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Operator tex="\times" />
                <RowMatrix
                  tex={`(K_{${kvSource}}^{I\\prime})^{\\mathsf T}`}
                  shape="128\times M"
                  rows={[
                    "\\text{特征 }1",
                    "\\text{特征 }2",
                    "\\vdots",
                    "\\text{特征 }128",
                  ]}
                  rowLength="M"
                  elementTex={(i, j) =>
                    `k^I_{${j},${["1", "2", "", "128"][i]}}`
                  }
                />
              </div>
              <FlowStep>除以 √128 → 逐元素 ReLU</FlowStep>
              <VectorStrip
                name={`\\mathbf a_{${h},t}^{I}`}
                nameWidth={80}
                length="M"
                elementTex={(i) => `a^I_{${h},t,${i}}`}
                tone="green"
              />
              <span>ReLU：负分置 0，正分保留</span>
              <div
                data-index-head-weight={h}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 24px 1fr",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Box tone="amber">
                  <MathFormula tex={`\\eta_{${layer},t,${h}}`} />
                </Box>
                <Operator tex="\times" />
                <Box tone="green">
                  <MathFormula tex={`\\mathbf a_{${h},t}^{I}`} />
                </Box>
              </div>
              <Operator tex="\downarrow" />
              <VectorStrip
                name=""
                nameWidth={0}
                length="M"
                elementTex={(i) => `\\eta_{${layer},t,${h}}a^I_{${h},t,${i}}`}
                tone="green"
              />
            </div>
          </React.Fragment>
        ))}
      </div>
      <div style={{ position: "relative" }}>
        <SumJunction count={3} />
        <span
          style={{ position: "absolute", left: "calc(50% + 42px)", top: 82 }}
        >
          <MathFormula tex="\sum_{h=1}^{32}" /> · 32 路同一位置相加
        </span>
      </div>
      <div
        data-index-result-flow
        style={{
          display: "grid",
          alignItems: "center",
          justifyItems: "center",
          gap: 7,
        }}
      >
        <RowMatrix
          tex={`S_{${layer}}`}
          contentWidth
          shape={`${count}\\times M`}
          rows={
            count === "1"
              ? ["\\mathbf s_t"]
              : [
                  "\\mathbf s_1",
                  "\\mathbf s_2",
                  "\\vdots",
                  "\\mathbf s_t",
                  "\\vdots",
                  "\\mathbf s_N",
                ]
          }
          selected={count === "1" ? 0 : 3}
          rowLength="M"
          elementTex={(r, i) =>
            `s_{${layer},${count === "1" ? "t" : ["1", "2", "", "t", "", "N"][r]},${i}}`
          }
        />
        {children && (
          <>
            <Operator tex="\downarrow" />
            {children}
          </>
        )}
      </div>
    </div>
  );
}

function LocalKvProjection({ layer }: { layer: number }) {
  const { phase, count, rows } = useExecutionAxis();
  const rowNames = (prefix: string) =>
    rows.map((s) => (s === "\\vdots" ? s : `${prefix}_{${layer},${s}}`));
  return (
    <div style={{ ...panel, height: "auto" }}>
      <Handle
        id="main-in"
        type="target"
        position={Position.Top}
        style={handle}
      />
      <Handle
        id="swa"
        type="source"
        position={Position.Bottom}
        style={handle}
      />
      <Title>Layer {layer} · 本层独立 KV</Title>
      <div data-local-kv-flow style={{ padding: 12 }}>
        <SerialFlow returnColumn>
          {[
            <React.Fragment key="projection">
              <strong>① 输入 × 本层参数 → 未归一化 KV</strong>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 18px 1.15fr 18px 1fr",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                <RowMatrix
                  tex={`X_{${layer}}`}
                  shape={`${count}\\times5120`}
                  rows={rowNames("\\mathbf x")}
                  tone="blue"
                />
                <Operator tex="\times" />
                <div
                  data-expanded-tensor
                  style={{
                    padding: 5,
                    border: `1.3px solid ${frameColor(COLORS.amber)}`,
                    borderRadius: 7,
                    background: "transparent",
                    display: "grid",
                    gap: 5,
                    fontSize: 9,
                    minWidth: 0,
                    textAlign: "center",
                  }}
                >
                  <MathFormula tex={`W_{${layer}}^{KV,\\mathrm{SWA}}`} />
                  <MathFormula tex="5120\times512" />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr .4fr 1fr",
                      gap: 3,
                      alignItems: "center",
                    }}
                  >
                    {["1", "2", "\\cdots", "512"].map((column) =>
                      column === "\\cdots" ? (
                        <MathFormula key={column} tex={column} />
                      ) : (
                        <div
                          key={column}
                          style={{
                            border: `1px solid ${frameColor(COLORS.amber)}`,
                            borderRadius: 4,
                            padding: "20px 0",
                            background: COLORS.amberSoft,
                          }}
                        >
                          <MathFormula
                            tex={`\\mathbf w_{${layer},${column}}`}
                          />
                        </div>
                      ),
                    )}
                  </div>
                </div>
                <Operator tex="=" />
                <RowMatrix
                  tex={`\\widehat U_{${layer}}`}
                  shape={`${count}\\times512`}
                  rows={rowNames("\\widehat{\\mathbf u}")}
                />
              </div>
            </React.Fragment>,
            <React.Fragment key="normalization">
              <strong>② 逐行归一化 · 读取①的投影结果</strong>
              <RmsNormProcess
                input={`\\widehat U_{${layer}}`}
                output={`\\bar U_{${layer}}`}
                dimension={512}
                rowCount={count}
                gamma={`\\boldsymbol\\gamma_{${layer}}^{KV}`}
                label="本地 KV"
                horizontal
              />
            </React.Fragment>,
            <React.Fragment key="rotation">
              <strong>③ 位置旋转 · 读取②的归一化结果</strong>
              <RotaryProcess
                input={`\\bar{\\mathbf u}_{${layer},${phase === "prefill" ? "s" : "t"}}`}
                output={`\\mathbf u_{${layer},${phase === "prefill" ? "s" : "t"}}`}
                position={phase === "prefill" ? "s-1" : "t-1"}
                layer={layer}
                compact
              />
            </React.Fragment>,
            <React.Fragment key="output">
              <strong>④ 本层 KV 矩阵 · 送入本层窗口</strong>
              <div>
                {phase === "prefill"
                  ? "s = 1, 2, …, N：每行按自己的位置生成 KV"
                  : "仅生成当前位置 t 的新 KV；下方写入历史窗口"}
              </div>
              <RowMatrix
                tex={`U_{${layer}}`}
                shape={`${count}\\times512`}
                rows={rowNames("\\mathbf u")}
                rowLength="512"
                elementColumns={["1", "2", "3", "4", "\\cdots", "512"]}
                elementTex={(row, column) =>
                  `u_{${layer},${rows[row]},${column}}`
                }
              />
            </React.Fragment>,
          ]}
        </SerialFlow>
      </div>
    </div>
  );
}

type MatrixRowSpec = { row: string; selected?: boolean; ellipsis?: boolean };

function RingCache({ layer }: { layer: number }) {
  const slots = [
    "t-127",
    "t-126",
    "t-125",
    "\\cdots",
    "t-3",
    "t-2",
    "t-1",
    "t",
  ];
  return (
    <div
      data-ring-cache
      style={{
        width: "100%",
        maxWidth: 240,
        aspectRatio: "1",
        position: "relative",
        justifySelf: "center",
      }}
    >
      <svg
        aria-hidden
        viewBox="0 0 240 240"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      >
        <defs>
          <marker
            id={`cache-write-${layer}`}
            viewBox="0 -5 10 10"
            refX="9"
            refY="0"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path
              d="M 1 -4 L 9 0 L 1 4"
              fill="none"
              stroke={COLORS.amber}
              strokeWidth="1.5"
            />
          </marker>
        </defs>
        <circle
          cx="120"
          cy="120"
          r="87.6"
          fill="none"
          stroke={COLORS.green}
          strokeWidth="2"
        />
        <path
          d="M 120 95 L 120 56"
          fill="none"
          stroke={COLORS.amber}
          strokeWidth="2"
          markerEnd={`url(#cache-write-${layer})`}
        />
      </svg>
      {slots.map((row, index) => {
        const angle = ((-90 + index * 45) * Math.PI) / 180;
        const oldest = index === 0;
        return (
          <div
            key={index}
            data-cache-slot={row}
            style={{
              position: "absolute",
              left: `${50 + 36.5 * Math.cos(angle)}%`,
              top: `${50 + 36.5 * Math.sin(angle)}%`,
              transform: "translate(-50%,-50%)",
              width: "26.5%",
              height: "9%",
              boxSizing: "border-box",
              display: "grid",
              placeItems: "center",
              border:
                row === "\\cdots"
                  ? "none"
                  : `1.5px solid ${oldest ? COLORS.amber : COLORS.green}`,
              borderRadius: 6,
              background:
                row === "\\cdots"
                  ? "transparent"
                  : oldest
                    ? COLORS.amberSoft
                    : COLORS.greenSoft,
              color: COLORS.green,
              fontSize: 10,
              lineHeight: 1.2,
            }}
          >
            <MathFormula
              tex={row === "\\cdots" ? row : `\\mathbf u_{${layer},${row}}`}
            />
          </div>
        );
      })}
      <div
        data-cache-write-label
        style={{
          position: "absolute",
          left: "50%",
          top: "52%",
          width: "40%",
          transform: "translate(-50%,-50%)",
          display: "grid",
          gap: 4,
          textAlign: "center",
          color: COLORS.green,
          fontSize: 10,
        }}
      >
        <strong>128 槽</strong>
        <MathFormula tex={`\\mathbf u_{${layer},t+1}`} />
        <span style={{ color: COLORS.amber }}>覆盖最旧槽</span>
      </div>
      <strong
        style={{
          position: "absolute",
          bottom: 0,
          width: "100%",
          textAlign: "center",
          fontSize: 11,
          color: COLORS.green,
        }}
      >
        Decode 环形 cache
      </strong>
    </div>
  );
}

function MatrixBracket({
  layer,
  rows,
  compact = false,
}: {
  layer: number;
  rows: MatrixRowSpec[];
  compact?: boolean;
}) {
  const firstSelected = rows.findIndex((row) => row.selected && !row.ellipsis);
  const lastSelected = rows.reduce(
    (last, row, index) => (row.selected && !row.ellipsis ? index : last),
    -1,
  );
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "8px minmax(0,1fr) 8px",
        gap: 4,
        alignItems: "stretch",
        minWidth: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          borderLeft: `2px solid ${COLORS.ink}`,
          borderTop: `2px solid ${COLORS.ink}`,
          borderBottom: `2px solid ${COLORS.ink}`,
        }}
      />
      <div style={{ display: "grid", gap: compact ? 2 : 3, minWidth: 0 }}>
        {firstSelected >= 0 && (
          <div
            data-selection-window
            aria-hidden
            style={{
              gridColumn: 1,
              gridRow: `${firstSelected + 1} / ${lastSelected + 2}`,
              border: `1px dashed ${COLORS.amber}`,
              borderRadius: 4,
              margin: -1,
              pointerEvents: "none",
            }}
          />
        )}
        {rows.map((item, index) => (
          <div
            key={`${item.row}-${index}`}
            data-matrix-ellipsis={item.ellipsis || undefined}
            style={{
              minWidth: 0,
              gridColumn: 1,
              gridRow: index + 1,
              minHeight: compact ? (item.ellipsis ? 14 : 20) : 22,
              display: "grid",
              gridTemplateColumns: "1fr",
              alignItems: "center",
              gap: 3,
              padding: compact ? 0 : item.ellipsis ? "1px 4px" : "2px 4px",
              borderRadius: 5,
              border: "none",
              background: "transparent",
              color: COLORS.ink,
              fontSize: compact ? 9 : 9.5,
              textAlign: "center",
            }}
          >
            {item.ellipsis ? (
              <MathFormula tex="\vdots" />
            ) : (
              <VectorStrip
                name={`\\mathbf u_{${layer},${item.row}}`}
                length="512"
                elementTex={(column) => `u_{${layer},${item.row},${column}}`}
                tone="green"
                selected={item.selected}
                outlineSelection={false}
                compact
              />
            )}
          </div>
        ))}
      </div>
      <span
        aria-hidden
        style={{
          borderRight: `2px solid ${COLORS.ink}`,
          borderTop: `2px solid ${COLORS.ink}`,
          borderBottom: `2px solid ${COLORS.ink}`,
        }}
      />
    </div>
  );
}

function SwaSelectionConnector({ layer }: { layer: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [path, setPath] = useState("");
  // 结果框是同一父节点下的子节点，直接订阅其局部几何；不依赖屏幕外详情 DOM。
  const targetGeometry = useStore((state) => {
    const node = state.nodeLookup.get("swa-result");
    return node
      ? `${node.position.x},${node.position.y},${node.measured.width ?? node.width ?? 0}`
      : "";
  });
  useEffect(() => {
    const svg = svgRef.current;
    const frame = svg?.closest(".react-flow__node");
    const source = frame?.querySelector("[data-selection-window]");
    if (!svg || !source || !targetGeometry) return;
    const [targetX, targetY, targetWidth] = targetGeometry
      .split(",")
      .map(Number);
    const measure = () => {
      const root = svg.getBoundingClientRect(),
        from = source.getBoundingClientRect();
      if (!root.width || !root.height) return;
      const sx = svg.clientWidth / root.width,
        sy = svg.clientHeight / root.height;
      const x1 = (from.right - root.left) * sx,
        y1 = (from.top + from.height / 2 - root.top) * sy;
      const x2 = targetX + targetWidth / 2,
        y2 = targetY;
      const channelX = Math.max(x1 + 24, x2 + 24),
        channelY = y2 - 18;
      setPath(`M ${x1} ${y1} H ${channelX} V ${channelY} H ${x2} V ${y2}`);
    };
    // 在浏览器完成布局后的尺寸通知中读几何；挂载阶段同步读取会让整图反复强制排版。
    const resize = new ResizeObserver(measure);
    [svg, source].forEach((element) => resize.observe(element));
    return () => resize.disconnect();
  }, [layer, targetGeometry]);
  return (
    <svg
      ref={svgRef}
      data-swa-selection-connector
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <defs>
        <marker
          id={`swa-pick-${layer}`}
          viewBox="0 -5 10 10"
          refX="9"
          refY="0"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path
            d="M 1 -4 L 9 0 L 1 4"
            fill="none"
            stroke={COLORS.amber}
            strokeWidth="1.5"
          />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        stroke={COLORS.amber}
        strokeWidth="1.5"
        markerEnd={`url(#swa-pick-${layer})`}
      />
    </svg>
  );
}

function Head({ index, layer }: { index: number; layer: number }) {
  const { phase, count, rows } = useExecutionAxis();
  const queryRow = `\\mathbf q_{${layer},${index},t}`;
  const rotatedQuery = `\\mathbf q'_{${layer},${index},t}`;
  return (
    <div
      data-head-layout={index}
      style={{
        position: "relative",
        minWidth: 0,
        border: `1.5px solid ${frameColor(COLORS.green)}`,
        borderRadius: 10,
        padding: 12,
        display: "grid",
        gap: 10,
        alignContent: "start",
        background: "transparent",
        fontSize: 13,
      }}
    >
      <Handle
        id={`query-${index}`}
        type="target"
        position={Position.Top}
        style={{ ...handle, background: COLORS.blue }}
      />
      <strong
        style={{ color: COLORS.green, textAlign: "center", fontSize: 16 }}
      >
        Layer {layer} · Head {index} ·{" "}
        {phase === "prefill" ? "放大第 t 行" : "当前唯一 Query · 位置 t"}
      </strong>
      <RotaryProcess
        input={queryRow}
        output={rotatedQuery}
        position="t-1"
        layer={layer}
      />
      <FlowStep>① 用旋转后的 Q，逐行与 K 做点积</FlowStep>
      <AttentionTensor
        tex={`Q=${rotatedQuery}`}
        rows="1"
        columns="512"
        scalar={(_, column) => `q'_{${column}}`}
        tone="blue"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 24px 1fr",
          gap: 8,
          alignItems: "center",
        }}
      >
        <AttentionTensor
          tex="K"
          rows="L_t"
          columns="512"
          scalar={(row, column) => `k_{${row},${column}}`}
        />
        <Operator tex="=" />
        <AttentionTensor
          tex={`V=\\mathrm{KV}_{${layer},t}`}
          rows="L_t"
          columns="512"
          scalar={(row, column) => `v_{${row},${column}}`}
        />
      </div>
      <span style={{ color: COLORS.muted }}>
        同一份已旋转 KV：K 用于打分，V 用于加权；
        <MathFormula tex="L_t" /> 为当前可见 KV 行数。
      </span>
      <div
        data-attention-dot-products
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 22px 1fr",
          gap: 7,
          alignItems: "center",
        }}
      >
        {["1", "2", "L_t"].map((row, i) => (
          <React.Fragment key={row}>
            {i === 2 && <Operator tex="\cdots" />}
            <div style={{ display: "grid", gap: 5, textAlign: "center" }}>
              <MathFormula
                tex={`\\mathbf q'\\cdot\\mathbf k_{${row}}^{\\mathsf T}`}
              />
              <FlowStep>
                <MathFormula tex="\div\sqrt{512}" />
              </FlowStep>
              <Box tone="amber">
                <MathFormula tex={`z_{${row}}`} />
              </Box>
            </div>
          </React.Fragment>
        ))}
      </div>
      <section
        data-attention-dot-expansion
        style={{
          border: `1px solid ${COLORS.line}`,
          borderRadius: 8,
          padding: 8,
        }}
      >
        <strong>任意第 i 行：对应元素相乘，再把全部 512 项累加</strong>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,minmax(0,1fr))",
            gap: 8,
            marginTop: 6,
          }}
        >
          {["1", "2", "512"].map((column) => (
            <div
              key={column}
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Box tone="blue">
                <MathFormula tex={`q'_{${column}}`} />
              </Box>
              <Operator tex="\times" />
              <Box tone="green">
                <MathFormula tex={`k_{i,${column}}`} />
              </Box>
            </div>
          ))}
        </div>
        <SumJunction count={3} />
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
          }}
        >
          <MathFormula tex="\sum_{d=1}^{512}q'_d\cdot k_{i,d}" />
          <Operator tex="\div\sqrt{512}" />
          <Operator tex="=" />
          <Box tone="amber">
            <MathFormula tex="z_i" />
          </Box>
        </div>
      </section>
      <FlowStep>② softmax：指数 → 同一个分母 → 每行的权重</FlowStep>
      <AttentionTensor
        tex="\mathbf z"
        rows="1"
        columns="L_t"
        scalar={(_, column) => `z_{${column}}`}
        tone="amber"
      />
      <section
        data-attention-denominator
        style={{
          border: `1px solid ${COLORS.line}`,
          borderRadius: 8,
          padding: 8,
        }}
      >
        <strong>共同分母：全部 Lₜ 行的指数与 sink 项</strong>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,minmax(0,1fr))",
            gap: 8,
            marginTop: 6,
          }}
        >
          {["z_1", "z_2", "z_{L_t}", `b_{${layer},${index}}`].map((tex, i) => (
            <div
              key={tex}
              style={{ display: "grid", justifyItems: "center", gap: 4 }}
            >
              <Box tone="amber">
                <MathFormula tex={tex} />
              </Box>
              <FlowStep>exp</FlowStep>
              <Box tone="amber">
                <MathFormula tex={`e^{${tex}}`} />
              </Box>
              <span style={{ fontSize: 11 }}>
                {i === 3
                  ? "可学习 sink · 值向量为 0"
                  : i === 2
                    ? "末行（中间同构行省略）"
                    : `第 ${i + 1} 行`}
              </span>
            </div>
          ))}
        </div>
        <SumJunction count={4} />
        <div style={{ width: "fit-content", margin: "0 auto" }}>
          <Box tone="amber">
            <MathFormula tex="D" />
          </Box>
        </div>
      </section>
      <div
        data-attention-softmax
        style={{
          display: "grid",
          gridTemplateColumns: "max-content 26px max-content 26px max-content",
          justifyContent: "center",
          gap: 5,
          alignItems: "center",
        }}
      >
        <Box tone="amber">
          <MathFormula tex="e^{z_i}" />
        </Box>
        <Operator tex="\div" />
        <div style={{ display: "grid", gap: 4, textAlign: "center" }}>
          <Box tone="amber">
            <MathFormula tex="D" />
          </Box>
          <span style={{ fontSize: 11 }}>上方累加得到的同一个分母</span>
        </div>
        <Operator tex="=" />
        <Box tone="green">
          <MathFormula tex="a_i" />
        </Box>
      </div>
      <AttentionTensor
        tex="\mathbf a"
        rows="1"
        columns="L_t"
        scalar={(_, column) => `a_{${column}}`}
      />
      <FlowStep>③ 每个权重乘对应的 V 行，再逐列相加</FlowStep>
      <div data-attention-value-sum>
        <StackedSum omittedBefore={2}>
          {["1", "2", "L_t"].map((row) => (
            <div
              key={row}
              style={{
                display: "grid",
                gridTemplateColumns: "70px 24px minmax(0,1fr)",
                gap: 6,
                alignItems: "center",
              }}
            >
              <Box tone="amber">
                <MathFormula tex={`a_{${row}}`} />
              </Box>
              <Operator tex="\times" />
              <AttentionTensor
                tex={`\\mathbf v_{${row}}`}
                rows="1"
                columns="512"
                scalar={(_, column) => `v_{${row},${column}}`}
              />
            </div>
          ))}
        </StackedSum>
      </div>
      <AttentionTensor
        tex={`\\widetilde{\\mathbf o}_{${layer},${index},t}`}
        rows="1"
        columns="512"
        scalar={(_, column) => `\\widetilde o_{${column}}`}
        tone="amber"
      />
      <div style={{ textAlign: "center", fontSize: 12 }}>
        <MathFormula tex="\widetilde o_d=\sum_{i=1}^{L_t}a_i\cdot v_{i,d},\quad d=1,\ldots,512" />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 24px 1fr",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div
          data-inverse-rotation
          style={{ minWidth: 0, display: "grid", gap: 8, fontSize: 12 }}
        >
          <strong>
            ④ 输出逆旋转
            {phase === "prefill" ? "，再放回第 t 行" : "，得到当前行"}
          </strong>
          <span>前 448 维原样传递；后 64 维逐对旋转：</span>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 24px 1fr",
              gap: 5,
              alignItems: "center",
            }}
          >
            <Box tone="amber">
              <MathFormula tex="(\widetilde o_{449+2j},\widetilde o_{450+2j})" />
            </Box>
            <Operator tex="\to" />
            <Box tone="green">
              <MathFormula tex="(o_{449+2j},o_{450+2j})" />
            </Box>
          </div>
          <MathFormula tex="R(-(t-1)\omega_j),\quad j=0,1,\ldots,31" />
          <span>沿用上方 2×2 旋转矩阵，把角度取负。</span>
          {/* [OM-FREEPLAY] 仅用三行 KV 的玩具数值说明 sink 与逐列加权。 */}
          <div
            data-attention-example
            style={{
              padding: 8,
              border: `1px dashed ${COLORS.amber}`,
              borderRadius: 6,
              display: "grid",
              gap: 6,
            }}
          >
            <strong>三行 KV 的数值例子</strong>
            <MathFormula tex="\mathbf z=(0,\ln2,0),\quad b=0" />
            <MathFormula tex="D=1+1+2+1=5" />
            <MathFormula tex="\mathbf a=(0.2,0.4,0.2),\quad a_{\rm sink}=0.2" />
            <MathFormula tex="(v_{1,1},v_{2,1},v_{3,1})=(2,4,6)" />
            <MathFormula tex="o_1=0.2\cdot2+0.4\cdot4+0.2\cdot6=3.2" />
          </div>
        </div>
        <Operator tex="\to" />
        <div data-head-output style={{ minWidth: 0, display: "grid", gap: 6 }}>
          <span
            style={{ fontSize: 12, color: COLORS.green, textAlign: "center" }}
          >
            {phase === "prefill"
              ? "每个位置并行得到一行输出"
              : "本步输出 1 行；下一步位置 t+1"}
          </span>
          <RowMatrix
            tex={`O_{${layer},${index}}`}
            shape={`${count}\\times512`}
            rows={rows.map((s) =>
              s === "\\vdots" ? s : `\\mathbf o_{${layer},${index},${s}}`,
            )}
            selected={rows.indexOf("t")}
            rowLength="512"
            elementTex={(row, column) =>
              `o_{${layer},${index},${rows[row]},${column}}`
            }
          />
        </div>
      </div>
    </div>
  );
}

export function Expert({
  layer,
  index,
  score,
  shared = false,
}: {
  layer: number;
  index?: number;
  score?: string;
  shared?: boolean;
}) {
  const { count, phase } = useExecutionAxis();
  const expertIndex = shared ? "\\mathrm{shared}" : `${index}`;
  const expertTex = `E_{${layer},${expertIndex}}`;
  const weightIndex = shared ? "\\mathrm{shared}" : `${index}`;
  const color = shared ? COLORS.blue : COLORS.amber;
  const matrix = (
    tex: string,
    scalar: string,
    rows: string,
    columns: string,
    weight = false,
    multiplyInput = false,
  ) => (
    <div
      data-expert-matrix={tex}
      data-expanded-tensor
      style={{
        minWidth: 0,
        padding: 5,
        border: `1px solid ${frameColor(color)}`,
        borderRadius: 6,
        background: "transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 3,
          fontSize: 11,
        }}
      >
        <MathFormula tex={multiplyInput ? `\\times ${tex}` : tex} />
        <span style={{ fontSize: 10 }}>
          <MathFormula tex={`${rows}\\times ${columns}`} />
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr .35fr 1fr",
          gap: 1,
          alignItems: "center",
          fontSize: 10,
        }}
      >
        {(phase === "decode" && !weight
          ? ["t"]
          : ["1", "2", "3", "\\vdots", rows]
        ).flatMap((row, r) =>
          ["1", "2", "\\cdots", columns].map((column, c) => (
            <div
              key={`${r}-${c}`}
              style={{
                minWidth: 0,
                height: 24,
                boxSizing: "border-box",
                display: "grid",
                placeItems: "center",
                border:
                  row === "\\vdots" || column === "\\cdots"
                    ? undefined
                    : `1px solid ${color}`,
                borderRadius: 2,
                background:
                  row === "\\vdots" || column === "\\cdots"
                    ? "transparent"
                    : weight
                      ? COLORS.amberSoft
                      : COLORS.greenSoft,
              }}
            >
              <MathFormula
                tex={
                  row === "\\vdots"
                    ? c === 1
                      ? "\\vdots"
                      : ""
                    : column === "\\cdots"
                      ? "\\cdots"
                      : `${scalar}_{${row},${column}}`
                }
              />
            </div>
          )),
        )}
      </div>
    </div>
  );
  // 连线放在相邻内容行之间；内容增高时由 Grid 推开，不再依赖矩阵的绝对纵坐标。
  const connector = (
    kind: "split" | "merge" | "down" | "left",
    height = 28,
  ) => (
    <svg
      data-expert-connector={kind}
      aria-hidden
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block", width: "100%", height, color }}
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <path
          vectorEffect="non-scaling-stroke"
          d={
            kind === "split"
              ? `M50 0 V10 H25 V${height} M50 10 H75 V${height}`
              : kind === "merge"
                ? `M25 0 V10 H75 V0 M50 10 V${height}`
                : kind === "left"
                  ? `M50 0 V10 H25 V${height}`
                  : `M50 0 V${height}`
          }
        />
        {(kind === "split" ? [25, 75] : kind === "left" ? [25] : [50]).map(
          (x) => (
            <path
              key={x}
              vectorEffect="non-scaling-stroke"
              d={`M${x - 1} ${height - 6} L${x} ${height} L${x + 1} ${height - 6}`}
            />
          ),
        )}
      </g>
    </svg>
  );
  const twoColumns: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
    gap: 16,
    alignItems: "start",
  };
  return (
    <div
      data-expert={shared ? "shared" : index}
      style={{
        border: `1.5px solid ${frameColor(shared ? COLORS.blue : COLORS.amber)}`,
        borderRadius: 9,
        padding: 9,
        display: "grid",
        gap: 7,
        background: "transparent",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: shared ? COLORS.blue : COLORS.amber,
          fontWeight: 800,
          fontSize: 11,
        }}
      >
        <span>
          {shared
            ? `Layer ${layer} · Shared`
            : `Layer ${layer} · Expert ${index}`}
        </span>
        <span>
          {shared ? (
            "权重 1"
          ) : (
            <MathFormula tex={`g_{${layer},${index}}=${score}`} />
          )}
        </span>
      </div>
      <div data-expert-structure style={{ display: "grid", minWidth: 0 }}>
        {matrix(`Y_{${layer}}`, "y", count, "5120")}
        {connector("split")}
        <div style={twoColumns}>
          {matrix(
            `W_{${layer},${weightIndex}}^{\\mathrm{gate}}`,
            "w^{\\mathrm{gate}}",
            "5120",
            "d_e",
            true,
            true,
          )}
          {matrix(
            `W_{${layer},${weightIndex}}^{\\mathrm{up}}`,
            "w^{\\mathrm{up}}",
            "5120",
            "d_e",
            true,
            true,
          )}
        </div>
        <div style={{ ...twoColumns, alignItems: "stretch" }}>
          <div style={{ minWidth: 0, display: "grid" }}>
            {connector("down")}
            {matrix(`Z_{${layer},${expertIndex}}`, "z", count, "d_e")}
            {connector("down")}
            <div
              data-expert-activation
              style={{
                border: `1px solid ${frameColor(color)}`,
                borderRadius: 6,
                padding: 8,
                textAlign: "center",
                fontSize: 12,
              }}
            >
              <strong style={{ fontSize: 12 }}>SiLU · 对矩阵中每个元素</strong>
              <div data-silu-input style={{ marginTop: 8 }}>
                <MathFormula tex="z" />
              </div>
              {connector("split", 24)}
              <div style={{ ...twoColumns, gap: 8, alignItems: "stretch" }}>
                {["z", "\\sigma(z)=\\frac1{1+e^{-z}}"].map((tex) => (
                  <div
                    key={tex}
                    data-silu-operand
                    style={{
                      border: `1px solid ${frameColor(color)}`,
                      borderRadius: 4,
                      padding: "7px 2px",
                      display: "grid",
                      placeItems: "center",
                      minWidth: 0,
                    }}
                  >
                    <MathFormula tex={tex} />
                  </div>
                ))}
              </div>
              <div
                data-silu-multiply
                style={{ position: "relative", height: 44 }}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 100 44"
                  preserveAspectRatio="none"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                  }}
                >
                  <g fill="none" stroke={color} strokeWidth="1.5">
                    <path
                      data-silu-arrow="identity"
                      vectorEffect="non-scaling-stroke"
                      d="M25 0 V14 H44 M42 10 L44 14 L42 18"
                    />
                    <path
                      data-silu-arrow="sigmoid"
                      vectorEffect="non-scaling-stroke"
                      d="M75 0 V14 H56 M58 10 L56 14 L58 18"
                    />
                    <path
                      data-silu-arrow="output"
                      vectorEffect="non-scaling-stroke"
                      d="M50 25 V44 M49 38 L50 44 L51 38"
                    />
                  </g>
                </svg>
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: "44%",
                    width: "12%",
                    textAlign: "center",
                  }}
                >
                  <MathFormula tex="\times" />
                </span>
              </div>
              <div data-silu-output>
                <MathFormula tex="a=z\cdot\sigma(z)" />
              </div>
              {/* [OM-FREEPLAY] 用 z=2 演示一个元素的 SiLU，数值不代表模型输出。 */}
              <div
                data-silu-example
                style={{
                  borderTop: `1px solid ${COLORS.line}`,
                  paddingTop: 6,
                  marginTop: 6,
                  fontSize: 11,
                }}
              >
                <MathFormula tex="z=2\;\Rightarrow\;a=2\times0.8808\approx1.7616" />
              </div>
            </div>
            {connector("down")}
          </div>
          <div
            data-expert-up-flow
            style={{ position: "relative", minHeight: 28 }}
          >
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
              }}
            >
              <path
                vectorEffect="non-scaling-stroke"
                d="M50 0 V100 M49 98 L50 100 L51 98"
                fill="none"
                stroke={color}
                strokeWidth="1.5"
              />
            </svg>
            <span
              style={{
                position: "absolute",
                left: "55%",
                top: 20,
                fontSize: 11,
              }}
            >
              Up 分支
            </span>
          </div>
        </div>
        <div style={twoColumns}>
          {matrix(`A_{${layer},${expertIndex}}`, "a", count, "d_e")}
          {matrix(`B_{${layer},${expertIndex}}`, "b", count, "d_e")}
        </div>
        {connector("merge")}
        <div data-expert-product style={{ textAlign: "center", fontSize: 12 }}>
          <MathFormula tex="\odot" /> 逐元素相乘
        </div>
        {connector("left")}
        <div
          data-expert-down-projection
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) 24px minmax(0,1fr)",
            columnGap: 6,
            alignItems: "start",
          }}
        >
          {matrix(`C_{${layer},${expertIndex}}`, "c", count, "d_e")}
          <div
            data-expert-down-multiply
            style={{
              display: "grid",
              placeItems: "center",
              alignSelf: "stretch",
            }}
          >
            <Operator tex="\times" />
          </div>
          <div style={{ gridColumn: 3, minWidth: 0 }}>
            {matrix(
              `W_{${layer},${weightIndex}}^{\\mathrm{down}}`,
              "w^{\\mathrm{down}}",
              "d_e",
              "5120",
              true,
            )}
          </div>
        </div>
        <div
          data-expert-down-result
          style={{
            display: "grid",
            gridTemplateColumns: "24px minmax(0,1fr)",
            gap: 6,
            marginTop: 8,
            alignItems: "center",
          }}
        >
          <Operator tex="=" />
          {matrix(`${expertTex}(Y_{${layer}})`, "o", count, "5120")}
        </div>
      </div>
      <span style={{ fontSize: 11, color: COLORS.muted }}>
        <MathFormula tex="d_e" />
        ：该专家的中间维度
      </span>
    </div>
  );
}

function SelectedGlobalRows({
  kvSource,
  indexSource,
}: {
  kvSource: number;
  indexSource: number;
}) {
  const rows = [
    { label: "1", selected: false },
    { label: `i_{${indexSource},t,1}`, selected: true },
    { label: `i_{${indexSource},t,2}`, selected: true },
    { label: "\\vdots", selected: true, ellipsis: true },
    { label: `i_{${indexSource},t,K_{${indexSource},t}}`, selected: true },
    { label: "M", selected: false },
  ];
  return (
    <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "max-content 8px minmax(0,1fr) 8px",
          gap: 4,
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateRows: `repeat(${rows.length},1fr)`,
            gap: 3,
            color: COLORS.muted,
            fontSize: 10,
            textAlign: "right",
            alignItems: "center",
          }}
        >
          {rows.map((row, index) => (
            <span
              key={`${row.label}-${index}`}
              style={{
                color: row.selected ? COLORS.amber : COLORS.muted,
                fontWeight: row.selected ? 800 : 500,
              }}
            >
              <MathFormula tex={row.label} />
            </span>
          ))}
        </div>
        <span
          aria-hidden
          style={{
            borderLeft: `2px solid ${COLORS.ink}`,
            borderTop: `2px solid ${COLORS.ink}`,
            borderBottom: `2px solid ${COLORS.ink}`,
          }}
        />
        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
          {rows.map((row, rowIndex) => (
            <div
              key={`${row.label}-values-${rowIndex}`}
              style={{
                minWidth: 0,
                minHeight: 28,
                padding: 2,
                textAlign: "center",
                fontSize: 9.5,
              }}
            >
              {row.ellipsis ? (
                <MathFormula tex="\vdots" />
              ) : (
                <VectorStrip
                  name={`\\mathbf g_{${kvSource},${row.label}}`}
                  length="512"
                  nameWidth={76}
                  elementTex={(column) =>
                    `g_{${kvSource},${row.label},${column}}`
                  }
                  tone="green"
                  selected={row.selected}
                  compact
                />
              )}
            </div>
          ))}
        </div>
        <span
          aria-hidden
          style={{
            borderRight: `2px solid ${COLORS.ink}`,
            borderTop: `2px solid ${COLORS.ink}`,
            borderBottom: `2px solid ${COLORS.ink}`,
          }}
        />
      </div>
      <div
        style={{
          paddingLeft: 52,
          color: COLORS.amber,
          fontSize: 10.5,
          fontWeight: 800,
          textAlign: "center",
        }}
      >
        虚线范围内的整行元素共同选中
      </div>
    </div>
  );
}

function DiagramNodeContent({ data }: { data: DiagramData }) {
  const { kind, layer, mode } = data;
  const { phase, count, rows: tokenRows } = useExecutionAxis();
  const both = (
    <>
      <Handle
        id="main-in"
        type="target"
        position={Position.Top}
        style={handle}
      />
      <Handle
        id="main-out"
        type="source"
        position={Position.Bottom}
        style={handle}
      />
    </>
  );

  // [OM-FREEPLAY] 用 N=6、t=3 与 P=6 对照并行行数和 Decode 的全局位置，数值仅为教学示例。
  if (kind === "execution-guide")
    return (
      <div
        data-execution-guide={phase}
        style={{
          ...panel,
          height: "auto",
          borderColor: frameColor(COLORS.blue),
        }}
      >
        <Title>
          {phase === "prefill"
            ? "Prefill · 整段 token 并行"
            : "Decode · 单个新 token"}
        </Title>
        <div style={{ padding: 14, display: "grid", gap: 12, fontSize: 14 }}>
          <MathFormula
            tex={
              phase === "prefill"
                ? "N=\\text{本次输入的 token 数},\\quad t\\in\\{1,2,\\ldots,N\\}"
                : "t=P+k,\\quad k=1,2,\\ldots"
            }
          />
          <span>
            {phase === "prefill"
              ? "t 是序列位置。下方放大其中一行；所有位置都计算，各自只读因果可见的 KV。"
              : "P 是 prompt 的 token 数，k 是本次 Decode 步号。当前张量只有一行，它的全局位置仍是 t。"}
          </span>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 28px 1fr",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Box tone="blue">
              <MathFormula
                tex={phase === "prefill" ? "1,2,\\ldots,N" : "t=P+k"}
              />
            </Box>
            <Operator tex="\to" />
            <Box tone="green">
              <MathFormula tex={`${count}\\text{ 行当前输入}`} />
            </Box>
          </div>
          <span>
            {phase === "prefill"
              ? "示例：N=6 时，t=3 展示第 3 行；第 1、2、4、5、6 行同样参与计算。"
              : "示例：P=6，第一步 t=7；下一步 t=8。已算过的 KV 留在缓存，旧 Query 不重算。"}
          </span>
          <span style={{ color: COLORS.muted, fontSize: 12 }}>
            图采用单序列、5120 维单路张量视图；batch 与 Hyper-Connections
            轴折叠。
          </span>
        </div>
      </div>
    );

  if (kind === "tokenizer")
    return (
      <div data-tokenizer={phase} style={{ ...panel, height: "auto" }}>
        <Handle
          id="main-out"
          type="source"
          position={Position.Bottom}
          style={handle}
        />
        <Title>
          {phase === "prefill"
            ? "输入文本 → Tokenizer → Token IDs"
            : "Decode 输入来源 · 上一步生成的 Token ID"}
        </Title>
        <div style={{ padding: 14, display: "grid", gap: 10 }}>
          {phase === "prefill" ? (
            <>
              <Box tone="blue">输入文本（含对话模板）</Box>
              <FlowStep>
                Tokenizer 按词表编码；一个 token 可对应字、子词或标点
              </FlowStep>
            </>
          ) : (
            <>
              <Box tone="blue">Prompt 已经 Tokenizer → Prefill</Box>
              <FlowStep>上一位置的 logits → 采样 / argmax → 当前 ID</FlowStep>
            </>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `76px repeat(${phase === "prefill" ? 6 : 1},minmax(0,1fr))`,
              alignItems: "center",
              gap: 8,
              textAlign: "center",
              fontSize: 13,
            }}
          >
            <strong>位置</strong>
            {tokenRows.map((s, i) => (
              <MathFormula
                key={`p-${i}`}
                tex={s === "\\vdots" ? "\\cdots" : s}
              />
            ))}
            <strong>Token ID</strong>
            {tokenRows.map((s, i) =>
              s === "\\vdots" ? (
                <MathFormula key={i} tex="\cdots" />
              ) : (
                <Box key={i} tone={s === "t" ? "amber" : "blue"}>
                  <MathFormula tex={`v_{${s}}`} />
                </Box>
              ),
            )}
          </div>
          <span style={{ fontSize: 12, color: COLORS.muted }}>
            位置 t 与词表 ID <MathFormula tex="v_t" />{" "}
            分开：位置决定行号，同一个 ID 可以出现在多个位置。
          </span>
        </div>
      </div>
    );

  if (kind === "embedding")
    return (
      <div
        data-embedding
        style={{
          ...panel,
          height: "auto",
          borderColor: frameColor(COLORS.blue),
        }}
      >
        {both}
        <Title>Embedding · 每个 Token ID 查词表中的一行</Title>
        <div style={{ padding: 14, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <MathFormula tex="W^{\mathrm{emb}}" />
            <MathFormula tex="|\mathcal V|\times5120" />
          </div>
          {(phase === "prefill" ? ["1", "2", "t", "N"] : ["t"]).map((s) => (
            <div
              key={s}
              style={{
                display: "grid",
                gridTemplateColumns: "65px 24px minmax(0,1fr) 24px 95px",
                gap: 6,
                alignItems: "center",
                fontSize: 12,
              }}
            >
              <Box tone="amber">
                <MathFormula tex={`v_{${s}}`} />
              </Box>
              <Operator tex="\to" />
              <VectorStrip
                name={`\\mathbf w^{\\mathrm{emb}}_{v_{${s}}}`}
                nameWidth={98}
                length="5120"
                elementTex={(c) => `w^{\\mathrm{emb}}_{v_{${s}},${c}}`}
                tone="blue"
                compact
              />
              <Operator tex="\to" />
              <MathFormula tex={`\\mathbf e_{${s}}`} />
            </div>
          ))}
          <span style={{ fontSize: 12, color: COLORS.muted }}>
            按输入位置排成 E 的{phase === "prefill" ? " N 行" : " 1 行"}
            ，再复制到四路残差；词表参数共享，行号保持不变。
          </span>
        </div>
      </div>
    );

  if (kind === "prior-layers")
    return (
      <div
        style={{
          ...panel,
          padding: 12,
          display: "grid",
          gap: 8,
          textAlign: "center",
          fontSize: 14,
        }}
      >
        {both}
        <strong>进入当前层之前 · 四路残差与汇合权重一起传递</strong>
        <MathFormula
          tex={`\\mathcal H_1^{\\mathrm{in}}\\;\\xrightarrow{\\mathrm{Layer}\\;1\\ldots${layer - 1}}\\;\\mathcal H_{${layer - 1}}^{\\mathrm{out}}=\\mathcal H_{${layer}}^{\\mathrm{in}}`}
        />
        <MathFormula
          tex={`\\mathbf p_{${layer - 1},t}^{F}\\;\\longrightarrow\\;\\text{本层 Attention 汇合}`}
        />
      </div>
    );

  if (kind === "hc-expand")
    return (
      <div
        style={{
          ...panel,
          height: "auto",
          padding: 12,
          display: "grid",
          gap: 9,
        }}
      >
        {both}
        <strong>Embedding → mHC 四路初始化</strong>
        <Box tone="blue">
          <MathFormula tex={`E\\in\\mathbb R^{${count}\\times5120}`} />
        </Box>
        <FlowStep>复制到 4 路；此时每路数值相同</FlowStep>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,minmax(0,1fr))",
            gap: 6,
          }}
        >
          {HC_COPIES.map((c) => (
            <Box key={c} tone="blue">
              <MathFormula tex={`H_{1,${c}}^{\\mathrm{in}}=E`} />
            </Box>
          ))}
        </div>
        <MathFormula tex="\mathbf p_t^{\mathrm{init}}=(1,0,0,0)" />
      </div>
    );
  if (kind === "hc-pre" || kind === "hc-mix")
    return (
      <div style={{ ...panel, height: "auto", padding: 12 }}>
        <Handle
          id="main-in"
          type="target"
          position={Position.Top}
          style={{ ...handle, left: kind === "hc-pre" ? "25%" : "50%" }}
        />
        {kind === "hc-pre" ? (
          <>
            <Handle
              id="main-out"
              type="source"
              position={Position.Bottom}
              style={handle}
            />
            <MhcPre
              layer={layer}
              sublayer={data.sublayer!}
              count={count}
              connected
            />
          </>
        ) : (
          <>
            <MhcMix layer={layer} sublayer={data.sublayer!} connected />
          </>
        )}
      </div>
    );
  if (kind === "engram-lookup")
    return (
      <div style={{ ...panel, height: "auto", padding: 12 }}>
        {both}
        <EngramLookup layer={layer} phase={phase} />
      </div>
    );
  if (kind === "engram-inject")
    return (
      <div style={{ ...panel, height: "auto", padding: 12 }}>
        <Handle
          id="main-in"
          type="target"
          position={Position.Top}
          style={{ ...handle, left: "25%" }}
        />
        <Handle
          id="memory"
          type="target"
          position={Position.Top}
          style={{ ...handle, left: "75%" }}
        />
        <Handle
          id="main-out"
          type="source"
          position={Position.Bottom}
          style={handle}
        />
        <Handle
          id="coefficients"
          type="source"
          position={Position.Right}
          style={handle}
        />
        <Handle
          id="residual"
          type="source"
          position={Position.Left}
          style={handle}
        />
        <EngramInject layer={layer} phase={phase} />
      </div>
    );

  if (kind === "query-row")
    return (
      <div
        data-query-row={phase}
        style={{ ...panel, borderColor: frameColor(COLORS.amber) }}
      >
        {both}
        <Title>
          {phase === "prefill"
            ? "③ 展开完整矩阵中的第 t 行"
            : "③ 当前唯一一行 · 全局位置 t"}
          <span style={{ float: "right", fontSize: 11 }}>
            <MathFormula tex="1\times(64\cdot512)" />
          </span>
        </Title>
        <div style={{ padding: 12, display: "grid", gap: 8 }}>
          <VectorStrip
            name={`\\widetilde{\\mathbf q}_{${layer},t}`}
            length="32768"
            elementTex={(c) => `\\widetilde q_{${layer},t,${c}}`}
            tone="green"
            selected
          />
          <span style={{ fontSize: 12 }}>
            {phase === "prefill"
              ? "取行用于放大展示；并行计算仍覆盖 t=1,…,N。"
              : "本次没有其它 Query 行；历史 token 通过 KV 缓存参与注意力。"}
          </span>
        </div>
      </div>
    );

  if (kind === "structure-group") {
    return (
      <div
        style={{
          ...panel,
          borderColor: data.tone === "green" ? COLORS.green : COLORS.blue,
          boxShadow: "none",
          background: "rgba(255,254,250,.66)",
        }}
      >
        <Title>
          {data.tex && (
            <>
              <MathFormula tex={data.tex} /> ·{" "}
            </>
          )}
          {data.title}
        </Title>
      </div>
    );
  }

  if (kind === "structure-operator") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          placeItems: "center",
          color: COLORS.green,
          fontSize: 22,
          fontWeight: 900,
        }}
      >
        <MathFormula tex={data.tex ?? ""} />
      </div>
    );
  }

  if (kind === "structure") {
    const tone = data.tone ?? "neutral";
    const { color, background } = tonePalette(tone);
    const expanded = Boolean(
      data.matrixRows?.length || data.vectorCells?.length,
    );
    return (
      <div
        data-expanded-tensor={expanded || undefined}
        style={{
          ...panel,
          borderColor: frameColor(color),
          borderRadius: 10,
          background: expanded ? "transparent" : background,
          boxShadow: "0 3px 10px rgba(42,41,36,.06)",
          display: "grid",
          gridTemplateRows: data.title ? "auto 1fr" : "1fr",
        }}
      >
        {data.title && (
          <div
            style={{
              padding: "6px 9px",
              borderBottom: `1px solid ${COLORS.line}`,
              fontSize: 10.5,
              fontWeight: 800,
              color,
              lineHeight: 1.2,
            }}
          >
            {data.title}
          </div>
        )}
        <div
          style={{
            padding: 4,
            display: "grid",
            placeItems: "center",
            alignContent: "center",
            gap: 4,
            minWidth: 0,
            textAlign: "center",
            lineHeight: 1.2,
          }}
        >
          {data.matrixRows?.length ? (
            <div style={{ width: "100%", display: "grid", gap: 5 }}>
              {data.tex && (
                <div style={{ color, fontWeight: 800 }}>
                  <MathFormula tex={data.tex} />
                </div>
              )}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "7px minmax(0,1fr) 7px",
                  gap: 4,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    borderLeft: `2px solid ${COLORS.ink}`,
                    borderTop: `2px solid ${COLORS.ink}`,
                    borderBottom: `2px solid ${COLORS.ink}`,
                  }}
                />
                <div style={{ display: "grid", gap: 3 }}>
                  {data.matrixRows.map((row, index) => (
                    <div
                      // 行的身份是矩阵位置，层号变化不能把整行销毁重建。
                      key={index}
                      style={{
                        minHeight: 18,
                        border: `1px solid ${data.matrixSelectedRow === index ? COLORS.amber : color}`,
                        borderRadius: 5,
                        background:
                          data.matrixSelectedRow === index
                            ? COLORS.amberSoft
                            : background,
                        display: "grid",
                        gridTemplateColumns: data.matrixRowCells?.[index]
                          ? "70px minmax(0,1fr)"
                          : "1fr",
                        alignItems: "center",
                        gap: 3,
                        padding: 2,
                        fontSize: 9.5,
                      }}
                    >
                      <MathFormula tex={row} />
                      {data.matrixRowCells?.[index] && (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr .5fr 1fr",
                            gap: 2,
                          }}
                        >
                          {data.matrixRowCells[index].map((cell, cellIndex) =>
                            cell === "\\cdots" ? (
                              <span
                                key={cellIndex}
                                style={{
                                  display: "grid",
                                  placeItems: "center",
                                }}
                              >
                                <MathFormula tex={cell} />
                              </span>
                            ) : (
                              <span
                                key={cellIndex}
                                style={{
                                  padding: "2px 1px",
                                  border: `1px solid ${frameColor(color)}`,
                                  borderRadius: 3,
                                  background,
                                  textAlign: "center",
                                  overflow: "hidden",
                                }}
                              >
                                <MathFormula tex={cell} />
                              </span>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <span
                  aria-hidden
                  style={{
                    borderRight: `2px solid ${COLORS.ink}`,
                    borderTop: `2px solid ${COLORS.ink}`,
                    borderBottom: `2px solid ${COLORS.ink}`,
                  }}
                />
              </div>
            </div>
          ) : data.vectorCells?.length ? (
            <div
              style={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: data.columnVectors
                  ? "1fr"
                  : "minmax(48px,.7fr) minmax(0,1.8fr)",
                alignItems: "center",
                gap: 4,
              }}
            >
              <MathFormula tex={data.tex ?? ""} />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr .55fr 1fr",
                  gap: 3,
                }}
              >
                {data.vectorCells.map((cell, index) =>
                  cell === "\\cdots" ? (
                    <span
                      key={index}
                      style={{ display: "grid", placeItems: "center" }}
                    >
                      <MathFormula tex={cell} />
                    </span>
                  ) : (
                    <span
                      key={index}
                      style={{
                        minHeight: data.columnVectors ? 60 : undefined,
                        display: "grid",
                        placeItems: "center",
                        padding: "3px 2px",
                        border: `1px solid ${frameColor(color)}`,
                        borderRadius: 4,
                        background,
                        fontSize: 9,
                      }}
                    >
                      <MathFormula tex={cell} />
                    </span>
                  ),
                )}
              </div>
            </div>
          ) : (
            <MathFormula tex={data.tex ?? ""} />
          )}
          {data.subtitle && (
            <span style={{ color: COLORS.muted, fontSize: 10.5 }}>
              {data.subtitle}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (kind === "output")
    return (
      <div style={{ ...panel, height: "auto" }}>
        <Title>本层交接 · 状态与权重分别传递</Title>
        <LayerHandoff layer={layer} count={count} connected />
      </div>
    );

  if (kind === "next-inputs")
    return (
      <div
        data-next-layer-frame
        style={{
          ...panel,
          height: "auto",
          border: `2px dashed ${COLORS.green}`,
        }}
      >
        <Title>
          {layer === 40
            ? "主干末尾输出头要用到的输入"
            : `下一层 Layer ${layer + 1} 要用到的输入 · 虚线交接清单`}
        </Title>
        <LayerHandoff layer={layer} count={count} connected preview />
      </div>
    );

  if (kind === "tensor") {
    return (
      <div style={{ ...panel, height: "auto" }}>
        <Handle
          id="main-in"
          type="target"
          position={Position.Top}
          style={handle}
        />
        <Handle
          id="main"
          type="source"
          position={Position.Bottom}
          style={handle}
        />
        <Handle
          id="residual"
          type="source"
          position={Position.Left}
          style={{ ...handle, background: COLORS.amber }}
        />
        <Handle
          id="coefficients"
          type="source"
          position={Position.Right}
          style={handle}
        />
        <Title>层输入 · mHC 四路残差</Title>
        <div style={{ padding: 12, display: "grid", gap: 8 }}>
          <StreamTensor layer={layer} stage="\mathrm{in}" count={count} />
        </div>
      </div>
    );
  }

  if (kind === "norm1") {
    return (
      <div style={{ ...panel, height: "auto", padding: 10 }}>
        <Handle
          id="main-in"
          type="target"
          position={Position.Top}
          style={handle}
        />
        <Handle
          id="query"
          type="source"
          position={Position.Bottom}
          style={{ ...handle, left: "25%", background: COLORS.blue }}
        />
        <Handle
          id="local-kv"
          type="source"
          position={Position.Bottom}
          style={{ ...handle, left: "60%" }}
        />
        <Handle
          id="global-kv"
          type="source"
          position={Position.Bottom}
          style={{ ...handle, left: "85%", background: COLORS.amber }}
        />
        <RmsNormProcess
          input={`H_{${layer}}^{\\mathrm{in}}`}
          output={`X_{${layer}}`}
          dimension={5120}
          rowCount={count}
          gamma={`\\boldsymbol\\gamma_{${layer},1}`}
          label="Attention 输入"
          horizontal
        />
      </div>
    );
  }

  if (kind === "norm2") {
    return (
      <div style={{ ...panel, height: "auto", padding: 10 }}>
        {both}
        <RmsNormProcess
          input={`H_{${layer}}'`}
          output={`Y_{${layer}}`}
          dimension={5120}
          rowCount={count}
          gamma={`\\boldsymbol\\gamma_{${layer},2}`}
          label="FFN 输入"
          horizontal
        />
      </div>
    );
  }

  if (kind === "query-norm")
    return (
      <div style={{ display: "grid", gap: 5 }}>
        <FlowStep>低秩投影结果进入归一化</FlowStep>
        <RmsNormProcess
          input={`\\widehat Q_{${layer}}^r`}
          output={`Q_{${layer}}^r`}
          dimension={1280}
          rowCount={count}
          gamma={`\\boldsymbol\\gamma_{${layer}}^Q`}
          label="Query 低秩投影"
          horizontal
        />
        <FlowStep>归一化结果进入下方升维投影</FlowStep>
      </div>
    );
  if (kind === "projection-q")
    return <QueryProjection layer={layer} normHeight={data.queryNormHeight} />;
  if (kind === "projection-kv") return <LocalKvProjection layer={layer} />;

  if (kind === "swa-window") {
    return (
      <div style={{ ...panel, borderColor: frameColor(COLORS.green) }}>
        <Handle
          id="projected-kv"
          type="target"
          position={Position.Top}
          style={{ ...handle, left: mode === "swa" ? "50%" : "90%" }}
        />
        <Title>
          Layer {layer} ·{" "}
          {phase === "prefill"
            ? "Prefill：每个 Query 读取自己的因果窗口"
            : "Decode：新 KV 写入本层缓存，再读取当前窗口"}
        </Title>
        <div style={{ padding: 10, display: "grid", gap: 8, minWidth: 0 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.7fr 20px .9fr",
              alignItems: "start",
              gap: 8,
              minWidth: 0,
            }}
          >
            <div style={{ minWidth: 0, display: "grid", gap: 6 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "baseline",
                }}
              >
                <strong>
                  {phase === "prefill"
                    ? "完整 KV 潜向量矩阵"
                    : "历史缓存 + 本步新行"}
                </strong>
                <MathFormula
                  tex={
                    phase === "prefill"
                      ? `U_{${layer}}\\in\\mathbb{R}^{N\\times512}`
                      : `\\min(128,t)\\times512`
                  }
                />
              </div>
              <MatrixBracket
                layer={layer}
                rows={
                  phase === "decode"
                    ? [
                        { row: "r", selected: true },
                        { row: "r+1", selected: true },
                        { row: "", ellipsis: true },
                        { row: "t-1", selected: true },
                        { row: "t", selected: true },
                      ]
                    : [
                        { row: "1" },
                        { row: "", ellipsis: true },
                        { row: "r-1" },
                        { row: "r", selected: true },
                        { row: "r+1", selected: true },
                        { row: "", ellipsis: true },
                        { row: "t", selected: true },
                        { row: "t+1" },
                        { row: "N" },
                      ]
                }
                compact
              />
            </div>
            <span />
            <div style={{ minWidth: 0, display: "grid", gap: 8 }}>
              <div
                data-window-start
                style={{
                  minWidth: 0,
                  width: "fit-content",
                  maxWidth: "100%",
                  boxSizing: "border-box",
                  justifySelf: "center",
                  border: `1.5px solid ${frameColor(COLORS.amber)}`,
                  borderRadius: 8,
                  padding: 6,
                  background: COLORS.amberSoft,
                  display: "grid",
                  gap: 4,
                  fontSize: 11,
                  lineHeight: 1.2,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 5,
                  }}
                >
                  <strong>窗口起点 r</strong>
                  <span style={{ fontSize: 8.5 }}>
                    <MathFormula tex="\min(128,t)\times512" />
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "3px 10px",
                    alignItems: "center",
                    textAlign: "center",
                  }}
                >
                  <MathFormula tex="t\le128" />
                  <MathFormula tex="r=1" />
                  <MathFormula tex="t>128" />
                  <MathFormula tex="r=t-127" />
                </div>
                <div
                  style={{
                    borderTop: `1px solid ${COLORS.amber}`,
                    paddingTop: 4,
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 10 }}>行号示例 · 含起点和终点</span>
                  {/* [OM-FREEPLAY] 用 6 与 130 两个位置举例，分别展示未满窗口和滑动后的窗口。 */}
                  {[
                    { t: 6, r: 1, rows: ["1", "2", "3", "\\ldots", "6"] },
                    { t: 130, r: 3, rows: ["3", "4", "5", "\\ldots", "130"] },
                  ].map((example) => (
                    <div
                      key={example.t}
                      data-window-example={example.t}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "max-content max-content",
                        gap: 7,
                        alignItems: "center",
                        fontSize: 9,
                      }}
                    >
                      <MathFormula tex={`t=${example.t},\\;r=${example.r}`} />
                      <div style={{ display: "flex", gap: 3 }}>
                        {example.rows.map((row) => (
                          <span
                            key={row}
                            style={{
                              padding: "1px 3px",
                              border:
                                row === "\\ldots"
                                  ? "none"
                                  : `1px solid ${COLORS.amber}`,
                              borderRadius: 3,
                            }}
                          >
                            <MathFormula tex={row} />
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {phase === "decode" ? (
                <>
                  <FlowStep>
                    <MathFormula
                      tex={`\\mathbf u_{${layer},t}\\;\\to\\;\\text{当前槽位}`}
                    />
                  </FlowStep>
                  <RingCache layer={layer} />
                </>
              ) : (
                <div
                  data-prefill-causal
                  style={{ display: "grid", gap: 6, padding: 6, fontSize: 11 }}
                >
                  <strong>例：N=6，各行只看自身及过去</strong>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "30px repeat(6,1fr)",
                      gap: 3,
                      textAlign: "center",
                    }}
                  >
                    <span>t ∖ KV</span>
                    {[1, 2, 3, 4, 5, 6].map((s) => (
                      <span key={`col-${s}`}>{s}</span>
                    ))}
                    {[1, 2, 3, 4, 5, 6].map((t) => (
                      <React.Fragment key={t}>
                        <span>{t}</span>
                        {[1, 2, 3, 4, 5, 6].map((s) => (
                          <span
                            key={s}
                            style={{
                              border: `1px solid ${s <= t ? COLORS.green : COLORS.line}`,
                              background:
                                s <= t ? COLORS.greenSoft : "transparent",
                              color: s <= t ? COLORS.green : COLORS.faint,
                            }}
                          >
                            {s <= t ? "✓" : "—"}
                          </span>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                  <span>并行算各行 · 每行的可见 KV 不同</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <SwaSelectionConnector layer={layer} />
      </div>
    );
  }

  if (kind === "swa-output") {
    return (
      <div
        data-swa-result
        style={{
          ...panel,
          borderColor: frameColor(COLORS.amber),
          background: COLORS.greenSoft,
          padding: 9,
          display: "grid",
          gap: 6,
        }}
      >
        <Handle
          id="local-window"
          type="source"
          position={Position.Bottom}
          style={{ ...handle, background: COLORS.amber }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 8,
          }}
        >
          <MathFormula tex={`U_{${layer},t}^{\\mathrm{SWA}}`} />
          <span style={{ fontSize: 10 }}>
            <MathFormula tex="\min(128,t)\times512" />
          </span>
        </div>
        <span style={{ fontSize: 11, color: COLORS.green }}>
          窗口 KV · 送往下方 KV 拼接
        </span>
      </div>
    );
  }

  if (kind === "compressor") {
    const kvSource = globalKvSourceLayer(layer)!;
    const ratio = compressionRatioForLayer(kvSource);
    const writesKv = mode === "full";
    return (
      <div
        style={{
          ...panel,
          height: "auto",
          borderColor: frameColor(COLORS.green),
        }}
      >
        <Handle
          id="input"
          type="target"
          position={Position.Top}
          style={handle}
        />
        <Handle
          id="to-indexer"
          type="source"
          position={Position.Bottom}
          style={handle}
        />
        <Title>
          {writesKv ? (
            <>全局 KV 生成 · Layer {layer} Compressor</>
          ) : (
            <>读取 Layer {kvSource} 已生成的全局 KV</>
          )}
        </Title>
        <div
          style={{
            padding: 10,
            display: "grid",
            gap: 7,
            fontSize: 11,
            minWidth: 0,
          }}
        >
          {writesKv ? (
            <>
              <div style={{ display: "grid", gap: 7 }}>
                <div
                  data-expanded-tensor
                  style={{
                    border: `1.2px solid ${frameColor(COLORS.green)}`,
                    borderRadius: 8,
                    padding: 6,
                    display: "grid",
                    gap: 5,
                    background: "transparent",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 10,
                    }}
                  >
                    <MathFormula tex={`W_{${layer}}^{KV,c}`} />
                    <MathFormula tex="5120\times512" />
                  </div>
                  <VectorStrip
                    name={`\\mathbf x_{${layer},t}`}
                    length="5120"
                    elementTex={(column) => `x_{${layer},t,${column}}`}
                    tone="blue"
                    compact
                  />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px 1fr 28px 1.35fr",
                      gap: 4,
                      alignItems: "center",
                    }}
                  >
                    <Operator tex="\times" />
                    <Box>
                      <MathFormula tex={`\\mathbf w_{${layer},:,j}^{KV,c}`} />
                    </Box>
                    <Operator tex="=" />
                    <VectorStrip
                      name={`\\mathbf v_{${layer},t}^{c}`}
                      length="512"
                      elementTex={(column) => `v_{${layer},t,${column}}^c`}
                      tone="green"
                      compact
                    />
                  </div>
                </div>
                {ratio === 2 && (
                  <div
                    data-expanded-tensor
                    style={{
                      border: `1.2px solid ${frameColor(COLORS.amber)}`,
                      borderRadius: 8,
                      padding: 6,
                      display: "grid",
                      gap: 5,
                      background: "transparent",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 10,
                      }}
                    >
                      <MathFormula tex={`W_{${layer}}^{\\mathrm{gate}}`} />
                      <MathFormula tex="5120\times512" />
                    </div>
                    <VectorStrip
                      name={`\\mathbf x_{${layer},t}`}
                      length="5120"
                      elementTex={(column) => `x_{${layer},t,${column}}`}
                      tone="blue"
                      compact
                    />
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "28px 1fr 28px 1.35fr",
                        gap: 4,
                        alignItems: "center",
                      }}
                    >
                      <Operator tex="\times" />
                      <Box>
                        <MathFormula
                          tex={`\\mathbf w_{${layer},:,j}^{\\mathrm{gate}}`}
                        />
                      </Box>
                      <Operator tex="=" />
                      <VectorStrip
                        name={`\\mathbf a_{${layer},t}^{\\mathrm{gate}}`}
                        length="512"
                        elementTex={(column) =>
                          `a_{${layer},t,${column}}^{\\mathrm{gate}}`
                        }
                        tone="amber"
                        compact
                      />
                    </div>
                  </div>
                )}
              </div>
              <Arrow vertical />
              {phase === "decode" && ratio === 2 && (
                <div
                  data-compressor-pending
                  style={{
                    display: "grid",
                    gap: 7,
                    padding: 8,
                    border: `1px solid ${frameColor(COLORS.amber)}`,
                    borderRadius: 7,
                    fontSize: 12,
                  }}
                >
                  <strong>跨步保留一组 KV 与 gate 分数</strong>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 24px 1fr",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Box tone="blue">
                      <MathFormula tex="t=2i-1" />
                      <br />
                      第一行暂存
                    </Box>
                    <Operator tex="\to" />
                    <Box tone="amber">
                      <MathFormula tex="t=2i" />
                      <br />
                      第二行到达，合并本组
                    </Box>
                  </div>
                  <span>
                    凑齐 2 行才新增压缩行；其余历史压缩行留在 G 缓存。
                  </span>
                </div>
              )}
              {ratio === 2 ? (
                <div style={{ display: "grid", gap: 7 }}>
                  <Box tone="amber">
                    <strong>每连续 2 行生成两组逐元素权重</strong>
                    <br />
                    <MathFormula
                      tex={`[\\boldsymbol\\alpha_{${layer},i,1};\\boldsymbol\\alpha_{${layer},i,2}]=\\operatorname{softmax}_{\\mathrm{row}}([\\mathbf a_{${layer},2i-1};\\mathbf a_{${layer},2i}])`}
                    />
                  </Box>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {[1, 2].map((row) => (
                      <div
                        key={row}
                        data-compressor-weighted-row={row}
                        style={{ display: "grid", gap: 5 }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 22px 1fr",
                            gap: 4,
                            alignItems: "center",
                          }}
                        >
                          <Box tone="amber">
                            <MathFormula
                              tex={`\\boldsymbol\\alpha_{${layer},i,${row}}`}
                            />
                          </Box>
                          <Operator tex="\odot" />
                          <Box tone="blue">
                            <MathFormula
                              tex={`\\mathbf v_{${layer},${row === 1 ? "2i-1" : "2i"}}^c`}
                            />
                          </Box>
                        </div>
                        <Operator tex="\downarrow" />
                        <VectorStrip
                          name=""
                          nameWidth={0}
                          length="512"
                          tone="green"
                          elementTex={(j) =>
                            `\\alpha_{i,${row},${j}}\\cdot v^c_{${row === 1 ? "2i-1" : "2i"},${j}}`
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <SumJunction count={2} />
                  <Box tone="green">
                    <MathFormula tex={`\\widehat{\\mathbf g}_{${layer},i}`} /> ·
                    本组逐元素加权和
                  </Box>
                </div>
              ) : (
                <Box tone="amber">
                  <strong>压缩比 1 · 每个投影行直接进入归一化</strong>
                </Box>
              )}
              <FlowStep>每个压缩行沿 512 维归一化</FlowStep>
              <RmsNormProcess
                input={
                  phase === "decode"
                    ? ratio === 2
                      ? `\\widehat{\\mathbf g}_{${layer},i}`
                      : `\\mathbf v_{${layer},i}^c`
                    : ratio === 2
                      ? `\\widehat G_{${layer}}`
                      : `V_{${layer}}^c`
                }
                output={
                  phase === "decode"
                    ? `\\bar{\\mathbf g}_{${layer},i}`
                    : `\\bar G_{${layer}}`
                }
                dimension={512}
                rowCount={phase === "decode" ? "1" : "M"}
                rowIndex="i"
                gamma={`\\boldsymbol\\gamma_{${layer}}^c`}
                label="压缩 KV"
                horizontal
              />
              <FlowStep>
                <MathFormula tex={`\\bar G_{${layer}}`} /> 分支送入
                Indexer；缓存分支按压缩组首 token 的位置旋转
              </FlowStep>
              <RotaryProcess
                input={`\\bar{\\mathbf g}_{${layer},i}`}
                output={`\\mathbf g_{${layer},i}`}
                position={`(i-1)\\cdot ${ratio}`}
                layer={layer}
                compact
              />
            </>
          ) : (
            <Box tone="blue">
              <strong>读取源层输出矩阵</strong>
            </Box>
          )}
          <Matrix
            tex={`G_{${kvSource}}`}
            shape={`M\\times512,\\;M=\\lfloor ${phase === "prefill" ? "N" : "t"}/${ratio}\\rfloor`}
            rowTex={(row) => `\\mathbf g_{${kvSource},${row}}`}
            elementTex={(row, column) => `g_{${kvSource},${row},${column}}`}
            vectorLength="512"
            lastRow="M"
            tone="green"
          />
        </div>
      </div>
    );
  }

  if (kind === "indexer") {
    const kvSource = globalKvSourceLayer(layer)!;
    const indexSource = globalIndexSourceLayer(layer)!;
    const writesIndex = mode === "full" || mode === "reindex";
    return (
      <div
        style={{
          ...panel,
          height: "auto",
          borderColor: frameColor(COLORS.amber),
        }}
      >
        <Handle
          id="query"
          type="target"
          position={Position.Top}
          style={{ ...handle, left: "30%", background: COLORS.blue }}
        />
        <Handle
          id="global-matrix"
          type="target"
          position={Position.Top}
          style={{ ...handle, left: "70%" }}
        />
        <Handle
          id="matrix"
          type="source"
          position={Position.Bottom}
          style={{ ...handle, left: "30%" }}
        />
        <Handle
          id="indices"
          type="source"
          position={Position.Bottom}
          style={{ ...handle, left: "70%", background: COLORS.amber }}
        />
        <Title>
          {writesIndex ? (
            <>Top-512 行选择 · Layer {layer} Indexer</>
          ) : (
            <>复用 Layer {indexSource} 已算出的 Top-512 行号</>
          )}
        </Title>
        <div
          style={{
            padding: 10,
            display: "grid",
            gap: 7,
            fontSize: 11,
            minWidth: 0,
          }}
        >
          {writesIndex ? (
            <>
              <strong>① 三路投影 · 读入同名上游矩阵</strong>
              <div
                data-index-projections
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 12,
                }}
              >
                <IndexProjection
                  layer={layer}
                  inputSymbol="q^r"
                  outputSymbol={"\\widetilde q^I"}
                  title="Query → 32 个索引 Head"
                  input={`Q_{${layer}}^r`}
                  inputWidth="1280"
                  weight={`W_{${layer}}^{IQ}`}
                  output={`\\widetilde Q_{${layer}}^I`}
                  outputWidth="4096"
                  rows={count}
                  scale="4096\;\longrightarrow\;32\times128"
                />
                <IndexProjection
                  layer={layer}
                  inputSymbol="x"
                  outputSymbol={"\\widehat\\eta"}
                  title="每个 Head 的加权系数"
                  input={`X_{${layer}}`}
                  inputWidth="5120"
                  weight={`W_{${layer}}^{IW}`}
                  output={`\\widehat\\eta_{${layer}}`}
                  outputWidth="32"
                  rows={count}
                  scale={`\\eta_{${layer}}=\\widehat\\eta_{${layer}}/\\sqrt{32}`}
                />
                {mode === "full" ? (
                  <IndexProjection
                    layer={kvSource}
                    inputSymbol={"\\bar g"}
                    outputSymbol={"\\widehat k^I"}
                    title="压缩潜向量 → 索引 Key"
                    input={`\\bar G_{${kvSource}}`}
                    inputWidth="512"
                    weight={`W_{${kvSource}}^{IK}`}
                    output={`\\widehat K_{${kvSource}}^I`}
                    outputWidth="128"
                    rows="M"
                  />
                ) : (
                  <RowMatrix
                    tex={`K_{${kvSource}}^{I\\prime}`}
                    shape="M\times128"
                    rows={[
                      "\\mathbf k_1",
                      "\\mathbf k_2",
                      "\\vdots",
                      "\\mathbf k_M",
                    ]}
                    rowLength="128"
                    elementTex={(r, d) =>
                      `k^I_{${["1", "2", "", "M"][r]},${d}}`
                    }
                  />
                )}
              </div>
              <strong>② K 逐行归一化 → Q / K 位置旋转</strong>
              <div
                data-index-preparation
                style={{
                  display: "grid",
                  gridTemplateColumns: mode === "full" ? "1fr 28px 1fr" : "1fr",
                  alignItems: "start",
                  gap: 10,
                }}
              >
                {mode === "full" && (
                  <>
                    <RmsNormProcess
                      input={
                        phase === "decode"
                          ? `\\widehat{\\mathbf k}_{${kvSource},i}^I`
                          : `\\widehat K_{${kvSource}}^I`
                      }
                      output={
                        phase === "decode"
                          ? `\\bar{\\mathbf k}_{${kvSource},i}^I`
                          : `\\bar K_{${kvSource}}^I`
                      }
                      dimension={128}
                      rowCount={phase === "decode" ? "1" : "M"}
                      rowIndex="i"
                      gamma={`\\boldsymbol\\gamma_{${kvSource}}^{IK}`}
                      label="Indexer 的 K"
                      horizontal
                    />
                    <Operator tex="\to" />
                  </>
                )}
                <div style={{ display: "grid", gap: 8 }}>
                  <RotaryProcess
                    input={
                      mode === "full"
                        ? `\\mathbf q^I_{${layer},h,t},\\;\\bar{\\mathbf k}^I_{${kvSource},i}`
                        : `\\mathbf q^I_{${layer},h,t}`
                    }
                    output={
                      mode === "full"
                        ? `\\mathbf q^{I\\prime}_{${layer},h,t},\\;\\mathbf k^{I\\prime}_{${kvSource},i}`
                        : `\\mathbf q^{I\\prime}_{${layer},h,t}`
                    }
                    position={
                      mode === "full"
                        ? `t-1\\;(Q),\\quad (i-1)\\cdot ${compressionRatioForLayer(kvSource)}\\;(K)`
                        : "t-1"
                    }
                    layer={layer}
                    dimension={128}
                  />
                  <FlowStep>
                    {mode === "full"
                      ? "索引 Q / K 按 32 个元素一组 FP4 量化；K 写入源层缓存"
                      : "本层 Q 按 32 个元素一组 FP4 量化；K 读取源层缓存"}
                  </FlowStep>
                  <RowMatrix
                    tex={`K_{${kvSource}}^{I\\prime}`}
                    shape="M\times128"
                    rows={[
                      "\\mathbf k_1",
                      "\\mathbf k_2",
                      "\\vdots",
                      "\\mathbf k_M",
                    ]}
                    rowLength="128"
                    elementTex={(r, d) =>
                      `k^I_{${["1", "2", "", "M"][r]},${d}}`
                    }
                  />
                </div>
              </div>
              <IndexScoreProcess layer={layer} kvSource={kvSource}>
                <IndexSelection indexSource={indexSource} kvSource={kvSource} />
              </IndexScoreProcess>
            </>
          ) : (
            <div data-index-reuse style={{ display: "grid", gap: 7 }}>
              <strong>
                读取 Layer {indexSource} 已选好的行号 · 与源层共用索引结果
              </strong>
              {(phase === "prefill"
                ? ["1", "2", "\\vdots", "t", "\\vdots", "N"]
                : ["t"]
              ).map((s, i) =>
                s === "\\vdots" ? (
                  <Operator key={i} tex={s} />
                ) : (
                  <VectorStrip
                    key={i}
                    name={`I_{${indexSource},${s}}`}
                    contentWidth
                    length={`K_{${indexSource},${s}}`}
                    elementTex={(j) => `i_{${indexSource},${s},${j}}`}
                    tone="amber"
                  />
                ),
              )}
              <FlowStep>同一组行号送往下方全局 KV 取行</FlowStep>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (kind === "global-select") {
    const kvSource = globalKvSourceLayer(layer)!;
    const indexSource = globalIndexSourceLayer(layer)!;
    return (
      <div style={{ ...panel, borderColor: frameColor(COLORS.green) }}>
        <Handle
          id="matrix"
          type="target"
          position={Position.Top}
          style={{ ...handle, left: "30%" }}
        />
        <Handle
          id="indices"
          type="target"
          position={Position.Top}
          style={{ ...handle, left: "70%", background: COLORS.amber }}
        />
        <Handle
          id="selected"
          type="source"
          position={Position.Bottom}
          style={handle}
        />
        <Title>
          把 <MathFormula tex={`I_{${indexSource},t}`} /> 中的{" "}
          <MathFormula tex={`K_{${indexSource},t}\\le512`} /> 个行号，在{" "}
          <MathFormula tex={`G_{${kvSource}}\\in\\mathbb{R}^{M\\times512}`} />{" "}
          中逐行高亮
        </Title>
        <div
          style={{
            padding: 10,
            display: "grid",
            gridTemplateColumns: "1.55fr 34px .8fr",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
          }}
        >
          <SelectedGlobalRows kvSource={kvSource} indexSource={indexSource} />
          <Arrow />
          <div style={{ minWidth: 0, display: "grid", gap: 9 }}>
            <Box tone="green">
              <MathFormula tex={`G_{${kvSource},t}^{\\mathrm{selected}}`} />
              <span style={{ display: "block", fontSize: 10 }}>
                <MathFormula tex={`K_{${indexSource},t}\\times512`} />
              </span>
            </Box>
            {/* [OM-FREEPLAY] 3、7、12 是说明索引与行向量对应关系的示例行号。 */}
            <div
              data-selection-example
              style={{
                display: "grid",
                gap: 5,
                fontSize: 10,
                color: COLORS.green,
              }}
            >
              <strong>例：选中行号 3、7、12</strong>
              {[3, 7, 12].map((row) => (
                <VectorStrip
                  key={row}
                  name={`\\mathbf g_{${kvSource},${row}}`}
                  length="512"
                  nameWidth={42}
                  elementTex={(column) => `g_{${kvSource},${row},${column}}`}
                  tone="green"
                  selected
                  compact
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "kv-merge") {
    const kvSource = globalKvSourceLayer(layer);
    const indexSource = globalIndexSourceLayer(layer);
    const hasGlobal = kvSource !== null && indexSource !== null;
    if (!hasGlobal)
      return (
        <div
          data-swa-only-kv
          style={{ ...panel, borderColor: frameColor(COLORS.green) }}
        >
          <Handle
            id="local"
            type="target"
            position={Position.Top}
            style={handle}
          />
          <Handle
            id="kv"
            type="source"
            position={Position.Bottom}
            style={handle}
          />
          <Title>SWA-only · 窗口 KV</Title>
          <div style={{ padding: 8 }}>
            <RowMatrix
              tex={`\\mathrm{KV}_{${layer},t}=U_{${layer},t}^{\\mathrm{SWA}}`}
              shape="\min(128,t)\times512"
              rows={[
                `\\mathbf u_{${layer},r}`,
                `\\mathbf u_{${layer},r+1}`,
                "\\vdots",
                `\\mathbf u_{${layer},t}`,
              ]}
              rowLength="512"
              elementTex={(row, column) =>
                `u_{${layer},${["r", "r+1", "", "t"][row]},${column}}`
              }
            />
          </div>
        </div>
      );
    return (
      <div style={{ ...panel, borderColor: frameColor(COLORS.green) }}>
        <Handle
          id="local"
          type="target"
          position={Position.Top}
          style={{ ...handle, left: "30%" }}
        />
        <Handle
          id="global"
          type="target"
          position={Position.Top}
          style={{ ...handle, left: "70%" }}
        />
        <Handle
          id="kv"
          type="source"
          position={Position.Bottom}
          style={handle}
        />
        <Title>沿 KV 行维拼接：本地窗口 + 选中的全局行</Title>
        <div
          style={{
            padding: 10,
            display: "grid",
            gridTemplateColumns: "1fr 30px 1fr 30px 1.3fr",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
          }}
        >
          <Box tone="green">
            <TensorHeading
              name={`U_{${layer},t}^{\\mathrm{SWA}}`}
              shape="\min(128,t)\times512"
            />
          </Box>
          <Arrow />
          <Box tone="green">
            <TensorHeading
              name={`G_{${kvSource},t}^{\\mathrm{selected}}`}
              shape={`K_{${indexSource},t}\\times512`}
            />
          </Box>
          <Arrow />
          <Box tone="green">
            <TensorHeading
              name={`\\mathrm{KV}_{${layer},t}`}
              shape={`(\\min(128,t)+K_{${indexSource},t})\\times512`}
            />
          </Box>
          <div
            style={{ gridColumn: "1 / -1", textAlign: "right", fontSize: 12 }}
          >
            <MathFormula
              tex={`\\mathrm{KV}_{${layer},t}=[U_{${layer},t}^{\\mathrm{SWA}};G_{${kvSource},t}^{\\mathrm{selected}}]`}
            />
          </div>
        </div>
      </div>
    );
  }

  if (kind === "heads") {
    return (
      <div style={{ ...panel, height: "auto" }}>
        <Handle
          id="kv"
          type="target"
          position={Position.Top}
          style={{ ...handle, left: "70%" }}
        />
        <Handle
          id="main-out"
          type="source"
          position={Position.Bottom}
          style={handle}
        />
        <Title>
          Layer {layer} · 64 Heads · 第 t 行 Q → 位置旋转 → QK 打分 → softmax →
          V 加权 → 逆旋转 → O
        </Title>
        <div
          style={{
            padding: 12,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 40px 1fr",
            gap: 12,
          }}
        >
          <Head index={1} layer={layer} />
          <Head index={2} layer={layer} />
          <div
            style={{
              display: "grid",
              placeItems: "center",
              color: COLORS.faint,
              fontSize: 26,
            }}
          >
            ⋯
          </div>
          <Head index={64} layer={layer} />
        </div>
      </div>
    );
  }

  if (kind === "concat") {
    return (
      <div
        data-output-projection
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 230px",
          gap: 20,
          alignItems: "center",
        }}
      >
        <div style={{ ...panel, position: "relative", height: "auto" }}>
          {both}
          <Title>
            Layer {layer} · 输出投影：64 Heads → 8 组低秩投影 → 5120 维
          </Title>
          <div
            data-output-projection-weight
            style={{ padding: 12, display: "grid", gap: 10 }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 30px 1fr",
                gap: 9,
              }}
            >
              {[1, 2, 8].map((group, index) => (
                <React.Fragment key={group}>
                  {index === 2 && <Operator tex="\cdots" />}
                  <div
                    data-output-group={group}
                    style={{ minWidth: 0, display: "grid", gap: 6 }}
                  >
                    <strong style={{ fontSize: 12, color: COLORS.green }}>
                      组 {group} · Head {(group - 1) * 8 + 1}–{group * 8}{" "}
                      沿列拼接
                    </strong>
                    <AttentionTensor
                      tex={`C_{${group}}`}
                      rows={count}
                      columns="4096"
                      scalar={(row, column) =>
                        `c^{(${group})}_{${row},${column}}`
                      }
                    />
                    <Operator tex="\times" />
                    <AttentionTensor
                      tex={`W^{O\\!,\\mathrm{A}}_{${layer},${group}}`}
                      rows="4096"
                      columns="1024"
                      scalar={(row, column) => `w^A_{${row},${column}}`}
                      tone="blue"
                    />
                    <Operator tex="=" />
                    <AttentionTensor
                      tex={`B_{${group}}`}
                      rows={count}
                      columns="1024"
                      scalar={(row, column) =>
                        `b^{(${group})}_{${row},${column}}`
                      }
                    />
                  </div>
                </React.Fragment>
              ))}
            </div>
            <FlowStep>8 组沿列拼接 → 8192 维 → 最终线性投影</FlowStep>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 26px 1fr 26px 1fr",
                gap: 8,
                alignItems: "center",
              }}
            >
              <AttentionTensor
                tex="B=[B_1\mid B_2\mid\cdots\mid B_8]"
                rows={count}
                columns="8192"
                scalar={(row, column) => `b_{${row},${column}}`}
              />
              <Operator tex="\times" />
              <AttentionTensor
                tex={`W^{O\\!,\\mathrm{B}}_{${layer}}`}
                rows="8192"
                columns="5120"
                scalar={(row, column) => `w^B_{${row},${column}}`}
                tone="blue"
              />
              <Operator tex="=" />
              <AttentionTensor
                tex={`O_{${layer}}`}
                rows={count}
                columns="5120"
                scalar={(row, column) => `o_{${row},${column}}`}
              />
            </div>
          </div>
        </div>
        <aside
          data-projection-formulas
          style={{
            display: "grid",
            gap: 20,
            color: COLORS.green,
            fontSize: 16,
          }}
        >
          <strong>两级输出投影 · 可学习参数</strong>
          <div
            data-projection-parameter-origin
            style={{ fontSize: 13, lineHeight: 1.7 }}
          >
            W 表示权重，O 表示 Attention 输出投影；A、B 分别标识第一、第二级。
            <br />
            参数在训练中学习，推理时从模型权重加载。
            <br />
            A：每组 4096 → 1024；B：拼接后 8192 → 5120。
            <br />
            官方实现：wo_a、wo_b；图采用行向量右乘，矩阵方向与代码存储转置。
          </div>
          <strong>对应公式</strong>
          {[1, 2, 8].map((group) => (
            <MathFormula
              key={group}
              tex={`B_{${group}}=C_{${group}}W^{O\\!,\\mathrm{A}}_{${layer},${group}}`}
            />
          ))}
          <MathFormula tex={`O_{${layer}}=BW^{O\\!,\\mathrm{B}}_{${layer}}`} />
        </aside>
      </div>
    );
  }

  if (kind === "add1" || kind === "add2") {
    return (
      <div style={{ ...panel, height: "auto", padding: 12 }}>
        <Handle
          id="main-out"
          type="source"
          position={Position.Bottom}
          style={handle}
        />
        <MhcPost
          layer={layer}
          sublayer={kind === "add1" ? "A" : "F"}
          connected
        />
      </div>
    );
  }

  if (kind === "state1") {
    return (
      <div style={{ ...panel, height: "auto", padding: 12 }}>
        <Handle
          id="main-in"
          type="target"
          position={Position.Top}
          style={handle}
        />
        <Handle
          id="main"
          type="source"
          position={Position.Bottom}
          style={handle}
        />
        <Handle
          id="residual"
          type="source"
          position={Position.Left}
          style={{ ...handle, background: COLORS.amber }}
        />
        <Handle
          id="coefficients"
          type="source"
          position={Position.Right}
          style={handle}
        />
        <StreamTensor layer={layer} stage="A" count={count} />
      </div>
    );
  }

  if (kind === "moe-input") {
    return (
      <div
        style={{
          ...panel,
          display: "grid",
          placeItems: "center",
          borderColor: frameColor(COLORS.blue),
          background: COLORS.blueSoft,
          fontSize: 20,
          fontWeight: 800,
        }}
      >
        <Handle
          id="main-in"
          type="target"
          position={Position.Top}
          style={handle}
        />
        <Handle
          id="router"
          type="source"
          position={Position.Bottom}
          style={handle}
        />
        <Handle
          id="shared"
          type="source"
          position={Position.Left}
          style={{ ...handle, background: COLORS.blue }}
        />
        <MathFormula tex={`Y_{${layer}}`} />
      </div>
    );
  }

  if (kind === "router") {
    return (
      <div style={{ ...panel, height: "auto" }}>
        <Handle
          id="main-in"
          type="target"
          position={Position.Top}
          style={handle}
        />
        <Handle
          id="main-out"
          type="source"
          position={Position.Bottom}
          style={{ ...handle, background: COLORS.amber }}
        />
        <Title>Layer {layer} Router · 只选择 routed experts</Title>
        <div
          style={{
            padding: 10,
            display: "grid",
            gridTemplateColumns: "1.2fr 26px 1.4fr 26px .8fr",
            alignItems: "center",
            gap: 7,
          }}
        >
          <RowMatrix
            tex={`Y_{${layer}}`}
            shape={`${count}\\times5120`}
            rows={(phase === "prefill"
              ? ["1", "2", "\\vdots", "N"]
              : tokenRows
            ).map((s) => (s === "\\vdots" ? s : `\\mathbf y_{${layer},${s}}`))}
            tone="blue"
            rowLength="5120"
            elementTex={(row, column) =>
              `y_{${layer},${(phase === "prefill" ? ["1", "2", "", "N"] : tokenRows)[row]},${column}}`
            }
          />
          <Operator tex="\times" />
          <div
            data-expanded-tensor
            style={{
              minWidth: 0,
              border: `1.3px solid ${frameColor(COLORS.amber)}`,
              background: "transparent",
              borderRadius: 7,
              padding: 7,
              display: "grid",
              gap: 6,
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 6,
              }}
            >
              <MathFormula tex={`W_{${layer}}^R`} />
              <span style={{ fontSize: 10 }}>
                <MathFormula tex="5120\times384" />
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr .45fr 1fr",
                gap: 5,
                fontSize: 10,
                alignItems: "center",
              }}
            >
              {["1", "2", "\\cdots", "384"].map((expert) =>
                expert === "\\cdots" ? (
                  <MathFormula key={expert} tex={expert} />
                ) : (
                  <div
                    key={expert}
                    style={{
                      border: `1px solid ${frameColor(COLORS.amber)}`,
                      borderRadius: 4,
                      background: COLORS.amberSoft,
                      padding: "22px 2px",
                    }}
                  >
                    <MathFormula tex={`\\mathbf w_{${layer},${expert}}^R`} />
                  </div>
                ),
              )}
            </div>
          </div>
          <Operator tex="=" />
          <div
            style={{
              position: "relative",
              minWidth: 0,
              minHeight: 64,
              display: "grid",
              placeItems: "center",
              padding: "18px 7px 7px",
              border: `1.3px solid ${frameColor(COLORS.green)}`,
              borderRadius: 7,
              background: COLORS.greenSoft,
            }}
          >
            <span
              style={{ position: "absolute", top: 5, right: 6, fontSize: 9 }}
            >
              <MathFormula tex={`${count}\\times384`} />
            </span>
            <MathFormula tex={`S_{${layer}}`} />
          </div>
        </div>
      </div>
    );
  }

  if (kind === "scores") {
    const scoreRows = ["", ...tokenRows];
    const rowTracks = scoreRows
      .map((row) => (row === "\\vdots" ? "16px" : row === "" ? "22px" : "30px"))
      .join(" ");
    const scoreCell = (column: number, row: string) => {
      const expert =
        row === "t"
          ? ROUTED_EXPERTS.find((item) => item.id === column)
          : undefined;
      const columnIndex = ROUTER_SCORE_COLUMNS.indexOf(
        column as (typeof ROUTER_SCORE_COLUMNS)[number],
      );
      // [OM-FREEPLAY] 未选分数沿用原矩阵示意，均低于第六名 .64。
      const dimScore = [".12", ".23", ".35", ".18"][columnIndex % 4];
      return (
        <div
          data-topk-selected={Boolean(expert)}
          data-expert-column={column}
          data-token-row={row}
          style={{
            minWidth: 0,
            width: "100%",
            boxSizing: "border-box",
            padding: "5px 2px",
            border: `1px solid ${frameColor(expert ? COLORS.amber : COLORS.blue)}`,
            borderRadius: 4,
            background: expert ? COLORS.amberSoft : COLORS.blueSoft,
            color: expert ? COLORS.amber : COLORS.muted,
            opacity: expert ? 1 : 0.4,
            fontWeight: expert ? 800 : 400,
          }}
        >
          <MathFormula
            tex={
              row === "t"
                ? (expert?.score ?? dimScore)
                : `s_{${layer},${row},${column}}`
            }
          />
        </div>
      );
    };
    return (
      <div
        style={{
          ...panel,
          height: "auto",
          borderColor: frameColor(COLORS.amber),
        }}
      >
        <Handle
          id="main-in"
          type="target"
          position={Position.Top}
          style={{ ...handle, background: COLORS.amber }}
        />
        <Title>
          Router 得分矩阵 · 第 <MathFormula tex="t" /> 行 Top-6 高亮 ·
          数值为示意
        </Title>
        <div
          data-router-score-matrix
          data-expanded-tensor
          style={{
            padding: 10,
            background: "transparent",
            display: "grid",
            gap: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
            }}
          >
            <MathFormula tex={`S_{${layer}}`} />
            <MathFormula tex={`${count}\\times384`} />
          </div>
          <div
            data-router-score-grid
            style={{
              display: "grid",
              gridTemplateColumns: `28px ${ROUTER_SCORE_TRACKS.map((width) => `minmax(0,${width}fr)`).join(" ")}`,
              gap: ROUTER_SCORE_GAP,
              textAlign: "center",
              fontSize: 12,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateRows: rowTracks,
                gap: 4,
                alignItems: "center",
              }}
            >
              {scoreRows.map((row, index) => (
                <MathFormula key={index} tex={row} />
              ))}
            </div>
            {ROUTER_SCORE_COLUMNS.map((column, columnIndex) => {
              const connected = VISIBLE_ROUTED_EXPERTS.some(
                (expert) => expert.id === column,
              );
              return (
                <div
                  key={columnIndex}
                  data-router-score-column={column ?? "ellipsis"}
                  style={{
                    position: "relative",
                    minWidth: 0,
                    display: "grid",
                    gridTemplateRows: rowTracks,
                    gridTemplateColumns: connected
                      ? "minmax(0,1fr) 28px"
                      : "minmax(0,1fr)",
                    rowGap: 4,
                    alignItems: "center",
                  }}
                >
                  {scoreRows.map((row, index) => (
                    <div
                      key={index}
                      style={{ minWidth: 0, gridColumn: 1, gridRow: index + 1 }}
                    >
                      {row === "\\vdots" ? (
                        <MathFormula tex="\vdots" />
                      ) : column === null ? (
                        <MathFormula tex="\cdots" />
                      ) : row ? (
                        scoreCell(column, row)
                      ) : (
                        column
                      )}
                    </div>
                  ))}
                  {connected && (
                    <div
                      data-router-score-exit={column}
                      style={{
                        gridColumn: 2,
                        gridRow: `${scoreRows.indexOf("t") + 1} / ${scoreRows.length + 1}`,
                        position: "relative",
                        alignSelf: "stretch",
                        marginTop: 15,
                        marginRight: 5,
                        marginBottom: 5,
                      }}
                    >
                      <svg
                        aria-hidden
                        viewBox="0 0 24 100"
                        preserveAspectRatio="none"
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          overflow: "visible",
                        }}
                      >
                        <path
                          vectorEffect="non-scaling-stroke"
                          d="M0 0 H24 V100"
                          fill="none"
                          stroke={COLORS.amber}
                          strokeWidth="1.5"
                        />
                      </svg>
                      <Handle
                        id={`score-${column}`}
                        type="source"
                        position={Position.Bottom}
                        style={{
                          ...handle,
                          left: "100%",
                          bottom: 0,
                          background: COLORS.amber,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (kind === "experts") {
    return (
      <div style={{ ...panel, height: "auto" }}>
        {VISIBLE_ROUTED_EXPERTS.map((expert, index) => (
          <Handle
            key={expert.id}
            id={`expert-${expert.id}`}
            type="target"
            position={Position.Top}
            style={{
              ...handle,
              left: `${ROUTED_HANDLE_LEFT[index]}%`,
              background: COLORS.amber,
            }}
          />
        ))}
        <Handle
          id="shared"
          type="target"
          position={Position.Left}
          style={{ ...handle, top: "50%", background: COLORS.blue }}
        />
        <Handle
          id="shared-out"
          type="source"
          position={Position.Bottom}
          style={{
            ...handle,
            left: `${SHARED_HANDLE_LEFT}%`,
            background: COLORS.blue,
          }}
        />
        {VISIBLE_ROUTED_EXPERTS.map((expert, index) => (
          <Handle
            key={expert.id}
            id={`expert-out-${expert.id}`}
            type="source"
            position={Position.Bottom}
            style={{
              ...handle,
              left: `${ROUTED_HANDLE_LEFT[index]}%`,
              background: COLORS.amber,
            }}
          />
        ))}
        <Title>Layer {layer} · 专家层 · 得分为示意</Title>
        <div
          style={{
            padding: EXPERTS_PADDING,
            display: "grid",
            gridTemplateColumns: `${SHARED_GROUP_WIDTH}px minmax(0,1fr)`,
            gap: EXPERT_GROUP_GAP,
            alignItems: "start",
          }}
        >
          <section
            data-expert-group="shared"
            style={{ minWidth: 0, display: "grid", gap: 10 }}
          >
            <strong style={{ color: COLORS.blue, fontSize: 14 }}>
              共享专家 · 直接接收 <MathFormula tex={`Y_{${layer}}`} />
            </strong>
            <Expert layer={layer} shared />
          </section>
          <section
            data-expert-group="routed"
            style={{
              minWidth: 0,
              padding: EXPERT_GROUP_INSET - 1,
              border: `1px solid ${frameColor(COLORS.amber)}`,
              borderRadius: 10,
              display: "grid",
              gap: 10,
            }}
          >
            <strong style={{ color: COLORS.amber, fontSize: 14 }}>
              非共享专家 · Router Top-6
            </strong>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: EXPERT_GRID_COLUMNS,
                gap: EXPERT_CARD_GAP,
              }}
            >
              {VISIBLE_ROUTED_EXPERTS.map((expert, index) => (
                <React.Fragment key={expert.id}>
                  {index === 2 && (
                    <div
                      data-expert-ellipsis
                      style={{
                        display: "grid",
                        placeItems: "center",
                        fontSize: 28,
                      }}
                    >
                      <MathFormula tex={"\\cdots"} />
                    </div>
                  )}
                  <Expert
                    layer={layer}
                    index={expert.id}
                    score={expert.score}
                  />
                </React.Fragment>
              ))}
            </div>
            <div
              style={{
                borderTop: `1px solid ${COLORS.line}`,
                paddingTop: 8,
                display: "grid",
                gridTemplateColumns:
                  "260px repeat(3,minmax(0,1fr)) 50px minmax(0,1fr)",
                gap: 10,
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 12, color: COLORS.muted }}>
                其余 378 个专家
                <br />
                分数较低 · 本次跳过
              </span>
              {/* [OM-FREEPLAY] 未选专家沿用得分矩阵中的示意值，均低于本次第六名 .64。 */}
              {[
                { id: 1, score: ".12" },
                { id: 2, score: ".23" },
                { id: 3, score: ".35" },
                { id: 384, score: ".12" },
              ].map((expert, index) => (
                <React.Fragment key={expert.id}>
                  {index === 3 && (
                    <span style={{ textAlign: "center", color: COLORS.faint }}>
                      ⋯
                    </span>
                  )}
                  <div
                    data-inactive-expert={expert.id}
                    aria-label={`Expert ${expert.id} 未选中，本次跳过`}
                    style={{
                      opacity: 0.45,
                      border: `1px solid ${COLORS.muted}`,
                      background: COLORS.blueSoft,
                      borderRadius: 7,
                      padding: "8px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      fontSize: 12,
                    }}
                  >
                    <span>Expert {expert.id}</span>
                    <MathFormula
                      tex={`s_{${layer},${expert.id}}=${expert.score}`}
                    />
                  </div>
                </React.Fragment>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (
    kind === "expert-output" ||
    kind === "expert-weight" ||
    kind === "expert-scale" ||
    kind === "expert-weighted"
  ) {
    const expert =
      data.expertId === undefined ? "\\mathrm{shared}" : String(data.expertId);
    const shared = data.expertId === undefined;
    const color = shared ? COLORS.blue : COLORS.amber;
    if (kind === "expert-weight")
      return (
        <div
          data-expert-weight={expert}
          style={{
            ...panel,
            borderColor: frameColor(color),
            display: "grid",
            placeContent: "center",
            gap: 4,
            textAlign: "center",
            fontSize: 14,
          }}
        >
          <Handle
            id="weight-out"
            type="source"
            position={Position.Right}
            style={{ ...handle, background: color }}
          />
          <span style={{ fontSize: 11 }}>
            {shared ? "共享权重" : "Router · 第 t 行权重"}
          </span>
          <MathFormula tex={shared ? "1" : `g_{${layer},${expert},t}`} />
        </div>
      );
    if (kind === "expert-scale")
      return (
        <div
          data-expert-scale={expert}
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            border: `2px solid ${frameColor(color)}`,
            boxSizing: "border-box",
            display: "grid",
            placeItems: "center",
            background: COLORS.card,
          }}
        >
          <Handle
            id="main-in"
            type="target"
            position={Position.Top}
            style={handle}
          />
          <Handle
            id="weight-in"
            type="target"
            position={Position.Left}
            style={{ ...handle, background: color }}
          />
          <Handle
            id="main-out"
            type="source"
            position={Position.Bottom}
            style={handle}
          />
          <Operator tex="\times" />
        </div>
      );
    if (kind === "expert-weighted")
      return (
        <div
          data-expert-weighted={expert}
          style={{ ...panel, height: "auto", borderColor: frameColor(color) }}
        >
          {both}
          <Title>
            <MathFormula
              tex={`\\mathbf r_{${layer},${expert},t}=${shared ? "1" : `g_{${layer},${expert},t}`}\\,\\mathbf e_{${layer},${expert},t}`}
            />
            <span style={{ float: "right", fontSize: 11 }}>
              <MathFormula tex="1\times5120" />
            </span>
          </Title>
          <div style={{ padding: 8 }}>
            <VectorStrip
              name={`\\mathbf r_{${layer},${expert},t}`}
              nameWidth={110}
              length="5120"
              elementTex={(column) => `r_{${layer},${expert},t,${column}}`}
              tone={shared ? "blue" : "amber"}
              compact
            />
          </div>
        </div>
      );
    const rows = tokenRows;
    return (
      <div
        data-expert-output={expert}
        style={{ ...panel, height: "auto", borderColor: frameColor(color) }}
      >
        {both}
        <Title>
          {shared ? "共享专家输出" : `Expert ${expert} 输出`} ·{" "}
          <MathFormula tex={`E_{${layer},${expert}}(Y_{${layer}})`} />
          <span style={{ float: "right", fontSize: 11 }}>
            <MathFormula tex={`${count}\\times5120`} />
          </span>
        </Title>
        <div style={{ padding: 9, display: "grid", gap: 5 }}>
          {rows.map((row, index) =>
            row === "\\vdots" ? (
              <div key={index} style={{ textAlign: "center" }}>
                <MathFormula tex={row} />
              </div>
            ) : (
              <VectorStrip
                key={index}
                name={`\\mathbf e_{${layer},${expert},${row}}`}
                nameWidth={110}
                length="5120"
                elementTex={(column) =>
                  `e_{${layer},${expert},${row},${column}}`
                }
                tone={shared ? "blue" : "green"}
                selected={row === "t"}
                compact
              />
            ),
          )}
        </div>
      </div>
    );
  }

  if (kind === "moe-sum") {
    return (
      <div
        data-moe-weighted-sum
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 24,
          border: `3px solid ${frameColor(COLORS.green)}`,
          boxSizing: "border-box",
          background: COLORS.greenSoft,
          display: "grid",
          placeContent: "center",
          textAlign: "center",
          gap: 3,
          color: COLORS.green,
        }}
      >
        {EXPERT_OUTPUT_BRANCHES.map((branch, index) => (
          <Handle
            key={branch.key}
            id={`term-${branch.key}`}
            type="target"
            position={Position.Top}
            style={{ ...handle, left: `${(index + 1) * 20}%` }}
          />
        ))}
        <Handle
          id="main-out"
          type="source"
          position={Position.Bottom}
          style={handle}
        />
        <span style={{ fontSize: 23 }}>
          <MathFormula tex="\sum" />
        </span>
        <strong style={{ fontSize: 12 }}>逐元素相加 · 1 路共享 + Top-6</strong>
      </div>
    );
  }

  if (kind === "moe-output") {
    return (
      <div
        style={{
          ...panel,
          display: "grid",
          placeContent: "center",
          textAlign: "center",
          gap: 7,
          borderColor: frameColor(COLORS.green),
          background: COLORS.greenSoft,
          fontSize: 14,
        }}
      >
        <Handle
          id="main-in"
          type="target"
          position={Position.Top}
          style={handle}
        />
        <Handle
          id="main-out"
          type="source"
          position={Position.Bottom}
          style={handle}
        />
        <MathFormula
          tex={`\\mathbf o_{${layer},t}^{\\mathrm{FFN}}=\\mathbf r_{${layer},\\mathrm{shared},t}+\\sum_{i\\in I_{${layer},t}}\\mathbf r_{${layer},i,t}`}
        />
        <span style={{ fontSize: 11 }}>
          {phase === "prefill"
            ? "各 token 的结果按行组成 "
            : "当前一步的输出矩阵 "}{" "}
          <MathFormula
            tex={`O_{${layer}}^{\\mathrm{FFN}}\\in\\mathbb R^{${count}\\times5120}`}
          />
        </span>
      </div>
    );
  }

  return (
    <div style={panel}>
      {both}
      <Title>
        <MathFormula tex={`H_{${layer}}^{\\mathrm{out}}`} />
      </Title>
    </div>
  );
}

const MemoDiagramNodeContent = memo(DiagramNodeContent);

type MeasuredDiagramGeometry = {
  width: number;
  height: number;
  handles: NonNullable<DiagramNode["handles"]>;
};
type DiagramGeometryCache = Map<string, MeasuredDiagramGeometry>;
const GeometryCacheContext = createContext<DiagramGeometryCache | null>(null);
const geometryKey = (
  data: DiagramData,
  width: number,
  height: CSSProperties["height"],
) => JSON.stringify([data, width, height]);

// 实测几何只能归属于产生它的图版本；层号相同但 Prefill/Decode 不同也不是同一张图。
// 在布局入口拒绝混合版本，不能把旧图高度记到新图基线后再靠反向位移补救。
export function measurementsForGraph(
  graph: { nodes: DiagramNode[] },
  measuredNodes: DiagramNode[],
) {
  const expected = new Map(graph.nodes.map((node) => [node.id, node.data]));
  if (
    measuredNodes.length !== expected.size ||
    measuredNodes.some((node) => {
      const data = expected.get(node.id);
      return (
        !data ||
        data.kind !== node.data.kind ||
        data.layer !== node.data.layer ||
        data.phase !== node.data.phase
      );
    })
  )
    return null;
  return new Map(
    measuredNodes
      .filter(
        (node) =>
          CONTENT_SIZED_KINDS.has(node.data.kind) && node.measured?.height,
      )
      .map((node) => [node.id, node.measured!.height!]),
  );
}

export function restoreMeasuredGeometry(
  graph: { nodes: DiagramNode[]; edges: EditableEdge[] },
  cache: DiagramGeometryCache,
) {
  let complete = true;
  const nodes = graph.nodes.map((node) => {
    const cached = cache.get(
      geometryKey(
        node.data,
        Number(node.style?.width),
        node.style?.height ?? node.style?.minHeight,
      ),
    );
    // 精确匹配内容和宽度；人工改高度、字体换行或未知内容继续走完整实测。
    const requestedHeight =
      storedDimension(node.style?.height) ??
      storedDimension(node.style?.minHeight);
    if (
      !cached ||
      (requestedHeight &&
        (CONTENT_SIZED_KINDS.has(node.data.kind)
          ? requestedHeight > cached.height
          : requestedHeight !== cached.height))
    ) {
      complete = false;
      return node;
    }
    return {
      ...node,
      measured: { width: cached.width, height: cached.height },
      handles: cached.handles,
    };
  });
  // 初次适配视口必须基于完整图，不能只把缓存命中的局部节点当成全部边界。
  return complete ? { ...graph, nodes } : graph;
}

export function buildMeasuredGraph(
  layer: number,
  phase: ExecutionPhase,
  cache: DiagramGeometryCache,
) {
  const graph = buildGraph(layer, new Map(), phase);
  // 先读取内容节点的自然高度，再计算依赖它们的父框和坐标。
  // 不能先要求整图缓存命中：Query 父框的 key 本身就依赖尚未恢复的 RMSNorm 高度。
  const heights = new Map<string, number>();
  for (const node of graph.nodes) {
    if (!CONTENT_SIZED_KINDS.has(node.data.kind)) continue;
    const measured = cache.get(
      geometryKey(
        node.data,
        Number(node.style?.width),
        node.style?.height ?? node.style?.minHeight,
      ),
    );
    if (measured) heights.set(node.id, measured.height);
  }
  return restoreMeasuredGeometry(buildGraph(layer, heights, phase), cache);
}

// [OM-FREEPLAY] 屏幕外预留 240px 提前恢复详情；只卸载已实测内容，节点、端口和编辑数据保留。
const DETAIL_OVERSCAN = 240;
type CanvasClip = { left: number; top: number; right: number; bottom: number };
const CanvasClipContext = createContext<CanvasClip | undefined>(undefined);
export function isArchitectureDetailVisible(
  rect: { x: number; y: number; width: number; height: number },
  viewport: {
    x: number;
    y: number;
    zoom: number;
    width: number;
    height: number;
    clip?: CanvasClip;
  },
  overscan = DETAIL_OVERSCAN,
) {
  const clip = viewport.clip ?? {
    left: 0,
    top: 0,
    right: viewport.width,
    bottom: viewport.height,
  };
  return (
    rect.x * viewport.zoom + viewport.x <= clip.right + overscan &&
    (rect.x + rect.width) * viewport.zoom + viewport.x >=
      clip.left - overscan &&
    rect.y * viewport.zoom + viewport.y <= clip.bottom + overscan &&
    (rect.y + rect.height) * viewport.zoom + viewport.y >= clip.top - overscan
  );
}

function DiagramNodeView({ id, data, selected }: NodeProps<DiagramNode>) {
  const clip = useContext(CanvasClipContext);
  const geometryCache = useContext(GeometryCacheContext);
  const { getInternalNode } = useReactFlow<DiagramNode>();
  const handleBounds = useStore(
    (state) => state.nodeLookup.get(id)?.internals.handleBounds,
  );
  const detailVisibility = useStore((state) => {
    const node = state.nodeLookup.get(id);
    // 首次必须完整测量，不用猜测高度替代真实布局；选择中的节点也保持交互内容。
    if (
      selected ||
      !node?.measured.width ||
      !node.measured.height ||
      !node.internals.handleBounds
    )
      return 2;
    if (!state.width || !state.height) return 0;
    const rect = {
      ...node.internals.positionAbsolute,
      width: node.measured.width,
      height: node.measured.height,
    };
    const viewport = {
      x: state.transform[0],
      y: state.transform[1],
      zoom: state.transform[2],
      width: state.width,
      height: state.height,
      clip,
    };
    return isArchitectureDetailVisible(rect, viewport, 0)
      ? 2
      : isArchitectureDetailVisible(rect, viewport)
        ? 1
        : 0;
  });
  // 预加载区仍在屏幕外，交给可中断渲染；已经可见或正在编辑的内容必须同步显示。
  const preparedDetails = useDeferredValue(detailVisibility > 0);
  const showDetails = detailVisibility === 2 || preparedDetails;
  const internal = getInternalNode(id);
  const measuredWidth = internal?.measured.width,
    measuredHeight = internal?.measured.height;
  const declaredWidth =
    storedDimension(internal?.width) ??
    storedDimension(internal?.style?.width) ??
    measuredWidth;
  const declaredHeight =
    internal?.height ?? internal?.style?.height ?? internal?.style?.minHeight;
  useEffect(() => {
    if (
      !geometryCache ||
      !declaredWidth ||
      !measuredWidth ||
      !measuredHeight ||
      !handleBounds
    )
      return;
    const key = geometryKey(data, declaredWidth, declaredHeight);
    geometryCache.delete(key);
    geometryCache.set(key, {
      width: measuredWidth,
      height: measuredHeight,
      handles: [
        ...(handleBounds.source ?? []),
        ...(handleBounds.target ?? []),
      ].map((port) => ({ ...port })),
    });
    // [OM-FREEPLAY] 最多保留 512 份实测几何，避免浏览多层或反复拉宽时缓存无限增长。
    if (geometryCache.size > 512)
      geometryCache.delete(geometryCache.keys().next().value!);
  }, [
    data,
    declaredWidth,
    declaredHeight,
    geometryCache,
    handleBounds,
    measuredWidth,
    measuredHeight,
  ]);
  if (!showDetails && internal?.measured.height)
    return (
      <div
        data-boundary-connectable={data.kind !== "structure-operator"}
        data-content-layer={data.layer}
        data-content-phase={data.phase}
        data-geometry-ready={Boolean(
          measuredWidth && measuredHeight && handleBounds,
        )}
        data-detail-suspended
        style={{
          width: "100%",
          height: internal.measured.height,
          position: "relative",
        }}
      >
        {/* 离屏端口只供几何测量，不订阅连接手势状态；回到屏幕时恢复真实 Handle。 */}
        {(["source", "target"] as const).flatMap((type) =>
          (internal.internals.handleBounds?.[type] ?? []).map((port) => (
            <div
              key={`${type}-${port.id}`}
              className={`react-flow__handle react-flow__handle-${port.position} ${type}`}
              data-nodeid={id}
              data-handleid={port.id ?? undefined}
              data-handlepos={port.position}
              style={{
                ...handle,
                position: "absolute",
                pointerEvents: "none",
                left: port.x + port.width / 2,
                top: port.y + port.height / 2,
                right: "auto",
                bottom: "auto",
                transform: "translate(-50%,-50%)",
              }}
            />
          )),
        )}
      </div>
    );
  const compact = data.kind === "moe-sum" || data.kind === "expert-scale";
  const portColor = tonePalette(data.tone ?? "green").color;
  // [OM-FREEPLAY] 求和器保留 320px 最小宽度，让四个入口之间有独立走线净空。
  const minimumWidth =
    data.kind === "moe-sum"
      ? 320
      : compact
        ? 60
        : data.kind === "structure-operator"
          ? 36
          : 100;
  const minimumHeight =
    data.kind === "moe-sum"
      ? 100
      : compact
        ? 60
        : data.matrixRows?.length
          ? 180
          : data.kind === "structure-group"
            ? 120
            : data.title
              ? 96
              : 40;
  return (
    <div
      data-boundary-connectable={data.kind !== "structure-operator"}
      data-content-layer={data.layer}
      data-content-phase={data.phase}
      data-geometry-ready={Boolean(
        measuredWidth && measuredHeight && handleBounds,
      )}
      data-frame-selected={Boolean(selected)}
      style={{
        width: "100%",
        height: CONTENT_SIZED_KINDS.has(data.kind) ? "auto" : "100%",
        ...(CONTENT_SIZED_KINDS.has(data.kind)
          ? {
              minHeight: "100%",
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr)",
            }
          : {}),
        position: "relative",
        borderRadius: compact ? "50%" : 12,
      }}
    >
      <EightResizeHandles minWidth={minimumWidth} minHeight={minimumHeight} />
      <EightConnectionPorts color={portColor} />
      <ExecutionContext.Provider value={data.phase ?? "prefill"}>
        <MemoDiagramNodeContent data={data} />
      </ExecutionContext.Provider>
    </div>
  );
}

const NodeView = memo(DiagramNodeView);
const nodeTypes = { diagram: NodeView };
const edgeTypes = { "editable-orthogonal": EditableOrthogonalEdge };

function node(
  id: string,
  kind: NodeKind,
  layer: number,
  mode: LayerMode,
  x: number,
  y: number,
  width: number,
  height: number,
): DiagramNode {
  // [OM-FREEPLAY] 展开的归一化保留 480px 最小宽度，保证三组元素与算例可读。
  return {
    id,
    type: "diagram",
    position: { x, y },
    data: { kind, layer, mode },
    style: {
      width,
      ...(CONTENT_SIZED_KINDS.has(kind)
        ? { minHeight: "max-content" }
        : { height }),
      ...(["norm1", "norm2", "query-norm"].includes(kind)
        ? { minWidth: 480 }
        : {}),
    },
    deletable: false,
  };
}

function structureNode({
  id,
  parentId,
  layer,
  mode,
  x,
  y,
  width,
  height,
  kind = "structure",
  ...data
}: {
  id: string;
  parentId?: string;
  layer: number;
  mode: LayerMode;
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: "structure" | "structure-group" | "structure-operator";
  title?: string;
  tex?: string;
  subtitle?: string;
  tone?: DiagramTone;
  matrixRows?: string[];
  matrixRowCells?: string[][];
  vectorCells?: string[];
  columnVectors?: boolean;
  matrixSelectedRow?: number;
}): DiagramNode {
  return {
    id,
    type: "diagram",
    parentId,
    extent: parentId ? "parent" : undefined,
    expandParent: Boolean(parentId),
    position: { x, y },
    data: { kind, layer, mode, ...data },
    style: { width, height },
    deletable: false,
  };
}

export function buildGraph(
  layer: number,
  contentHeights: ReadonlyMap<string, number> = new Map(),
  phase: ExecutionPhase = "prefill",
): { nodes: DiagramNode[]; edges: EditableEdge[] } {
  const mode = modeForLayer(layer);
  const { count, rows } = executionAxis(phase);
  const matrixRows = (prefix: string) =>
    (phase === "prefill" ? ["1", "2", "\\vdots", "N"] : rows).map((s) =>
      s === "\\vdots" ? s : `${prefix}_{${layer},${s}}`,
    );
  const hasGlobal = mode !== "swa";
  const mainGap = architectureFanoutGap(3);
  const tokenizerHeight = contentHeights.get("tokenizer") ?? 260;
  const embeddingY = tokenizerHeight + mainGap;
  const embeddingHeight = contentHeights.get("embedding") ?? 260;
  const expandY = embeddingY + embeddingHeight + mainGap;
  const firstInputY =
    expandY + (contentHeights.get("hc-expand") ?? 240) + mainGap;
  const tensorHeight =
    contentHeights.get("input") ?? (phase === "prefill" ? 440 : 240);
  const priorLayersY =
    firstInputY + (contentHeights.get("first-input") ?? tensorHeight) + mainGap;
  const inputY = layer === 1 ? firstInputY : priorLayersY + 120 + mainGap;
  const engramY =
    inputY +
    Math.max(tensorHeight, contentHeights.get("engram-lookup") ?? 1100) +
    mainGap;
  const preAY = hasEngram(layer)
    ? engramY + (contentHeights.get("engram-inject") ?? 2000) + mainGap
    : inputY + tensorHeight + mainGap;
  const mixAHeight = contentHeights.get("hc-mix-a") ?? 900;
  const mixFHeight = contentHeights.get("hc-mix-f") ?? 900;
  // 系数在独立的右侧支路生成，主路归一化不等待旁路卡片的显示高度。
  const norm1Y = preAY + (contentHeights.get("hc-pre-a") ?? 420) + mainGap;
  const norm1Height = contentHeights.get("norm1") ?? 644;
  const norm2Height = contentHeights.get("norm2") ?? 644;
  const queryNormHeight = contentHeights.get("q-rmsnorm") ?? 620;
  const projectionY = norm1Y + norm1Height + mainGap;
  const queryLayout = queryProjectionLayout(phase, queryNormHeight);
  const queryProjectionHeight = queryLayout.height;
  const queryRowY = projectionY + queryProjectionHeight + mainGap;
  const querySplitY = queryRowY + 160 + mainGap;
  const localKvProjectionHeight = contentHeights.get("kv") ?? 464;
  const swaHeight = 530;
  const compressorHeight =
    contentHeights.get("compressor") ??
    (mode === "full" && compressionRatioForLayer(layer) === 2 ? 720 : 450);
  const indexerHeight = contentHeights.get("indexer") ?? 450;
  const globalSelectHeight = 330;
  const sourceRowHeight = hasGlobal
    ? Math.max(queryProjectionHeight, localKvProjectionHeight, compressorHeight)
    : Math.max(queryProjectionHeight, localKvProjectionHeight);
  const swaY =
    Math.max(projectionY + sourceRowHeight, querySplitY + 150) + mainGap;
  const globalSelectY = swaY + indexerHeight + mainGap;
  const mergeY = hasGlobal
    ? Math.max(swaY + swaHeight, globalSelectY + globalSelectHeight) + mainGap
    : swaY + swaHeight + mainGap;
  const mergeHeight = hasGlobal ? 200 : 220;
  const headsY = mergeY + mergeHeight + mainGap;
  const headsHeight = contentHeights.get("heads") ?? 374;
  const concatY = headsY + headsHeight + mainGap;
  const concatHeight = contentHeights.get("concat") ?? 276;
  const add1Y = concatY + concatHeight + mainGap;
  const add1Height = contentHeights.get("add1") ?? 600;
  const add2Height = contentHeights.get("add2") ?? 600;
  const state1Height = contentHeights.get("state1") ?? tensorHeight;
  const state1Y = add1Y + add1Height + mainGap;
  const preFY = state1Y + state1Height + mainGap;
  const norm2Y = preFY + (contentHeights.get("hc-pre-f") ?? 420) + mainGap;
  const moeInputY = norm2Y + norm2Height + mainGap;
  const routerY = moeInputY + 80 + mainGap;
  const routerHeight =
    contentHeights.get("router") ?? (phase === "prefill" ? 240 : 180);
  const scoresY = routerY + routerHeight + mainGap;
  const scoresHeight =
    contentHeights.get("scores") ?? (phase === "prefill" ? 280 : 130);
  const expertsY = scoresY + scoresHeight + mainGap;
  const expertsHeight = contentHeights.get("experts") ?? 1300;
  const expertOutputY = expertsY + expertsHeight + mainGap;
  const expertOutputHeight = Math.max(
    ...EXPERT_OUTPUT_BRANCHES.map(
      (branch) => contentHeights.get(`expert-output-${branch.key}`) ?? 240,
    ),
  );
  const expertScaleY = expertOutputY + expertOutputHeight + mainGap;
  const weightedY = expertScaleY + 70 + mainGap;
  const weightedHeight = Math.max(
    ...EXPERT_OUTPUT_BRANCHES.map(
      (branch) => contentHeights.get(`expert-weighted-${branch.key}`) ?? 100,
    ),
  );
  const moeSumY =
    weightedY +
    weightedHeight +
    architectureFanoutGap(EXPERT_OUTPUT_BRANCHES.length);
  const moeOutputY = moeSumY + 100 + mainGap;
  const add2Y = moeOutputY + 100 + mainGap;
  const outputY = add2Y + add2Height + mainGap;
  const nodes: DiagramNode[] = [
    node("tokenizer", "tokenizer", layer, mode, 400, 0, 800, tokenizerHeight),
    node(
      "execution-guide",
      "execution-guide",
      layer,
      mode,
      1300,
      0,
      650,
      contentHeights.get("execution-guide") ?? 330,
    ),
    node(
      "embedding",
      "embedding",
      layer,
      mode,
      400,
      embeddingY,
      800,
      embeddingHeight,
    ),
    node("hc-expand", "hc-expand", layer, mode, 400, expandY, 800, 240),
    node("input", "tensor", layer, mode, 300, inputY, 1600, tensorHeight),
    {
      ...node("hc-pre-a", "hc-pre", layer, mode, 300, preAY, 1000, 420),
      data: { kind: "hc-pre", layer, mode, sublayer: "A" },
    },
    {
      ...node(
        "hc-mix-a",
        "hc-mix",
        layer,
        mode,
        HC_COEFFICIENT_X,
        preAY,
        2240,
        mixAHeight,
      ),
      data: { kind: "hc-mix", layer, mode, sublayer: "A" },
    },
    node("norm1", "norm1", layer, mode, 400, norm1Y, 800, norm1Height),
    {
      ...node(
        "q",
        "projection-q",
        layer,
        mode,
        20,
        projectionY,
        800,
        queryProjectionHeight,
      ),
      data: { kind: "projection-q", layer, mode, queryNormHeight },
    },
    node("q-row", "query-row", layer, mode, 20, queryRowY, 800, 160),
    node(
      "kv",
      "projection-kv",
      layer,
      mode,
      920,
      projectionY,
      1600,
      localKvProjectionHeight,
    ),
    node(
      "swa-window",
      "swa-window",
      layer,
      mode,
      hasGlobal ? 40 : 350,
      swaY,
      hasGlobal ? 780 : 900,
      swaHeight,
    ),
    node(
      "kv-merge",
      "kv-merge",
      layer,
      mode,
      hasGlobal ? 300 : 480,
      mergeY,
      hasGlobal ? 1000 : 640,
      mergeHeight,
    ),
    // [OM-FREEPLAY] 三个 Head 展开后采用与专家区一致的 2800px 画布宽度。
    node("heads", "heads", layer, mode, 40, headsY, 2800, headsHeight),
    node("concat", "concat", layer, mode, 150, concatY, 1470, concatHeight),
    // [OM-FREEPLAY] 四路各含两个并行过程与求和通道，2600px 保留长下标的可读宽度。
    node("add1", "add1", layer, mode, 300, add1Y, 2600, add1Height),
    node("state1", "state1", layer, mode, 300, state1Y, 1600, state1Height),
    {
      ...node("hc-pre-f", "hc-pre", layer, mode, 300, preFY, 1000, 420),
      data: { kind: "hc-pre", layer, mode, sublayer: "F" },
    },
    {
      ...node(
        "hc-mix-f",
        "hc-mix",
        layer,
        mode,
        HC_COEFFICIENT_X,
        preFY,
        2240,
        mixFHeight,
      ),
      data: { kind: "hc-mix", layer, mode, sublayer: "F" },
    },
    node("norm2", "norm2", layer, mode, 400, norm2Y, 800, norm2Height),
    node("moe-input", "moe-input", layer, mode, 715, moeInputY, 170, 80),
    node("router", "router", layer, mode, 320, routerY, 960, routerHeight),
    node(
      "scores",
      "scores",
      layer,
      mode,
      800 - ROUTER_SCORES_WIDTH / 2,
      scoresY,
      ROUTER_SCORES_WIDTH,
      scoresHeight,
    ),
    node(
      "experts",
      "experts",
      layer,
      mode,
      70,
      expertsY,
      EXPERTS_WIDTH,
      expertsHeight,
    ),
    node(
      "moe-sum",
      "moe-sum",
      layer,
      mode,
      70 + EXPERTS_WIDTH / 2 - 160,
      moeSumY,
      320,
      100,
    ),
    node(
      "moe-output",
      "moe-output",
      layer,
      mode,
      70 + EXPERTS_WIDTH / 2 - 320,
      moeOutputY,
      640,
      100,
    ),
    node("add2", "add2", layer, mode, 300, add2Y, 2600, add2Height),
    node("output", "output", layer, mode, 300, outputY, 1600, tensorHeight),
    node(
      "next-inputs",
      "next-inputs",
      layer,
      mode,
      300,
      outputY + (contentHeights.get("output") ?? tensorHeight) + mainGap,
      1600,
      1000,
    ),
  ];
  if (layer > 1) {
    nodes.push(
      node(
        "first-input",
        "tensor",
        1,
        mode,
        300,
        firstInputY,
        1600,
        tensorHeight,
      ),
    );
    nodes.push(
      node(
        "prior-layers",
        "prior-layers",
        layer,
        mode,
        450,
        priorLayersY,
        700,
        120,
      ),
    );
  }
  if (hasEngram(layer)) {
    nodes.push(
      node(
        "engram-lookup",
        "engram-lookup",
        layer,
        mode,
        2100,
        inputY,
        1000,
        1100,
      ),
    );
    nodes.push(
      node(
        "engram-inject",
        "engram-inject",
        layer,
        mode,
        300,
        engramY,
        2000,
        2000,
      ),
    );
  }
  for (const branch of EXPERT_OUTPUT_BRANCHES) {
    for (const item of [
      node(
        `expert-output-${branch.key}`,
        "expert-output",
        layer,
        mode,
        branch.center - branch.width / 2,
        expertOutputY,
        branch.width,
        expertOutputHeight,
      ),
      node(
        `expert-weight-${branch.key}`,
        "expert-weight",
        layer,
        mode,
        branch.center - 265,
        expertScaleY,
        145,
        70,
      ),
      node(
        `expert-scale-${branch.key}`,
        "expert-scale",
        layer,
        mode,
        branch.center - 35,
        expertScaleY,
        70,
        70,
      ),
      node(
        `expert-weighted-${branch.key}`,
        "expert-weighted",
        layer,
        mode,
        branch.center - branch.width / 2,
        weightedY,
        branch.width,
        weightedHeight,
      ),
    ])
      nodes.push({
        ...item,
        data: { ...item.data, expertId: branch.expertId },
      });
  }
  const omittedX =
    (EXPERT_OUTPUT_BRANCHES[2].center + EXPERT_OUTPUT_BRANCHES[3].center) / 2;
  nodes.push({
    ...node(
      "weighted-expert-ellipsis",
      "structure-operator",
      layer,
      mode,
      omittedX - 20,
      weightedY + 25,
      40,
      40,
    ),
    data: { kind: "structure-operator", layer, mode, tex: "\\cdots" },
  });
  nodes.push(
    {
      ...node(
        "swa-result",
        "swa-output",
        layer,
        mode,
        10,
        414,
        (((hasGlobal ? 780 : 900) - 56) * 1.7) / 2.6,
        82,
      ),
      parentId: "swa-window",
      extent: "parent",
    },
    structureNode({
      id: "q-x",
      parentId: "q",
      layer,
      mode,
      x: 28,
      y: queryLayout.firstY,
      width: 200,
      height: queryLayout.rowHeight,
      title: "输入矩阵",
      tex: `X_{${layer}}\\in\\mathbb R^{${count}\\times5120}`,
      matrixRows: matrixRows("\\mathbf x"),
      tone: "blue",
    }),
    structureNode({
      id: "q-mul-down",
      parentId: "q",
      layer,
      mode,
      x: 236,
      y: queryLayout.firstY + (queryLayout.rowHeight - 44) / 2,
      width: 36,
      height: 44,
      kind: "structure-operator",
      tex: "\\times",
    }),
    structureNode({
      id: "q-wdown",
      parentId: "q",
      layer,
      mode,
      x: 280,
      y: queryLayout.firstY + (queryLayout.rowHeight - 128) / 2,
      width: 230,
      height: 128,
      title: "5120 × 1280 · 列向量",
      tex: `W_{${layer}}^{Q\\downarrow}`,
      columnVectors: true,
      vectorCells: [
        `\\mathbf w_{${layer},1}^{Q\\downarrow}`,
        `\\mathbf w_{${layer},2}^{Q\\downarrow}`,
        "\\cdots",
        `\\mathbf w_{${layer},1280}^{Q\\downarrow}`,
      ],
      tone: "amber",
    }),
    structureNode({
      id: "q-equals-down",
      parentId: "q",
      layer,
      mode,
      x: 518,
      y: queryLayout.firstY + (queryLayout.rowHeight - 44) / 2,
      width: 36,
      height: 44,
      kind: "structure-operator",
      tex: "=",
    }),
    structureNode({
      id: "q-low-rank",
      parentId: "q",
      layer,
      mode,
      x: 562,
      y: queryLayout.firstY,
      width: 210,
      height: queryLayout.rowHeight,
      title: "归一化前的低秩矩阵",
      tex: `\\widehat Q_{${layer}}^{r}\\in\\mathbb R^{${count}\\times1280}`,
      matrixRows: matrixRows("\\widehat{\\mathbf q}").map((s) =>
        s === "\\vdots" ? s : `${s}^{r}`,
      ),
      tone: "green",
    }),
    {
      ...node(
        "q-rmsnorm",
        "query-norm",
        layer,
        mode,
        28,
        queryLayout.normY,
        744,
        queryNormHeight,
      ),
      parentId: "q",
      extent: "parent",
    },
    structureNode({
      id: "q-low-rank-up",
      parentId: "q",
      layer,
      mode,
      x: 28,
      y: queryLayout.secondY,
      width: 200,
      height: queryLayout.rowHeight,
      title: "同一低秩矩阵",
      tex: `Q_{${layer}}^{r}`,
      matrixRows: matrixRows("\\mathbf q").map((s) =>
        s === "\\vdots" ? s : `${s}^{r}`,
      ),
      tone: "green",
    }),
    structureNode({
      id: "q-mul-up",
      parentId: "q",
      layer,
      mode,
      x: 236,
      y: queryLayout.secondY + (queryLayout.rowHeight - 44) / 2,
      width: 36,
      height: 44,
      kind: "structure-operator",
      tex: "\\times",
    }),
    structureNode({
      id: "q-wup",
      parentId: "q",
      layer,
      mode,
      x: 280,
      y: queryLayout.secondY + (queryLayout.rowHeight - 128) / 2,
      width: 230,
      height: 128,
      title: "1280 × (64 · 512) · 列向量",
      tex: `W_{${layer}}^{Q\\uparrow}`,
      columnVectors: true,
      vectorCells: [
        `\\mathbf w_{${layer},1}^{Q\\uparrow}`,
        `\\mathbf w_{${layer},2}^{Q\\uparrow}`,
        "\\cdots",
        `\\mathbf w_{${layer},64\\cdot512}^{Q\\uparrow}`,
      ],
      tone: "amber",
    }),
    structureNode({
      id: "q-equals-up",
      parentId: "q",
      layer,
      mode,
      x: 518,
      y: queryLayout.secondY + (queryLayout.rowHeight - 44) / 2,
      width: 36,
      height: 44,
      kind: "structure-operator",
      tex: "=",
    }),
    structureNode({
      id: "q-wide-matrix",
      parentId: "q",
      layer,
      mode,
      x: 562,
      y: queryLayout.secondY,
      width: 210,
      height: queryLayout.resultHeight,
      title: "升维输出矩阵",
      tex: `\\widetilde Q_{${layer}}\\in\\mathbb R^{${count}\\times(64\\cdot512)}`,
      tone: "green",
      matrixRows: rows.map((s) =>
        s === "\\vdots" ? s : `\\widetilde{\\mathbf q}_{${layer},${s}}`,
      ),
      matrixSelectedRow: rows.indexOf("t"),
    }),
    structureNode({
      id: "q-head-slice",
      layer,
      mode,
      x: 20,
      y: querySplitY,
      width: 800,
      height: 150,
      kind: "structure-group",
      tex: `\\widetilde{\\mathbf q}_{${layer},t}`,
      title: "④ 沿特征轴分 64 块 · token 位置 t 不变",
      tone: "green",
    }),
    structureNode({
      id: "q-head-1",
      parentId: "q-head-slice",
      layer,
      mode,
      x: 12,
      y: 42,
      width: 210,
      height: 64,
      title: "Head 1 · 元素 1–512",
      tex: `\\mathbf q_{${layer},1,t}`,
      tone: "green",
    }),
    structureNode({
      id: "q-head-2",
      parentId: "q-head-slice",
      layer,
      mode,
      x: 234,
      y: 42,
      width: 210,
      height: 64,
      title: "Head 2 · 元素 513–1024",
      tex: `\\mathbf q_{${layer},2,t}`,
      tone: "green",
    }),
    structureNode({
      id: "q-head-more",
      parentId: "q-head-slice",
      layer,
      mode,
      x: 451,
      y: 52,
      width: 36,
      height: 44,
      kind: "structure-operator",
      tex: "\\cdots",
    }),
    structureNode({
      id: "q-head-64",
      parentId: "q-head-slice",
      layer,
      mode,
      x: 496,
      y: 42,
      width: 234,
      height: 64,
      title: "Head 64 · 元素 32257–32768",
      tex: `\\mathbf q_{${layer},64,t}`,
      tone: "green",
    }),
  );
  if (hasGlobal) {
    nodes.push(
      node(
        "compressor",
        "compressor",
        layer,
        mode,
        COMPRESSOR_X,
        projectionY,
        COMPRESSOR_WIDTH,
        compressorHeight,
      ),
    );
    nodes.push(
      node(
        "indexer",
        "indexer",
        layer,
        mode,
        1160,
        swaY,
        mode === "reuse" ? 820 : 1600,
        indexerHeight,
      ),
    );
    nodes.push(
      node(
        "global-select",
        "global-select",
        layer,
        mode,
        1160,
        globalSelectY,
        820,
        globalSelectHeight,
      ),
    );
  }

  const makeEdge = (
    id: string,
    source: string,
    target: string,
    labelTex?: string,
    extra?: Partial<EditableEdge>,
  ): EditableEdge => {
    const base: EditableEdge = {
      id,
      source,
      target,
      sourceHandle: "main-out",
      targetHandle: "main-in",
      type: "editable-orthogonal",
      reconnectable: true,
      markerEnd: architectureArrowMarker(COLORS.green),
      style: { stroke: COLORS.green, strokeWidth: 2.2 },
      data: { labelTex },
    };
    return {
      ...base,
      ...extra,
      type: "editable-orthogonal",
      style: { ...base.style, ...extra?.style },
      data: { ...base.data, ...extra?.data },
    };
  };
  const mathEdge = (
    id: string,
    source: string,
    target: string,
    tex: string,
    extra?: Partial<EditableEdge>,
  ) => makeEdge(id, source, target, tex, extra);
  // 旧残差沿用蓝色；具名内部入口由统一避障器处理，不再沿外框中点预置折线。
  const skipStyle = {
    style: { stroke: COLORS.blue, strokeWidth: 2.2 },
    data: { color: COLORS.blue },
    markerEnd: architectureArrowMarker(COLORS.blue),
  } as Partial<EditableEdge>;
  const coefficientStyle = (
    tone: "violet" | "rose",
  ): Partial<EditableEdge> => ({
    style: { stroke: COLORS[tone], strokeWidth: 2.2 },
    data: { color: COLORS[tone] },
    markerEnd: architectureArrowMarker(COLORS[tone]),
  });

  const edges: EditableEdge[] = [
    makeEdge("tokenizer-embedding", "tokenizer", "embedding"),
    makeEdge("embedding-expand", "embedding", "hc-expand"),
    makeEdge(
      "expand-first-input",
      "hc-expand",
      layer === 1 ? "input" : "first-input",
    ),
    makeEdge(
      "residual-pre-a",
      hasEngram(layer) ? "engram-inject" : "input",
      "hc-pre-a",
      undefined,
      { sourceHandle: hasEngram(layer) ? "main-out" : "main" },
    ),
    makeEdge(
      "residual-mix-a",
      hasEngram(layer) ? "engram-inject" : "input",
      "hc-mix-a",
      `\\mathcal H_{${layer}}^{${hasEngram(layer) ? "E" : "\\mathrm{in}"}}`,
      { sourceHandle: "coefficients" },
    ),
    makeEdge("pre-a-norm", "hc-pre-a", "norm1"),
    mathEdge("norm-q", "norm1", "q", `X_{${layer}}`, {
      sourceHandle: "query",
      targetHandle: "port-top",
    }),
    mathEdge("norm-kv", "norm1", "kv", `X_{${layer}}`, {
      sourceHandle: "local-kv",
    }),
    makeEdge("query-matrix-row", "q-wide-matrix", "q-row", undefined, {
      sourceHandle: "port-bottom",
    }),
    makeEdge("query-row-split", "q-row", "q-head-slice", undefined, {
      targetHandle: "port-top",
    }),
    mathEdge(
      "kv-swa",
      "kv",
      "swa-window",
      phase === "prefill"
        ? `U_{${layer}}\\in\\mathbb{R}^{N\\times512}`
        : `\\mathbf u_{${layer},t}\\in\\mathbb{R}^{1\\times512}`,
      { sourceHandle: "swa", targetHandle: "projected-kv" },
    ),
    mathEdge(
      "swa-merge",
      "swa-result",
      "kv-merge",
      `U_{${layer},t}^{\\mathrm{SWA}}`,
      { sourceHandle: "local-window", targetHandle: "local" },
    ),
    mathEdge("merge-heads", "kv-merge", "heads", `\\mathrm{KV}_{${layer},t}`, {
      sourceHandle: "kv",
      targetHandle: "kv",
    }),
    makeEdge("heads-concat", "heads", "concat"),
    mathEdge("concat-add1", "concat", "add1", `O_{${layer}}`),
    mathEdge(
      "residual-post-a",
      hasEngram(layer) ? "engram-inject" : "input",
      "add1",
      `\\mathcal H_{${layer}}^{${hasEngram(layer) ? "E" : "\\mathrm{in}"}}`,
      { sourceHandle: "residual", targetHandle: "skip", ...skipStyle },
    ),
    mathEdge("mix-a-post", "hc-mix-a", "add1", `\\mathbf q_{${layer},t}^{A}`, {
      ...coefficientStyle("rose"),
      sourceHandle: "post",
      targetHandle: "post",
    }),
    mathEdge("mix-a-comb", "hc-mix-a", "add1", `C_{${layer},t}^{A}`, {
      ...coefficientStyle("violet"),
      sourceHandle: "comb",
      targetHandle: "comb",
    }),
    mathEdge(
      "mix-a-pre-f",
      "hc-mix-a",
      "hc-pre-f",
      `\\mathbf p_{${layer},t}^{A}`,
      { sourceHandle: "pre", targetHandle: "weights" },
    ),
    makeEdge("add1-state", "add1", "state1"),
    makeEdge("state-pre-f", "state1", "hc-pre-f", undefined, {
      sourceHandle: "main",
    }),
    mathEdge(
      "state-mix-f",
      "state1",
      "hc-mix-f",
      `\\mathcal H_{${layer}}^{A}`,
      {
        sourceHandle: "coefficients",
      },
    ),
    makeEdge("pre-f-norm", "hc-pre-f", "norm2"),
    mathEdge("mix-f-post", "hc-mix-f", "add2", `\\mathbf q_{${layer},t}^{F}`, {
      ...coefficientStyle("rose"),
      sourceHandle: "post",
      targetHandle: "post",
    }),
    mathEdge("mix-f-comb", "hc-mix-f", "add2", `C_{${layer},t}^{F}`, {
      ...coefficientStyle("violet"),
      sourceHandle: "comb",
      targetHandle: "comb",
    }),
    mathEdge(
      "mix-f-next-pre",
      "hc-mix-f",
      "output",
      `\\mathbf p_{${layer},t}^{F}`,
      { sourceHandle: "pre", targetHandle: "coefficients" },
    ),
    makeEdge("norm2-moe-input", "norm2", "moe-input"),
    makeEdge("moe-input-router", "moe-input", "router", undefined, {
      sourceHandle: "router",
    }),
    mathEdge("router-scores", "router", "scores", `S_{${layer}}`),
    makeEdge("moe-input-shared", "moe-input", "experts", undefined, {
      sourceHandle: "shared",
      targetHandle: "shared",
      style: { stroke: COLORS.blue, strokeWidth: 2.2 },
      markerEnd: architectureArrowMarker(COLORS.blue),
    }),
    makeEdge("sum-moe-output", "moe-sum", "moe-output"),
    mathEdge(
      "moe-output-add2",
      "moe-output",
      "add2",
      `O_{${layer}}^{\\mathrm{FFN}}`,
    ),
    mathEdge("state1-add2", "state1", "add2", `\\mathcal H_{${layer}}^{A}`, {
      sourceHandle: "residual",
      targetHandle: "skip",
      ...skipStyle,
    }),
    makeEdge("add2-output", "add2", "output"),
    mathEdge(
      "output-next-state",
      "output",
      "next-inputs",
      `\\mathcal H_{${layer}}^{\\mathrm{out}}`,
      { sourceHandle: "state-next", targetHandle: "main-in", ...skipStyle },
    ),
    mathEdge(
      "output-next-pre",
      "output",
      "next-inputs",
      phase === "prefill" ? `P_{${layer}}^{F}` : `\\mathbf p_{${layer},t}^{F}`,
      { sourceHandle: "pre-next", targetHandle: "coefficients" },
    ),
  ];
  if (hasEngram(layer))
    edges.push(
      makeEdge(
        "tokens-engram",
        "tokenizer",
        "engram-lookup",
        "\\text{Token IDs}",
        { sourceHandle: "port-right" },
      ),
      makeEdge(
        "engram-memory",
        "engram-lookup",
        "engram-inject",
        "\\mathbf k_{1:4},\\mathbf v",
        { targetHandle: "memory" },
      ),
      makeEdge("engram-state", "input", "engram-inject", undefined, {
        sourceHandle: "main",
      }),
    );
  if (layer > 1)
    edges.push(
      mathEdge(
        "previous-pre-a",
        "prior-layers",
        "hc-pre-a",
        `\\mathbf p_{${layer - 1},t}^{F}`,
        { sourceHandle: "port-right", targetHandle: "weights" },
      ),
    );
  if (layer > 1)
    edges.push(
      makeEdge(
        "first-input-prior-layers",
        "first-input",
        "prior-layers",
        undefined,
        { sourceHandle: "main" },
      ),
      makeEdge("prior-layers-input", "prior-layers", "input"),
    );
  for (const head of [1, 2, 64])
    edges.push(
      mathEdge(
        `query-head-${head}`,
        `q-head-${head}`,
        "heads",
        `\\mathbf q_{${layer},${head},t}`,
        { sourceHandle: "port-bottom", targetHandle: `query-${head}` },
      ),
    );
  for (const expert of VISIBLE_ROUTED_EXPERTS) {
    edges.push(
      makeEdge(
        `score-expert-${expert.id}`,
        "scores",
        "experts",
        `g_{${layer},${expert.id}}=${expert.score}`,
        {
          sourceHandle: `score-${expert.id}`,
          targetHandle: `expert-${expert.id}`,
          style: { stroke: COLORS.amber, strokeWidth: 2 },
          markerEnd: architectureArrowMarker(COLORS.amber),
        },
      ),
    );
  }
  for (const branch of EXPERT_OUTPUT_BRANCHES) {
    const expert =
      branch.expertId === undefined ? "\\mathrm{shared}" : branch.key;
    const color = branch.expertId === undefined ? COLORS.blue : COLORS.amber;
    const branchStyle = {
      style: { stroke: color, strokeWidth: 2 },
      markerEnd: architectureArrowMarker(color),
      data: { color },
    };
    edges.push(
      makeEdge(
        `expert-result-${branch.key}`,
        "experts",
        `expert-output-${branch.key}`,
        undefined,
        {
          ...branchStyle,
          sourceHandle:
            branch.expertId === undefined
              ? "shared-out"
              : `expert-out-${branch.key}`,
        },
      ),
    );
    edges.push(
      mathEdge(
        `expert-row-${branch.key}`,
        `expert-output-${branch.key}`,
        `expert-scale-${branch.key}`,
        `\\mathbf e_{${layer},${expert},t}`,
        branchStyle,
      ),
    );
    edges.push(
      makeEdge(
        `expert-gate-${branch.key}`,
        `expert-weight-${branch.key}`,
        `expert-scale-${branch.key}`,
        undefined,
        {
          ...branchStyle,
          sourceHandle: "weight-out",
          targetHandle: "weight-in",
        },
      ),
    );
    edges.push(
      makeEdge(
        `expert-product-${branch.key}`,
        `expert-scale-${branch.key}`,
        `expert-weighted-${branch.key}`,
        undefined,
        branchStyle,
      ),
    );
    edges.push(
      makeEdge(
        `expert-sum-${branch.key}`,
        `expert-weighted-${branch.key}`,
        "moe-sum",
        undefined,
        { ...branchStyle, targetHandle: `term-${branch.key}` },
      ),
    );
  }
  if (hasGlobal) {
    const kvSource = globalKvSourceLayer(layer)!;
    const indexSource = globalIndexSourceLayer(layer)!;
    if (mode === "full")
      edges.push(
        mathEdge("norm-compressor", "norm1", "compressor", `X_{${layer}}`, {
          sourceHandle: "global-kv",
          targetHandle: "input",
        }),
      );
    if (mode === "full" || mode === "reindex")
      edges.push(
        mathEdge(
          "q-low-rank-indexer",
          "q-rmsnorm",
          "indexer",
          `Q_{${layer}}^r`,
          { sourceHandle: "port-right", targetHandle: "query" },
        ),
      );
    if (mode !== "reuse")
      edges.push(
        mathEdge(
          "compressor-indexer",
          "compressor",
          "indexer",
          mode === "full"
            ? `\\bar G_{${kvSource}}`
            : `K_{${kvSource}}^{I\\prime}\\;\\mathrm{cache}`,
          { sourceHandle: "to-indexer", targetHandle: "global-matrix" },
        ),
      );
    edges.push(
      mathEdge(
        "indexer-matrix",
        "compressor",
        "global-select",
        `G_{${kvSource}}`,
        { sourceHandle: "to-indexer", targetHandle: "matrix" },
      ),
    );
    edges.push(
      mathEdge(
        "indexer-select",
        "indexer",
        "global-select",
        `I_{${indexSource},t}\\in\\mathbb{N}^{K_{${indexSource},t}}`,
        {
          sourceHandle: "indices",
          targetHandle: "indices",
          style: { stroke: COLORS.amber, strokeWidth: 2.2 },
          markerEnd: architectureArrowMarker(COLORS.amber),
        },
      ),
    );
    edges.push(
      mathEdge(
        "select-merge",
        "global-select",
        "kv-merge",
        `G_{${kvSource},t}^{\\mathrm{selected}}`,
        { sourceHandle: "selected", targetHandle: "global" },
      ),
    );
  }
  return {
    nodes: nodes.map((item) => ({ ...item, data: { ...item.data, phase } })),
    edges,
  };
}

type SavedDiagramLayout = {
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    data?: EditableEdgeData;
  }>;
};

type DiagramSnapshot = {
  nodes: DiagramNode[];
  edges: EditableEdge[];
};

function cloneSnapshot(
  nodes: DiagramNode[],
  edges: EditableEdge[],
): DiagramSnapshot {
  return {
    nodes: nodes.map((item) => ({
      ...item,
      position: { ...item.position },
      style: item.style ? { ...item.style } : undefined,
      data: {
        ...item.data,
        matrixRows: item.data.matrixRows
          ? [...item.data.matrixRows]
          : undefined,
        matrixRowCells: item.data.matrixRowCells?.map((row) => [...row]),
        vectorCells: item.data.vectorCells
          ? [...item.data.vectorCells]
          : undefined,
      },
    })),
    edges: edges.map((item) => ({
      ...item,
      style: item.style ? { ...item.style } : undefined,
      data: item.data
        ? {
            ...item.data,
            waypoints: item.data.waypoints?.map((point) => ({ ...point })),
          }
        : undefined,
    })),
  };
}

const editorButton: CSSProperties = {
  border: `1px solid ${COLORS.line}`,
  borderRadius: 7,
  background: COLORS.card,
  color: COLORS.ink,
  padding: "6px 9px",
  fontSize: 11,
  fontWeight: 750,
  cursor: "pointer",
};

function storedDimension(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function captureDiagramLayout(
  nodes: DiagramNode[],
  edges: EditableEdge[],
): SavedDiagramLayout {
  return {
    nodes: nodes.map((item) => ({
      id: item.id,
      x: item.position.x,
      y: item.position.y,
      // React Flow 缩放写入节点 width/height；style 中可能仍是初始尺寸，不能覆盖编辑结果。
      width:
        storedDimension(item.width) ??
        storedDimension(item.measured?.width) ??
        storedDimension(item.style?.width),
      height:
        storedDimension(item.height) ??
        storedDimension(item.measured?.height) ??
        storedDimension(item.style?.height),
    })),
    edges: edges.map((item) => ({
      id: item.id,
      source: item.source,
      target: item.target,
      sourceHandle: item.sourceHandle,
      targetHandle: item.targetHandle,
      data: item.data,
    })),
  };
}

export function applySavedLayout(
  graph: { nodes: DiagramNode[]; edges: EditableEdge[] },
  saved: SavedDiagramLayout,
) {
  const nodeLayouts = new Map(saved.nodes.map((item) => [item.id, item]));
  // 插入子阶段时，其父组也参与重新排布，避免旧的组高盖住新增结构。
  const graphNodes = new Map(graph.nodes.map((item) => [item.id, item]));
  const stageRoot = (item: DiagramNode): DiagramNode =>
    item.parentId ? stageRoot(graphNodes.get(item.parentId)!) : item;
  const insertedStageY = Math.min(
    ...graph.nodes
      .filter((item) => !nodeLayouts.has(item.id))
      .map((item) => stageRoot(item).position.y),
  );
  const reflowedNodes = new Set(
    graph.nodes
      .filter((item) => stageRoot(item).position.y >= insertedStageY)
      .map((item) => item.id),
  );
  const nodes = graph.nodes.map((item) => {
    const layout = nodeLayouts.get(item.id);
    if (!layout) return item;
    if (reflowedNodes.has(item.id)) return item;
    return {
      ...item,
      position: { x: layout.x, y: layout.y },
      style: {
        ...item.style,
        ...(layout.width ? { width: layout.width } : {}),
        ...(layout.height
          ? CONTENT_SIZED_KINDS.has(item.data.kind)
            ? { minHeight: layout.height }
            : { height: layout.height }
          : {}),
      },
    };
  });
  const baselineEdges = new Map(graph.edges.map((item) => [item.id, item]));
  const nodeIds = new Set(nodes.map((item) => item.id));
  const edges: EditableEdge[] = saved.edges
    .filter(
      (item) =>
        nodeIds.has(item.source) &&
        nodeIds.has(item.target) &&
        (baselineEdges.has(item.id) || item.id.startsWith("manual-")),
    )
    .map((item) => {
      const baseline = baselineEdges.get(item.id);
      // 阶段插入后，重排节点的主流程边也回到语义图；旧折点与旧张量名不跨结构沿用。
      if (
        baseline &&
        (!nodeLayouts.has(baseline.source) ||
          !nodeLayouts.has(baseline.target) ||
          reflowedNodes.has(baseline.source) ||
          reflowedNodes.has(baseline.target))
      )
        return baseline;
      return {
        ...(baseline ?? {
          id: item.id,
          type: "editable-orthogonal" as const,
          markerEnd: architectureArrowMarker(COLORS.green),
          style: { stroke: COLORS.green, strokeWidth: 2.2 },
          reconnectable: true,
        }),
        ...item,
        type: "editable-orthogonal" as const,
        sourceHandle: item.sourceHandle ?? baseline?.sourceHandle ?? "main-out",
        targetHandle: item.targetHandle ?? baseline?.targetHandle ?? "main-in",
        data: { ...baseline?.data, ...item.data },
      } satisfies EditableEdge;
    });
  const restoredEdgeIds = new Set(edges.map((item) => item.id));
  for (const edge of graph.edges) {
    if (
      !restoredEdgeIds.has(edge.id) &&
      (!nodeLayouts.has(edge.source) || !nodeLayouts.has(edge.target))
    )
      edges.push(edge);
  }
  return { nodes, edges };
}

function DiagramCanvas({
  layer,
  phase,
}: {
  layer: number;
  phase: ExecutionPhase;
}) {
  const geometryCache = useContext(GeometryCacheContext)!;
  const initialGraph = useMemo(
    () => buildMeasuredGraph(layer, phase, geometryCache),
    [layer, phase, geometryCache],
  );
  const measuredLayoutRef = useRef(initialGraph);
  const [nodes, setNodes, onNodesChange] = useNodesState<DiagramNode>(
    initialGraph.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<EditableEdge>(
    initialGraph.edges,
  );
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [inspector, dispatchInspector] = useReducer(inspectorReducer, {
    mode: "auto",
    nodeId: null,
  } satisfies InspectorState);
  const closeInspector = useCallback(
    () => dispatchInspector({ type: "close" }),
    [],
  );
  const inspectedNode = nodes.find((node) => node.id === inspector.nodeId);
  let moduleNode = inspectedNode;
  while (moduleNode?.parentId)
    moduleNode = nodes.find((node) => node.id === moduleNode?.parentId);
  const inspectedData = moduleNode?.data;
  const moduleConnections = useMemo<ModuleConnection[]>(
    () =>
      edges
        .filter(
          (edge) =>
            edge.source === inspector.nodeId ||
            edge.target === inspector.nodeId,
        )
        .map((edge) => {
          const otherId =
            edge.target === inspector.nodeId ? edge.source : edge.target;
          const other = nodes.find((node) => node.id === otherId);
          return {
            id: edge.id,
            direction: edge.target === inspector.nodeId ? "in" : "out",
            label: edge.data?.labelTex,
            other: other ? explainModule(other.data).title : otherId,
          };
        }),
    [edges, inspector.nodeId, nodes],
  );
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">(
    "idle",
  );
  const [historyRevision, setHistoryRevision] = useState(0);
  const [clickConnectionPreview, setClickConnectionPreview] = useState<{
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance<DiagramNode, EditableEdge> | null>(
    null,
  );
  const [canvasClip, setCanvasClip] = useState<CanvasClip>();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      // 文章内的画布可能比屏幕高，并可能被播放器缩放；使用真实屏幕交集。
      const sx = canvas.clientWidth / rect.width,
        sy = canvas.clientHeight / rect.height;
      const next = {
        left: Math.max(0, -rect.left) * sx,
        top: Math.max(0, -rect.top) * sy,
        right: Math.min(rect.width, window.innerWidth - rect.left) * sx,
        bottom: Math.min(rect.height, window.innerHeight - rect.top) * sy,
      };
      setCanvasClip((old) =>
        old &&
        old.left === next.left &&
        old.top === next.top &&
        old.right === next.right &&
        old.bottom === next.bottom
          ? old
          : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const pastRef = useRef<DiagramSnapshot[]>([]);
  const futureRef = useRef<DiagramSnapshot[]>([]);
  const pendingHistoryRef = useRef<DiagramSnapshot | null>(null);
  const resizeHistoryActiveRef = useRef(false);
  const connectionGestureRef = useRef<{
    nodeId: string;
    handleId: string | null;
    x: number;
    y: number;
  } | null>(null);
  const resetConnectionRef = useRef<(() => void) | null>(null);
  const completedConnectionRef = useRef(false);
  // 并行回写改变了框宽与内部端口位置；新布局独立保存，旧手调记录不覆盖、不删除。
  const storageKey = `model-atlas:deepseek-v41-layer-layout:v12:${phase}:${layer}`;

  nodesRef.current = nodes;
  edgesRef.current = edges;

  const beginHistory = useCallback(() => {
    if (pendingHistoryRef.current) return;
    pendingHistoryRef.current = cloneSnapshot(
      nodesRef.current,
      edgesRef.current,
    );
  }, []);

  const commitHistory = useCallback(() => {
    const before = pendingHistoryRef.current;
    if (!before) return;
    pastRef.current = [...pastRef.current.slice(-79), before];
    futureRef.current = [];
    pendingHistoryRef.current = null;
    setHistoryRevision((value) => value + 1);
    setSaveState("idle");
  }, []);

  const restoreSnapshot = useCallback(
    (snapshot: DiagramSnapshot) => {
      const cloned = cloneSnapshot(snapshot.nodes, snapshot.edges);
      measuredLayoutRef.current = buildGraph(
        layer,
        new Map(
          cloned.nodes
            .filter(
              (item) =>
                CONTENT_SIZED_KINDS.has(item.data.kind) &&
                item.measured?.height,
            )
            .map((item) => [item.id, item.measured!.height!]),
        ),
        phase,
      );
      setNodes(cloned.nodes);
      setEdges(cloned.edges);
      setSelectedEdgeIds([]);
      setSaveState("idle");
    },
    [layer, phase, setEdges, setNodes],
  );

  const undo = useCallback(() => {
    const previous = pastRef.current.at(-1);
    if (!previous) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [
      ...futureRef.current.slice(-79),
      cloneSnapshot(nodesRef.current, edgesRef.current),
    ];
    pendingHistoryRef.current = null;
    restoreSnapshot(previous);
    setHistoryRevision((value) => value + 1);
  }, [restoreSnapshot]);

  const redo = useCallback(() => {
    const next = futureRef.current.at(-1);
    if (!next) return;
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [
      ...pastRef.current.slice(-79),
      cloneSnapshot(nodesRef.current, edgesRef.current),
    ];
    pendingHistoryRef.current = null;
    restoreSnapshot(next);
    setHistoryRevision((value) => value + 1);
  }, [restoreSnapshot]);

  useEffect(() => {
    let graph = initialGraph;
    measuredLayoutRef.current = initialGraph;
    // [OM-FREEPLAY] 用户要求能自行微调；显式保存到浏览器本机，避免刷新后丢失，同时不改文章事实源。
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as SavedDiagramLayout;
        // 保存时的实测高度也是布局基线，避免水合后再次累加同一高度差。
        const sizedGraph = buildGraph(
          layer,
          new Map(
            saved.nodes
              .filter((item) => item.height)
              .map((item) => [item.id, item.height!]),
          ),
          phase,
        );
        measuredLayoutRef.current = sizedGraph;
        graph = restoreMeasuredGeometry(
          applySavedLayout(sizedGraph, saved),
          geometryCache,
        );
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
    const flow = flowRef.current;
    // 受控图只有这一份节点/边状态；切层直接替换，避免实例队列先逐项生成 changes 再回传。
    setNodes(graph.nodes);
    setEdges(graph.edges);
    if (flow) {
      flow.fitView(FIT_VIEW_OPTIONS).catch(() => {});
    }
    setSelectedEdgeIds([]);
    setSaveState("idle");
    pastRef.current = [];
    futureRef.current = [];
    pendingHistoryRef.current = null;
    resizeHistoryActiveRef.current = false;
    connectionGestureRef.current = null;
    completedConnectionRef.current = false;
    resetConnectionRef.current?.();
    setClickConnectionPreview(null);
    setHistoryRevision((value) => value + 1);
  }, [initialGraph, storageKey, geometryCache]);

  // 内容尺寸由 React Flow 的 ResizeObserver 测量；下游位置由同一布局函数推导。
  // 只移动自动布局基线的差值，保留用户拖动产生的偏移，不清除已保存的布局。
  const measuredHeightKey = nodes
    .filter((item) => CONTENT_SIZED_KINDS.has(item.data.kind))
    .map((item) => `${item.id}:${item.measured?.height ?? 0}`)
    .join("|");
  useEffect(() => {
    const nodes = nodesRef.current;
    const previous = measuredLayoutRef.current;
    const heights = measurementsForGraph(previous, nodes);
    if (!heights?.size) return;
    const next = buildGraph(layer, heights, phase);
    const oldPositions = new Map(
      previous.nodes.map((item) => [item.id, item.position]),
    );
    const deltas = new Map(
      next.nodes.map((item) => [
        item.id,
        item.position.y - (oldPositions.get(item.id)?.y ?? item.position.y),
      ]),
    );
    if (![...deltas.values()].some((delta) => Math.abs(delta) > 0.5)) return;
    measuredLayoutRef.current = next;
    const nextNodes = new Map(next.nodes.map((item) => [item.id, item]));
    const oldNodes = new Map(previous.nodes.map((item) => [item.id, item]));
    setNodes((current) =>
      current.map((item) => {
        const baseline = nextNodes.get(item.id);
        const old = oldNodes.get(item.id);
        const delta = deltas.get(item.id) ?? 0;
        // 子节点也按局部坐标的基线差值移动；父框随内部内容增高，人工尺寸偏移保留。
        const heightDelta =
          Number(baseline?.style?.height ?? 0) -
          Number(old?.style?.height ?? 0);
        if (!delta && !heightDelta) return item;
        return {
          ...item,
          position: { ...item.position, y: item.position.y + delta },
          ...(heightDelta
            ? {
                style: {
                  ...item.style,
                  height:
                    Number(item.style?.height ?? old?.style?.height ?? 0) +
                    heightDelta,
                },
              }
            : {}),
          ...(item.id === "q"
            ? {
                data: {
                  ...item.data,
                  queryNormHeight: baseline?.data.queryNormHeight,
                },
              }
            : {}),
        };
      }),
    );
    const oldEdges = new Map(previous.edges.map((item) => [item.id, item]));
    const newEdges = new Map(next.edges.map((item) => [item.id, item]));
    setEdges((current) =>
      current.map((item) =>
        item.data?.waypoints &&
        JSON.stringify(item.data.waypoints) ===
          JSON.stringify(oldEdges.get(item.id)?.data?.waypoints)
          ? {
              ...item,
              data: {
                ...item.data,
                waypoints: newEdges.get(item.id)?.data?.waypoints,
              },
            }
          : item,
      ),
    );
  }, [layer, phase, measuredHeightKey, setEdges, setNodes]);

  const onConnect = useCallback(
    (connection: Connection, targetAnchor?: BoundaryAnchor) => {
      beginHistory();
      setEdges((current) => [
        ...current,
        {
          ...connection,
          id: `manual-${Date.now()}`,
          type: "editable-orthogonal",
          reconnectable: true,
          markerEnd: architectureArrowMarker(COLORS.green),
          style: { stroke: COLORS.green, strokeWidth: 2.2 },
          data: { labelTex: "", targetAnchor },
        },
      ]);
      commitHistory();
    },
    [beginHistory, commitHistory, setEdges],
  );

  const finishConnection = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const gesture = connectionGestureRef.current;
      const scope = canvasRef.current;
      if (!gesture || !scope) return;
      const pointer = "touches" in event ? event.changedTouches[0] : event;
      if (!pointer) return;
      const hit = findBoundaryConnection(
        scope,
        { x: pointer.clientX, y: pointer.clientY },
        gesture.nodeId,
      );
      if (!hit) return;
      connectionGestureRef.current = null;
      completedConnectionRef.current = true;
      resetConnectionRef.current?.();
      setClickConnectionPreview(null);
      onConnect(
        {
          source: gesture.nodeId,
          sourceHandle: gesture.handleId,
          target: hit.nodeId,
          targetHandle: `port-${hit.anchor.side}`,
        },
        hit.anchor,
      );
    },
    [onConnect],
  );

  const saveLayout = useCallback(() => {
    const payload = captureDiagramLayout(nodes, edges);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [edges, nodes, storageKey]);

  const resetLayout = useCallback(() => {
    beginHistory();
    window.localStorage.removeItem(storageKey);
    measuredLayoutRef.current = initialGraph;
    setNodes(initialGraph.nodes);
    setEdges(initialGraph.edges);
    setSelectedEdgeIds([]);
    commitHistory();
  }, [
    beginHistory,
    commitHistory,
    initialGraph,
    setEdges,
    setNodes,
    storageKey,
  ]);

  const deleteSelectedEdges = useCallback(() => {
    if (selectedEdgeIds.length === 0) return;
    beginHistory();
    const selected = new Set(selectedEdgeIds);
    setEdges((current) => current.filter((item) => !selected.has(item.id)));
    setSelectedEdgeIds([]);
    commitHistory();
  }, [beginHistory, commitHistory, selectedEdgeIds, setEdges]);

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      const resizeChanges = changes.filter(
        (change) => change.type === "dimensions",
      );
      const resizing = resizeChanges.some(
        (change) => "resizing" in change && change.resizing === true,
      );
      const resizeFinished = resizeChanges.some(
        (change) => "resizing" in change && change.resizing === false,
      );
      if (resizing && !resizeHistoryActiveRef.current) {
        resizeHistoryActiveRef.current = true;
        beginHistory();
      }
      onNodesChange(changes);
      if (resizeFinished && resizeHistoryActiveRef.current) {
        resizeHistoryActiveRef.current = false;
        commitHistory();
      }
      setSaveState("idle");
    },
    [beginHistory, commitHistory, onNodesChange],
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      const removesEdge = changes.some((change) => change.type === "remove");
      if (removesEdge) beginHistory();
      onEdgesChange(changes);
      if (removesEdge) commitHistory();
      setSaveState("idle");
    },
    [beginHistory, commitHistory, onEdgesChange],
  );

  const handleSelectionChange = useCallback(
    ({ edges: selectedEdges }: { edges: EditableEdge[] }) => {
      setSelectedEdgeIds(selectedEdges.map((item) => item.id));
    },
    [],
  );

  const selectedEdge =
    selectedEdgeIds.length === 1
      ? edges.find((item) => item.id === selectedEdgeIds[0])
      : undefined;

  const updateSelectedEdgeLabel = useCallback(
    (labelTex: string) => {
      if (!selectedEdge) return;
      setEdges((current) =>
        current.map((item) =>
          item.id === selectedEdge.id
            ? { ...item, data: { ...item.data, labelTex } }
            : item,
        ),
      );
    },
    [selectedEdge, setEdges],
  );

  const handleCanvasKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, [contenteditable='true']")) return;
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        undo();
        return;
      }
      if (
        event.key.toLowerCase() === "y" ||
        (event.key.toLowerCase() === "z" && event.shiftKey)
      ) {
        event.preventDefault();
        event.stopPropagation();
        redo();
      }
    },
    [redo, undo],
  );

  useEffect(() => {
    setSaveState("idle");
  }, [edges]);

  const canUndo = historyRevision >= 0 && pastRef.current.length > 0;
  const canRedo = historyRevision >= 0 && futureRef.current.length > 0;
  const historyContext = useMemo(
    () => ({ beginHistory, commitHistory }),
    [beginHistory, commitHistory],
  );

  const pointerInCanvas = useCallback((clientX: number, clientY: number) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    return bounds
      ? { x: clientX - bounds.left, y: clientY - bounds.top }
      : { x: clientX, y: clientY };
  }, []);

  useLayoutEffect(() => {
    if (inspector.mode !== "open" || !inspector.nodeId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reveal = () => {
      const flow = flowRef.current,
        node = flow?.getInternalNode(inspector.nodeId!);
      if (!flow || !node?.measured.width || !node.measured.height) return;
      // 独立面板改变的是画布可用尺寸；按真实新尺寸摆放所选框，不用浮层盖住它。
      const width = canvas.clientWidth,
        height = canvas.clientHeight;
      if (!width || !height) return;
      const zoom = Math.max(
        0.18,
        Math.min(
          flow.getZoom(),
          (width - 60) / node.measured.width,
          (height - 110) / node.measured.height,
        ),
      );
      flow
        .setViewport(
          {
            x:
              Math.max(24, (width - node.measured.width * zoom) / 2) -
              node.internals.positionAbsolute.x * zoom,
            y: 85 - node.internals.positionAbsolute.y * zoom,
            zoom,
          },
          { duration: 0 },
        )
        .catch(() => {});
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [inspector.mode, inspector.nodeId]);

  return (
    <div
      className="diagram-workspace"
      data-inspector-open={inspector.mode === "open"}
    >
      <div
        ref={canvasRef}
        className="diagram-interaction-surface"
        style={{ minWidth: 0, minHeight: 0, flex: 1, position: "relative" }}
        onKeyDown={handleCanvasKeyDown}
        onClickCapture={(event) => {
          if (!completedConnectionRef.current) return;
          completedConnectionRef.current = false;
          event.stopPropagation();
        }}
        onPointerUp={(event) => finishConnection(event.nativeEvent)}
        onPointerMove={(event) => {
          if (!clickConnectionPreview) return;
          const point = pointerInCanvas(event.clientX, event.clientY);
          setClickConnectionPreview((current) =>
            current ? { ...current, toX: point.x, toY: point.y } : null,
          );
        }}
      >
        <div
          className="full-toolbar"
          style={{
            position: "absolute",
            top: 12,
            right: 16,
            maxWidth: "calc(100% - 70px)",
            flexWrap: "wrap",
            zIndex: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: 7,
            border: `1px solid ${COLORS.line}`,
            borderRadius: 9,
            background: "rgba(255,254,250,.96)",
            boxShadow: "0 4px 14px rgba(42,41,36,.08)",
          }}
        >
          <button
            type="button"
            style={editorButton}
            aria-pressed={inspector.mode === "open"}
            onClick={() => dispatchInspector({ type: "open" })}
          >
            <BookOpen size={14} />
            {inspector.mode === "open" ? "解释已显示" : "显示解释"}
          </button>
          <select
            aria-label="定位模块"
            defaultValue=""
            style={editorButton}
            onChange={(event) => {
              const target = nodesRef.current.find(
                (node) => node.id === event.target.value,
              );
              if (target)
                flowRef.current
                  ?.setViewport(
                    {
                      x: 30 - target.position.x * 0.8,
                      y: 85 - target.position.y * 0.8,
                      zoom: 0.8,
                    },
                    { duration: 0 },
                  )
                  .catch(() => {});
            }}
          >
            <option value="" disabled>
              定位模块…
            </option>
            {[
              ["tokenizer", "输入与分词"],
              ["execution-guide", "Prefill / Decode 视角"],
              ["embedding", "Embedding 查表"],
              ["hc-expand", "首层四路初始化"],
              ["input", "四路残差输入"],
              ["hc-pre-a", "Attention 四路汇合"],
              ["hc-mix-a", "mHC 控制器"],
              ["engram-lookup", "Engram 查表"],
              ["engram-inject", "Engram 注入"],
              ["q", "Query 投影"],
              ["norm1", "Attention 输入 RMSNorm"],
              ["q-row", "Query 第 t 行"],
              ["compressor", "全局 KV Compressor"],
              ["swa-window", "本地窗口"],
              ["indexer", "Indexer"],
              ["global-select", "全局 KV 取行"],
              ["kv-merge", "注意力 KV 拼接"],
              ["heads", "Head / RoPE / QKVO"],
              ["concat", "输出投影"],
              ["add1", "Attention 回写"],
              ["state1", "Attention 四路输出"],
              ["hc-pre-f", "FFN 四路汇合"],
              ["hc-mix-f", "FFN mHC 控制器"],
              ["norm2", "FFN 输入 RMSNorm"],
              ["router", "Router"],
              ["scores", "Router 得分与选择"],
              ["experts", "专家内部"],
              ["add2", "FFN 回写"],
              ["moe-sum", "专家加权汇总"],
              ["output", "本层输出"],
              ["next-inputs", "下一层输入清单"],
              ["kv", "本层 KV 横向流程"],
            ]
              .filter(([id]) => nodes.some((node) => node.id === id))
              .map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={saveLayout}
            style={{
              ...editorButton,
              color: saveState === "error" ? COLORS.rose : COLORS.ink,
            }}
          >
            {saveState === "saved"
              ? "已保存到本机"
              : saveState === "error"
                ? "保存失败，请重试"
                : "保存到本机"}
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Ctrl+Z"
            style={{
              ...editorButton,
              opacity: canUndo ? 1 : 0.45,
              cursor: canUndo ? "pointer" : "default",
            }}
          >
            撤销
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Ctrl+Y"
            style={{
              ...editorButton,
              opacity: canRedo ? 1 : 0.45,
              cursor: canRedo ? "pointer" : "default",
            }}
          >
            重做
          </button>
          <button
            type="button"
            onClick={deleteSelectedEdges}
            disabled={selectedEdgeIds.length === 0}
            style={{
              ...editorButton,
              opacity: selectedEdgeIds.length ? 1 : 0.45,
              cursor: selectedEdgeIds.length ? "pointer" : "default",
            }}
          >
            删除选中连线
          </button>
          <button type="button" onClick={resetLayout} style={editorButton}>
            恢复自动布局
          </button>
          {selectedEdge && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                color: COLORS.muted,
                fontSize: 10.5,
              }}
            >
              线条文字（LaTeX）
              <input
                className="nodrag nopan"
                value={selectedEdge.data?.labelTex ?? ""}
                onFocus={beginHistory}
                onChange={(event) =>
                  updateSelectedEdgeLabel(event.target.value)
                }
                onBlur={commitHistory}
                placeholder="例如 Q_{3,1}"
                style={{
                  width: 150,
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 6,
                  padding: "5px 7px",
                  background: COLORS.card,
                  color: COLORS.ink,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Consolas, monospace",
                  fontSize: 10.5,
                }}
              />
            </label>
          )}
          <span
            className="toolbar-hint"
            style={{ color: COLORS.muted, fontSize: 10.5 }}
          >
            拖空白平移 · 边缘缩放 · 端点吸附 · Ctrl+Z / Ctrl+Y
          </span>
        </div>
        <EditHistoryProvider value={historyContext}>
          <CanvasClipContext.Provider value={canvasClip}>
            <ReactFlow
              className="architecture-flow"
              data-render-layer={
                nodes.find((node) => node.id === "input")?.data.layer
              }
              data-render-phase={
                nodes.find((node) => node.id === "input")?.data.phase
              }
              onInit={(instance) => {
                flowRef.current = instance;
              }}
              nodes={nodes}
              edges={edges}
              // 内部数据框的连接必须画在分组背景上方，不能被父框遮掉引入段及箭头。
              defaultEdgeOptions={{ zIndex: 1001 }}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              connectionLineComponent={EditableConnectionLine}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnectStart={(event, params) => {
                if (!params.nodeId) return;
                const pointer =
                  "touches" in event
                    ? (event.touches[0] ?? event.changedTouches[0])
                    : event;
                connectionGestureRef.current = {
                  nodeId: params.nodeId,
                  handleId: params.handleId,
                  x: pointer.clientX,
                  y: pointer.clientY,
                };
              }}
              onConnectEnd={(event) => {
                finishConnection(event);
                const gesture = connectionGestureRef.current;
                const pointer =
                  "touches" in event ? event.changedTouches[0] : event;
                if (
                  gesture &&
                  pointer &&
                  Math.hypot(
                    pointer.clientX - gesture.x,
                    pointer.clientY - gesture.y,
                  ) > 4
                )
                  connectionGestureRef.current = null;
              }}
              onClickConnectStart={(event, params) => {
                if (!params.nodeId) return;
                const pointer =
                  "touches" in event
                    ? (event.touches[0] ?? event.changedTouches[0])
                    : event;
                connectionGestureRef.current = {
                  nodeId: params.nodeId,
                  handleId: params.handleId,
                  x: pointer.clientX,
                  y: pointer.clientY,
                };
                const point = pointerInCanvas(pointer.clientX, pointer.clientY);
                setClickConnectionPreview({
                  fromX: point.x,
                  fromY: point.y,
                  toX: point.x,
                  toY: point.y,
                });
              }}
              onClickConnectEnd={(event) => {
                finishConnection(event);
                setClickConnectionPreview(null);
              }}
              onNodeDragStart={beginHistory}
              onNodeClick={(_, node) =>
                dispatchInspector({ type: "select", nodeId: node.id })
              }
              onNodeDragStop={commitHistory}
              onSelectionDragStart={beginHistory}
              onSelectionDragStop={commitHistory}
              onSelectionChange={handleSelectionChange}
              fitView
              fitViewOptions={FIT_VIEW_OPTIONS}
              minZoom={0.18}
              maxZoom={1.5}
              nodesDraggable
              nodesConnectable
              // [OM-FREEPLAY] 吸附时保持目标边框静止，避免靠近画布边缘时自动平移使落点漂移。
              autoPanOnConnect={false}
              connectOnClick
              nodesFocusable
              edgesFocusable
              edgesReconnectable={false}
              connectionRadius={1}
              connectionMode={ConnectionMode.Loose}
              elementsSelectable
              deleteKeyCode={EDIT_DELETE_KEYS}
              panOnDrag
              panOnScroll
              zoomOnScroll={false}
              zoomOnPinch
              zoomOnDoubleClick
              preventScrolling
              proOptions={{ hideAttribution: true }}
            >
              <ConnectionGestureControl resetRef={resetConnectionRef} />
              <Background color="#d7d2c7" gap={28} size={1} />
              <Controls showInteractive={false} position="top-left" />
            </ReactFlow>
          </CanvasClipContext.Provider>
        </EditHistoryProvider>
        {clickConnectionPreview && (
          <svg
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              zIndex: 7,
              pointerEvents: "none",
              overflow: "visible",
            }}
          >
            <defs>
              <marker
                id="click-connection-arrow"
                viewBox="0 -6 12 12"
                refX="11"
                refY="0"
                markerWidth="10"
                markerHeight="10"
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                <path
                  d="M 1 -5 L 11 0 L 1 5"
                  fill="none"
                  stroke={COLORS.green}
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </marker>
            </defs>
            <path
              d={`M ${clickConnectionPreview.fromX} ${clickConnectionPreview.fromY} L ${clickConnectionPreview.toX} ${clickConnectionPreview.toY}`}
              fill="none"
              stroke={COLORS.green}
              strokeWidth="2.2"
              markerEnd="url(#click-connection-arrow)"
            />
          </svg>
        )}
      </div>
      {inspector.mode === "open" && (
        <ModuleInspector
          data={inspectedData}
          connections={moduleConnections}
          onClose={closeInspector}
        />
      )}
    </div>
  );
}

export const DeepSeekV41Layer: React.FC<Props> = ({ initialLayer = 1 }) => {
  const geometryCache = useMemo<DiagramGeometryCache>(() => new Map(), []);
  const [layer, setLayer] = useState(() =>
    Math.min(40, Math.max(1, Math.round(initialLayer))),
  );
  const [phase, setPhase] = useState<ExecutionPhase>("prefill");
  const mode = modeForLayer(layer);
  return (
    <div
      className="full-layer"
      style={{
        width: "100%",
        height: "100%",
        background: COLORS.paper,
        fontFamily:
          "Inter, PingFang SC, Microsoft YaHei, system-ui, sans-serif",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 样式属于整个图组件，切层不能销毁再插入样式表，使整页公式样式全部失效。 */}
      <style>{`
      .architecture-flow [data-boundary-connectable="true"][data-frame-selected="true"] > :last-child { border-color: ${COLORS.blue} !important; box-shadow: inset 0 0 0 1px ${COLORS.blue} !important; }
      .architecture-flow .react-flow__handle-top { top: 0; }
      .architecture-flow .react-flow__handle-bottom { bottom: 0; }
      .architecture-flow .react-flow__handle-left { left: 0; }
      .architecture-flow .react-flow__handle-right { right: 0; }
      .architecture-flow .react-flow__handle { opacity: 0; z-index: 6; }
      .architecture-flow .react-flow__handle:hover { opacity: 1; }
      .architecture-flow .architecture-resize-handle:hover { opacity: 1 !important; }
      .architecture-flow .architecture-edge-endpoint { opacity: 0; z-index: 1001; }
      .architecture-flow .architecture-edge-endpoint:hover { opacity: 1; }
    `}</style>
      <div
        style={{
          flexShrink: 0,
          zIndex: 10,
          minHeight: 122,
          padding: "18px 22px 14px",
          background: "rgba(255,255,255,.97)",
          borderBottom: `1px solid ${COLORS.line}`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 16,
            marginBottom: 12,
          }}
        >
          <div>
            <strong style={{ fontSize: 21 }}>
              DeepSeek V4.1-Flash · Layer {layer}
            </strong>
            <span
              style={{
                marginLeft: 12,
                color:
                  mode === "full"
                    ? COLORS.green
                    : mode === "reindex"
                      ? COLORS.amber
                      : mode === "reuse"
                        ? COLORS.blue
                        : COLORS.rose,
                fontWeight: 800,
              }}
            >
              {modeLabel(mode)}
            </span>
            <span style={{ marginLeft: 12, fontSize: 13, color: COLORS.blue }}>
              mHC · 4 路{hasEngram(layer) ? " ＋ Engram" : ""}
            </span>
          </div>
          <span
            className="toolbar-hint"
            style={{ color: COLORS.muted, fontSize: 12 }}
          >
            拖空白平移 · 先选择模块定位，再展开阅读
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          {(["prefill", "decode"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={phase === value}
              onClick={() => setPhase(value)}
              style={{
                ...editorButton,
                background: phase === value ? COLORS.green : COLORS.card,
                color: phase === value ? "white" : COLORS.ink,
              }}
            >
              {value === "prefill" ? "Prefill · 整段矩阵" : "Decode · 单步一行"}
            </button>
          ))}
          <span style={{ fontSize: 12, color: COLORS.muted }}>
            {phase === "prefill"
              ? "N 行并行 · t 是其中一个序列位置"
              : "当前 1 行 · t=P+k · 历史 KV 来自缓存"}
          </span>
        </div>
        <div
          className="layer-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(20,1fr)",
            gap: 4,
          }}
        >
          {Array.from({ length: 40 }, (_, i) => i + 1).map((value) => {
            const valueMode = modeForLayer(value);
            const active = value === layer;
            const color =
              valueMode === "full"
                ? COLORS.green
                : valueMode === "reindex"
                  ? COLORS.amber
                  : valueMode === "reuse"
                    ? COLORS.blue
                    : COLORS.rose;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setLayer(value)}
                title={`Layer ${value} · mHC${hasEngram(value) ? " · Engram 查表与注入" : ""}`}
                aria-pressed={active}
                style={{
                  border: `1px solid ${active ? color : COLORS.line}`,
                  background: active ? color : COLORS.card,
                  color: active ? "white" : color,
                  borderRadius: 5,
                  padding: "4px 0",
                  fontWeight: 750,
                  fontSize: 10.5,
                  cursor: "pointer",
                }}
              >
                {value}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <GeometryCacheContext.Provider value={geometryCache}>
          <DiagramCanvas layer={layer} phase={phase} />
        </GeometryCacheContext.Provider>
      </div>
    </div>
  );
};
