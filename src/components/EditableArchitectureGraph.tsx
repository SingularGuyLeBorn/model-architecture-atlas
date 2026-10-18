import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";
import katex from "katex";
import { MathMarkup } from "./MathMarkup";
import { DATA_WIRE_WIDTH } from "./diagram-appearance";
import {
  labelRegistry,
  layoutEdgeLabels,
  labelBounds,
  type LabelPlacement,
} from "./edge-label-layout";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  NodeResizeControl,
  Position,
  ResizeControlVariant,
  useStore,
  useReactFlow,
  useStoreApi,
  type Edge,
  type EdgeMarker,
  type EdgeProps,
  type ConnectionLineComponentProps,
  type Node,
  type InternalNode,
  type NodeChange,
  type XYPosition,
} from "@xyflow/react";

export type EditableEdgeData = {
  labelTex?: string;
  waypoints?: XYPosition[];
  color?: string;
  sourceAnchor?: BoundaryAnchor;
  targetAnchor?: BoundaryAnchor;
  labelPosition?: number;
  terminalLabelPosition?: number;
};

// [OM-FREEPLAY] 24×24 的 marker 视口对应约 6×10px 的开口箭头，含描边仍小于
// 16px 线间距与 24px 端口引入段。使用世界坐标，选中加粗不能把箭头一起撑大。
export function architectureArrowMarker(color = "#37685a"): EdgeMarker {
  return {
    type: MarkerType.Arrow,
    markerUnits: "userSpaceOnUse",
    width: 24,
    height: 24,
    strokeWidth: 1.8,
    color,
  };
}

export type BoundaryAnchor = { side: Position; offset: number };
export type BoundaryConnection = { nodeId: string; anchor: BoundaryAnchor };

// 手工接线只落在边的中点或等分点，不允许端点贴在四角。
export const snapBoundaryOffset = (offset: number) =>
  Math.max(1, Math.min(3, Math.round(offset * 4))) / 4;

// [OM-FREEPLAY] 24 屏幕像素作为边缘吸附距离，缩放后仍保持相同的鼠标容差。
const BOUNDARY_SNAP_RADIUS = 24;
// [OM-FREEPLAY] 拐角处保留 4px 换边迟滞，避免鼠标微抖时在两条边之间反复切换。
const BOUNDARY_SIDE_HYSTERESIS = 4;

export function findBoundaryConnection(
  scope: HTMLElement,
  pointer: XYPosition,
  excludedNode?: string,
  preferred?: { nodeId: string; side: Position },
): BoundaryConnection | null {
  const candidates: Array<
    BoundaryConnection & { distance: number; area: number }
  > = [];
  for (const element of Array.from(
    scope.querySelectorAll<HTMLElement>(".react-flow__node"),
  )) {
    const nodeId = element.dataset.id;
    if (
      !nodeId ||
      nodeId === excludedNode ||
      !element.querySelector('[data-boundary-connectable="true"]')
    )
      continue;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const sides = [
      Position.Top,
      Position.Right,
      Position.Bottom,
      Position.Left,
    ];
    const nodeCandidates: typeof candidates = [];
    for (const side of sides) {
      const horizontal = side === Position.Top || side === Position.Bottom;
      const offset = Math.max(
        0,
        Math.min(
          1,
          horizontal
            ? (pointer.x - rect.left) / rect.width
            : (pointer.y - rect.top) / rect.height,
        ),
      );
      const x = horizontal
        ? rect.left + offset * rect.width
        : side === Position.Left
          ? rect.left
          : rect.right;
      const y = horizontal
        ? side === Position.Top
          ? rect.top
          : rect.bottom
        : rect.top + offset * rect.height;
      const distance = Math.hypot(pointer.x - x, pointer.y - y);
      if (distance <= BOUNDARY_SNAP_RADIUS)
        nodeCandidates.push({
          nodeId,
          anchor: { side, offset: snapBoundaryOffset(offset) },
          distance,
          area: rect.width * rect.height,
        });
    }
    nodeCandidates.sort((a, b) => a.distance - b.distance);
    const nearest = nodeCandidates[0];
    const previousSide =
      preferred?.nodeId === nodeId
        ? nodeCandidates.find(
            (candidate) => candidate.anchor.side === preferred.side,
          )
        : undefined;
    if (nearest)
      candidates.push(
        previousSide &&
          previousSide.distance <= nearest.distance + BOUNDARY_SIDE_HYSTERESIS
          ? previousSide
          : nearest,
      );
  }
  candidates.sort((a, b) => a.distance - b.distance || a.area - b.area);
  return candidates[0] ?? null;
}

export type EditableEdge = Edge<EditableEdgeData, "editable-orthogonal">;

type EditHistoryContextValue = {
  beginHistory: () => void;
  commitHistory: () => void;
  setEdges: Dispatch<SetStateAction<EditableEdge[]>>;
};

/** 原生拖动回调在本次输入内提交受控坐标，避免经过被动 effect 多等一帧。
 * 普通测量、初始化及程序化改图仍走批处理，不能在 React 生命周期内 flush。
 */
export function applyInteractiveNodeChanges<N extends Node>(
  changes: NodeChange<N>[],
  apply: (changes: NodeChange<N>[]) => void,
) {
  const gesture = changes.some(
    (change) =>
      (change.type === "position" && change.dragging !== undefined) ||
      (change.type === "dimensions" && change.resizing !== undefined),
  );
  if (gesture) flushSync(() => apply(changes));
  else apply(changes);
}

const EditHistoryContext = createContext<EditHistoryContextValue | null>(null);

export function EditHistoryProvider({
  value,
  children,
}: {
  value: EditHistoryContextValue;
  children: ReactNode;
}) {
  return (
    <EditHistoryContext.Provider value={value}>
      {children}
    </EditHistoryContext.Provider>
  );
}

export function ConnectionGestureControl({
  resetRef,
}: {
  resetRef: RefObject<(() => void) | null>;
}) {
  const store = useStoreApi();
  useEffect(() => {
    resetRef.current = () => {
      store.setState({ connectionClickStartHandle: null });
      store.getState().cancelConnection();
    };
    return () => {
      resetRef.current = null;
    };
  }, [resetRef, store]);
  return null;
}

const RESIZE_POSITIONS = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
] as const;

const PORTS = [
  { id: "top-left", position: Position.Top, style: { left: "20%" } },
  { id: "top", position: Position.Top, style: { left: "40%" } },
  { id: "top-60", position: Position.Top, style: { left: "60%" } },
  { id: "top-right", position: Position.Top, style: { left: "80%" } },
  { id: "right-20", position: Position.Right, style: { top: "20%" } },
  { id: "right", position: Position.Right, style: { top: "40%" } },
  { id: "right-60", position: Position.Right, style: { top: "60%" } },
  { id: "right-80", position: Position.Right, style: { top: "80%" } },
  { id: "bottom-right", position: Position.Bottom, style: { left: "80%" } },
  { id: "bottom", position: Position.Bottom, style: { left: "60%" } },
  { id: "bottom-40", position: Position.Bottom, style: { left: "40%" } },
  { id: "bottom-left", position: Position.Bottom, style: { left: "20%" } },
  { id: "left-20", position: Position.Left, style: { top: "20%" } },
  { id: "left-40", position: Position.Left, style: { top: "40%" } },
  { id: "left", position: Position.Left, style: { top: "60%" } },
  { id: "left-80", position: Position.Left, style: { top: "80%" } },
] as const;

const resizeHandleStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 3,
  border: "1.5px solid #fffefa",
  background: "#37685a",
};

function EightResizeHandlesView({
  minWidth,
  minHeight,
}: {
  minWidth: number;
  minHeight: number;
}) {
  return (
    <>
      {(["top", "right", "bottom", "left"] as const).map((position) => (
        <NodeResizeControl
          key={`edge-${position}`}
          position={position}
          variant={ResizeControlVariant.Line}
          className="architecture-resize-edge"
          minWidth={minWidth}
          minHeight={minHeight}
          style={{
            border: 0,
            background: "transparent",
            zIndex: 3,
            ...(position === "top" || position === "bottom"
              ? { height: 8 }
              : { width: 8 }),
          }}
        />
      ))}
      {RESIZE_POSITIONS.map((position) => (
        <NodeResizeControl
          key={position}
          position={position}
          variant={ResizeControlVariant.Handle}
          className="architecture-resize-handle"
          minWidth={minWidth}
          minHeight={minHeight}
          style={{ ...resizeHandleStyle, opacity: 0, zIndex: 4 }}
        />
      ))}
    </>
  );
}

// 拖动只改变节点坐标；尺寸约束未变时无需重建八个缩放控件。
export const EightResizeHandles = memo(EightResizeHandlesView);

function DelayedConnectionPort({
  id,
  position,
  style,
  color,
}: {
  id: string;
  position: Position;
  style: CSSProperties;
  color: string;
}) {
  const [ready, setReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => cancelTimer, []);
  return (
    <Handle
      id={`port-${id}`}
      type="source"
      position={position}
      aria-label={`在 ${id} 边界位置新增连线`}
      onPointerEnter={() => {
        cancelTimer();
        timerRef.current = setTimeout(() => setReady(true), 500);
      }}
      onPointerLeave={() => {
        cancelTimer();
        setReady(false);
      }}
      style={{
        width: 18,
        height: 18,
        border: 0,
        background: "transparent",
        display: "grid",
        placeItems: "center",
        ...style,
        [position]: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: `1.5px solid ${color}`,
          background: "#fffefa",
          color,
          display: "grid",
          placeItems: "center",
          fontSize: 14,
          fontWeight: 900,
          lineHeight: 1,
          opacity: ready ? 1 : 0,
          transform: ready ? "scale(1)" : "scale(.7)",
          transition: "opacity 120ms ease, transform 120ms ease",
          pointerEvents: "none",
          boxShadow: "0 1px 5px rgba(42,41,36,.18)",
        }}
      >
        +
      </span>
    </Handle>
  );
}

function EightConnectionPortsView({ color = "#37685a" }: { color?: string }) {
  return (
    <>
      {PORTS.map((port) => (
        <DelayedConnectionPort
          key={port.id}
          id={port.id}
          position={port.position}
          style={port.style}
          color={color}
        />
      ))}
    </>
  );
}

// 端口仍保留自己的连接状态订阅，父节点移动不重复渲染固定端口样式。
export const EightConnectionPorts = memo(EightConnectionPortsView);

export function EditableConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
}: ConnectionLineComponentProps) {
  return (
    <g>
      <defs>
        <marker
          id="editable-connection-arrow"
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
            stroke="#37685a"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </marker>
      </defs>
      <path
        d={`M ${fromX} ${fromY} L ${toX} ${toY}`}
        fill="none"
        stroke="#37685a"
        strokeWidth="2.2"
        markerEnd="url(#editable-connection-arrow)"
      />
    </g>
  );
}

// [OM-FREEPLAY] 4096 条 LRU 覆盖当前层公式，限制跨层浏览的缓存增长。
const formulaHtmlCache = new Map<string, string>();
export function latexHtml(tex: string, display = false) {
  const key = `${display ? "display" : "inline"}:${tex}`;
  const cached = formulaHtmlCache.get(key);
  if (cached !== undefined) {
    formulaHtmlCache.delete(key);
    formulaHtmlCache.set(key, cached);
    return cached;
  }
  // 交互图使用浏览器原生 MathML，保留公式语义与 TeX 注释，避免每个字形生成多层 HTML 排版盒。
  const html = katex.renderToString(tex, {
    output: "mathml",
    displayMode: display,
    throwOnError: false,
    strict: false,
  });
  formulaHtmlCache.set(key, html);
  if (formulaHtmlCache.size > 4096)
    formulaHtmlCache.delete(formulaHtmlCache.keys().next().value!);
  return html;
}

type Obstacle = { left: number; top: number; right: number; bottom: number };
type ReservedSegment = { start: XYPosition; end: XYPosition };

// [OM-FREEPLAY] 24px 端口引出段；44px 框外净空容纳带上下标的变量标签。
const EDGE_PORT_LEAD = 24;
const EDGE_NODE_CLEARANCE = 44;
// [OM-FREEPLAY] 44px 中心线间距兼顾横线的上下标高度与竖线的变量半宽，避免邻线穿字。
const EDGE_LANE_GAP = 44;
// 连线变量显著大于图内普通说明文字（13–16px）；主标签与箭头处复述共用字号。
const EDGE_LABEL_FONT_SIZE = 20;

export function architectureFanoutGap(branches: number) {
  return (
    2 * EDGE_PORT_LEAD +
    Math.max(0, branches - 1) * EDGE_LANE_GAP +
    EDGE_NODE_CLEARANCE
  );
}

function segmentCrossesObstacle(
  start: XYPosition,
  end: XYPosition,
  obstacle: Obstacle,
) {
  if (Math.abs(start.x - end.x) < 0.5) {
    const low = Math.min(start.y, end.y);
    const high = Math.max(start.y, end.y);
    return (
      start.x > obstacle.left &&
      start.x < obstacle.right &&
      high > obstacle.top &&
      low < obstacle.bottom
    );
  }
  if (Math.abs(start.y - end.y) < 0.5) {
    const low = Math.min(start.x, end.x);
    const high = Math.max(start.x, end.x);
    return (
      start.y > obstacle.top &&
      start.y < obstacle.bottom &&
      high > obstacle.left &&
      low < obstacle.right
    );
  }
  return true;
}

export function simplifyOrthogonalPoints(points: XYPosition[]) {
  // 先去重再判断共线：在 [A,B,B,C] 上同时过滤会删掉两个 B，把直角变成斜线。
  const distinct = points.filter(
    (point, index) =>
      index === 0 ||
      point.x !== points[index - 1].x ||
      point.y !== points[index - 1].y,
  );
  return distinct.filter((point, index) => {
    if (index === 0 || index === distinct.length - 1) return true;
    const before = distinct[index - 1];
    const after = distinct[index + 1];
    // 同向共线才可合并；端口引入段发生折返时必须保留，保证箭头沿新边法向进入。
    return !(
      (before.x === point.x &&
        point.x === after.x &&
        (point.y - before.y) * (after.y - point.y) >= 0) ||
      (before.y === point.y &&
        point.y === after.y &&
        (point.x - before.x) * (after.x - point.x) >= 0)
    );
  });
}

function hasRouteBacktrack(
  points: XYPosition[],
  source?: XYPosition,
  target?: XYPosition,
) {
  let before: XYPosition | undefined,
    point = source;
  const visit = (after: XYPosition) => {
    if (point && point.x === after.x && point.y === after.y) return false;
    if (
      before &&
      point &&
      (point.x - before.x) * (after.x - point.x) +
        (point.y - before.y) * (after.y - point.y) <
        0
    )
      return true;
    before = point;
    point = after;
    return false;
  };
  for (const next of points) if (visit(next)) return true;
  return target ? visit(target) : false;
}

export function sharedRouteLength(first: XYPosition[], second: XYPosition[]) {
  let total = 0;
  for (let a = 0; a < first.length - 1; a += 1)
    for (let b = 0; b < second.length - 1; b += 1) {
      const p = first[a],
        q = first[a + 1],
        r = second[b],
        s = second[b + 1];
      if (p.y === q.y && r.y === s.y && Math.abs(p.y - r.y) < 0.5)
        total += Math.max(
          0,
          Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x)) -
            Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x)),
        );
      if (p.x === q.x && r.x === s.x && Math.abs(p.x - r.x) < 0.5)
        total += Math.max(
          0,
          Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) -
            Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y)),
        );
    }
  return total;
}

function routeComplexityScore(pointCount: number, length: number) {
  // 已合并同向共线点；无碰撞、无拥挤时先比较折点，长度只用于同折点数的择优。
  return pointCount * 8 + length / (1 + length);
}

function routeScore(
  points: XYPosition[],
  obstacles: Obstacle[],
  reserved: ReservedSegment[],
  upperBound = Infinity,
  completePoints = points,
  cache?: { obstacles: Map<string, number>; wires: Map<string, number> },
) {
  let crossings = 0;
  let crowding = 0;
  let length = 0;
  for (let index = 1; index < points.length; index++)
    length +=
      Math.abs(points[index].x - points[index - 1].x) +
      Math.abs(points[index].y - points[index - 1].y);
  // 长度与折点已经给出成本下界；劣于当前解的候选无需再逐个检查全图障碍。
  const complexity = routeComplexityScore(completePoints.length, length);
  if (complexity >= upperBound) return Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const key = `${Math.min(start.x, end.x)},${Math.min(start.y, end.y)},${Math.max(start.x, end.x)},${Math.max(start.y, end.y)}`;
    const known = cache?.obstacles.get(key);
    if (known !== undefined) {
      crossings += known;
      if (crossings * 100_000_000 + crowding + complexity >= upperBound)
        return Infinity;
      continue;
    }
    const before = crossings;
    // 所有代价非负：一旦不可能优于已有路线，停止检查剩余障碍和线段；评分规则不变。
    for (const obstacle of obstacles) {
      if (segmentCrossesObstacle(start, end, obstacle)) crossings += 1;
      if (
        !cache &&
        crossings * 100_000_000 + crowding + complexity >= upperBound
      )
        return Infinity;
    }
    cache?.obstacles.set(key, crossings - before);
    if (crossings * 100_000_000 + crowding + complexity >= upperBound)
      return Infinity;
  }
  // 端口引入段允许穿出自己的框，但仍须避让其他导线，不能只给框外中段计拥挤成本。
  for (let index = 0; index < completePoints.length - 1; index += 1) {
    const start = completePoints[index],
      end = completePoints[index + 1];
    const horizontal = start.y === end.y;
    const key = `${Math.min(start.x, end.x)},${Math.min(start.y, end.y)},${Math.max(start.x, end.x)},${Math.max(start.y, end.y)}`;
    const known = cache?.wires.get(key);
    if (known !== undefined) {
      crowding += known;
      if (crossings * 100_000_000 + crowding + complexity >= upperBound)
        return Infinity;
      continue;
    }
    const before = crowding;
    for (const segment of reserved) {
      const otherHorizontal = segment.start.y === segment.end.y;
      if (horizontal === otherHorizontal) {
        const separation = Math.abs(
          horizontal ? start.y - segment.start.y : start.x - segment.start.x,
        );
        const overlap = horizontal
          ? Math.min(
              Math.max(start.x, end.x),
              Math.max(segment.start.x, segment.end.x),
            ) -
            Math.max(
              Math.min(start.x, end.x),
              Math.min(segment.start.x, segment.end.x),
            )
          : Math.min(
              Math.max(start.y, end.y),
              Math.max(segment.start.y, segment.end.y),
            ) -
            Math.max(
              Math.min(start.y, end.y),
              Math.min(segment.start.y, segment.end.y),
            );
        if (overlap > 0 && separation < EDGE_LANE_GAP)
          crowding += overlap * (EDGE_LANE_GAP - separation) * 100;
      } else if (
        segmentCrossesObstacle(start, end, {
          left: Math.min(segment.start.x, segment.end.x) - 0.1,
          right: Math.max(segment.start.x, segment.end.x) + 0.1,
          top: Math.min(segment.start.y, segment.end.y) - 0.1,
          bottom: Math.max(segment.start.y, segment.end.y) + 0.1,
        })
      )
        crowding += 800;
      if (
        !cache &&
        crossings * 100_000_000 + crowding + complexity >= upperBound
      )
        return Infinity;
    }
    cache?.wires.set(key, crowding - before);
    if (crossings * 100_000_000 + crowding + complexity >= upperBound)
      return Infinity;
  }
  return crossings * 100_000_000 + crowding + complexity;
}

function defaultOrthogonalPoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  obstacles: Obstacle[],
  reserved: ReservedSegment[],
  ports?: { source: XYPosition; target: XYPosition },
) {
  const middleY = sourceY + (targetY - sourceY) / 2;
  const middleX = sourceX + (targetX - sourceX) / 2;
  const clearance = EDGE_NODE_CLEARANCE;
  const nearby = obstacles.filter(
    (obstacle) =>
      obstacle.right >= Math.min(sourceX, targetX) - clearance &&
      obstacle.left <= Math.max(sourceX, targetX) + clearance &&
      obstacle.bottom >= Math.min(sourceY, targetY) - clearance &&
      obstacle.top <= Math.max(sourceY, targetY) + clearance,
  );
  const top =
    Math.min(sourceY, targetY, ...nearby.map((item) => item.top)) - clearance;
  const bottom =
    Math.max(sourceY, targetY, ...nearby.map((item) => item.bottom)) +
    clearance;
  const left =
    Math.min(sourceX, targetX, ...nearby.map((item) => item.left)) - clearance;
  const right =
    Math.max(sourceX, targetX, ...nearby.map((item) => item.right)) + clearance;
  const laneOffsets = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(
    (value) => value * EDGE_LANE_GAP,
  );
  const horizontalChannels = [
    ...new Set([
      sourceY,
      targetY,
      top,
      bottom,
      ...laneOffsets.map((offset) => middleY + offset),
      ...nearby.flatMap((item) => [item.top, item.bottom]),
      ...reserved
        .filter((segment) => segment.start.y === segment.end.y)
        .flatMap((segment) => [
          segment.start.y - EDGE_LANE_GAP,
          segment.start.y + EDGE_LANE_GAP,
        ]),
    ]),
  ];
  const verticalChannels = [
    ...new Set([
      sourceX,
      targetX,
      left,
      right,
      ...laneOffsets.map((offset) => middleX + offset),
      ...nearby.flatMap((item) => [item.left, item.right]),
      ...reserved
        .filter((segment) => segment.start.x === segment.end.x)
        .flatMap((segment) => [
          segment.start.x - EDGE_LANE_GAP,
          segment.start.x + EDGE_LANE_GAP,
        ]),
    ]),
  ];
  const candidates: XYPosition[][] = [
    [
      { x: sourceX, y: sourceY },
      { x: sourceX, y: middleY },
      { x: targetX, y: middleY },
      { x: targetX, y: targetY },
    ],
    [
      { x: sourceX, y: sourceY },
      { x: middleX, y: sourceY },
      { x: middleX, y: targetY },
      { x: targetX, y: targetY },
    ],
    ...horizontalChannels.map((channelY) => [
      { x: sourceX, y: sourceY },
      { x: sourceX, y: channelY },
      { x: targetX, y: channelY },
      { x: targetX, y: targetY },
    ]),
    ...verticalChannels.map((channelX) => [
      { x: sourceX, y: sourceY },
      { x: channelX, y: sourceY },
      { x: channelX, y: targetY },
      { x: targetX, y: targetY },
    ]),
  ];
  // 起终点附近的窄通道不能被中点附近的候选挤掉。
  const nearChannels = (channels: number[], start: number, end: number) => [
    ...new Set(
      [start, (start + end) / 2, end].flatMap((center) =>
        channels
          .filter(
            (value) =>
              value >= Math.min(start, end) - clearance &&
              value <= Math.max(start, end) + clearance,
          )
          .sort((a, b) => Math.abs(a - center) - Math.abs(b - center))
          .slice(0, 10),
      ),
    ),
  ];
  // 宽分组可能包住起终点之间的所有通道；多折路线必须保留外侧绕行候选。
  // 只在起终点坐标区间内组合，会迫使跨越 Engram 的残差权重线穿框。
  const nearX = [
    ...new Set([
      left,
      right,
      ...nearby.flatMap((item) => [item.left, item.right]),
      ...nearChannels(verticalChannels, sourceX, targetX),
    ]),
  ];
  const nearY = [
    ...new Set([
      top,
      bottom,
      ...nearby.flatMap((item) => [item.top, item.bottom]),
      ...nearChannels(horizontalChannels, sourceY, targetY),
    ]),
  ];
  let best = candidates[0];
  let bestScore = Infinity;
  // 候选路线大量复用相同线段；一次搜索内障碍不变，每条无向线段只评分一次。
  // 缓存不跨搜索共享，移动节点或改路后不会复用过期碰撞结果。
  const costs = {
    obstacles: new Map<string, number>(),
    wires: new Map<string, number>(),
  };
  const consider = (candidate: XYPosition[]) => {
    // 无效折返先在线性扫描中拒绝，不为大量被拒候选创建两份临时数组。
    if (hasRouteBacktrack(candidate, ports?.source, ports?.target)) return;
    const points = simplifyOrthogonalPoints(candidate);
    // 端口引入段也是路径约束：禁止先越过引入点，再沿原线倒车形成箭头尾刺。
    // 在候选阶段拒绝，不能事后删点破坏落线方向或用户保存的折点。
    const complete = ports
      ? simplifyOrthogonalPoints([ports.source, ...points, ports.target])
      : points;
    // 折点按实际出线到落线的完整路径计算，端口引出段不能在评分时被漏掉。
    // 避障仍检查框外中段，首尾引出段允许穿出自身所属框。
    const score = routeScore(
      points,
      obstacles,
      reserved,
      bestScore,
      complete,
      costs,
    );
    if (score < bestScore) {
      best = points;
      bestScore = score;
    }
  };
  for (const candidate of candidates) consider(candidate);
  const minimumScore = routeComplexityScore(
    sourceX === targetX || sourceY === targetY ? 2 : 3,
    Math.abs(sourceX - targetX) + Math.abs(sourceY - targetY),
  );
  if (bestScore <= minimumScore) return best;
  for (const x of nearX)
    for (const y of nearY) {
      const minimumLength =
        Math.abs(sourceX - x) +
        Math.abs(x - targetX) +
        Math.abs(sourceY - y) +
        Math.abs(y - targetY);
      if (routeComplexityScore(2, minimumLength) >= bestScore) continue;
      consider([
        { x: sourceX, y: sourceY },
        { x: sourceX, y },
        { x, y },
        { x, y: targetY },
        { x: targetX, y: targetY },
      ]);
      consider([
        { x: sourceX, y: sourceY },
        { x, y: sourceY },
        { x, y },
        { x: targetX, y },
        { x: targetX, y: targetY },
      ]);
    }
  // 两端已有扇出通道时，出线高度和入线高度必须能独立选择。
  // 只枚举一个 y 会迫使一端与已有线重叠，即使另一条空闲通道就在旁边。
  if (bestScore >= 800) {
    const nearest = (
      channels: number[],
      coordinate: number,
      direction: number,
      currentBends: number[],
    ) => [
      ...new Set([
        // 两端各保留一条完整线间距的扇出通道；多个框边界挤在端点附近时，
        // 最近四个数值不一定包含可与已有横线/竖线分开的通道。
        ...[coordinate - EDGE_LANE_GAP, coordinate + EDGE_LANE_GAP].filter(
          (value) => !direction || (value - coordinate) * direction >= 0,
        ),
        ...[...channels]
          // 先排除会让端口倒车的候选，再取最近通道，避免扩大组合搜索。
          .filter(
            (value) => !direction || (value - coordinate) * direction >= 0,
          )
          .sort((a, b) => Math.abs(a - coordinate) - Math.abs(b - coordinate))
          .slice(0, 4),
        // 已找到路线的远端转弯也是有效通道；只取最近四条会丢掉绕过宽模块的入口。
        ...currentBends.filter(
          (value) => !direction || (value - coordinate) * direction >= 0,
        ),
      ]),
    ];
    const exitYs = nearest(
        horizontalChannels,
        sourceY,
        ports ? Math.sign(sourceY - ports.source.y) : 0,
        best.map((point) => point.y),
      ),
      entryYs = nearest(
        horizontalChannels,
        targetY,
        ports ? Math.sign(targetY - ports.target.y) : 0,
        best.map((point) => point.y),
      ),
      exitXs = nearest(
        verticalChannels,
        sourceX,
        ports ? Math.sign(sourceX - ports.source.x) : 0,
        best.map((point) => point.x),
      ),
      entryXs = nearest(
        verticalChannels,
        targetX,
        ports ? Math.sign(targetX - ports.target.x) : 0,
        best.map((point) => point.x),
      );
    for (const x of nearX)
      for (const exitY of exitYs)
        for (const entryY of entryYs)
          consider([
            { x: sourceX, y: sourceY },
            { x: sourceX, y: exitY },
            { x, y: exitY },
            { x, y: entryY },
            { x: targetX, y: entryY },
            { x: targetX, y: targetY },
          ]);
    for (const y of nearY)
      for (const exitX of exitXs)
        for (const entryX of entryXs)
          consider([
            { x: sourceX, y: sourceY },
            { x: exitX, y: sourceY },
            { x: exitX, y },
            { x: entryX, y },
            { x: entryX, y: targetY },
            { x: targetX, y: targetY },
          ]);
  }
  return best;
}

function pointsWithAnchoredEndpoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  waypoints: XYPosition[],
) {
  const adjusted = waypoints.map((point) => ({ ...point }));
  if (adjusted.length === 1) {
    adjusted[0] = { x: sourceX, y: adjusted[0].y };
    adjusted.push({ x: targetX, y: adjusted[0].y });
  } else if (adjusted.length >= 2) {
    const first = adjusted[0];
    const second = adjusted[1];
    const firstOutgoingHorizontal =
      Math.abs(second.x - first.x) >= Math.abs(second.y - first.y);
    adjusted[0] = firstOutgoingHorizontal
      ? { x: sourceX, y: first.y }
      : { x: first.x, y: sourceY };

    const lastIndex = adjusted.length - 1;
    const beforeLast = adjusted[lastIndex - 1];
    const last = adjusted[lastIndex];
    const lastIncomingHorizontal =
      Math.abs(last.x - beforeLast.x) >= Math.abs(last.y - beforeLast.y);
    adjusted[lastIndex] = lastIncomingHorizontal
      ? { x: targetX, y: last.y }
      : { x: last.x, y: targetY };
  }
  return [{ x: sourceX, y: sourceY }, ...adjusted, { x: targetX, y: targetY }];
}

// 人工路径中的原路往返没有连接语义。先消去重走部分，再校验端口方向；
// 自动路由仍使用保留折返的化简函数，以便候选校验拒绝非法路线。
function removeManualRetraces(points: XYPosition[]) {
  const result: XYPosition[] = [];
  for (const point of points) {
    if (result.at(-1)?.x === point.x && result.at(-1)?.y === point.y) continue;
    while (result.length > 1) {
      const a = result.at(-2)!,
        b = result.at(-1)!;
      if (
        !((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))
      )
        break;
      result.pop();
    }
    if (result.at(-1)?.x !== point.x || result.at(-1)?.y !== point.y)
      result.push(point);
  }
  return result;
}

function withDirectedDeparture(points: XYPosition[], side: Position) {
  const source = points[0],
    next = points[1];
  if (!next) return points;
  const departure = portLeadPoint(source.x, source.y, side);
  const vertical = side === Position.Top || side === Position.Bottom;
  const normalAligned = vertical ? next.x === source.x : next.y === source.y;
  const outward =
    (next.x - source.x) * (departure.x - source.x) +
    (next.y - source.y) * (departure.y - source.y);
  // 合法首段原样保留，包括窄间隙内的直连；不能每次编辑都重插引出段。
  if (normalAligned && outward > 0) return points;

  const target = points.at(-1)!;
  const normal = {
    x: (departure.x - source.x) / EDGE_PORT_LEAD,
    y: (departure.y - source.y) / EDGE_PORT_LEAD,
  };
  const gap =
    (target.x - source.x) * normal.x + (target.y - source.y) * normal.y;
  // [OM-FREEPLAY] 窄间隙内新接入段至多占法向间距的三分之一，给两端转弯和中段分别留空间。
  if (gap > 0) {
    const lead = Math.min(EDGE_PORT_LEAD, gap / 3);
    departure.x = source.x + normal.x * lead;
    departure.y = source.y + normal.y * lead;
  }

  // 横移端点相邻线段时，替换旧接入折点。保留旧点再补 elbow 会先走过头
  // 又沿原线倒退，形成看似额外分支的尾刺。错误方向的首段连同下一折点替换。
  const body = points.slice(Math.min(normalAligned ? 3 : 2, points.length - 1));
  const join = body[0];
  const elbow = vertical
    ? { x: join.x, y: departure.y }
    : { x: departure.x, y: join.y };
  return simplifyOrthogonalPoints([source, departure, elbow, ...body]);
}

export function manualOrthogonalPoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
  waypoints: XYPosition[],
) {
  const anchored = removeManualRetraces(
    pointsWithAnchoredEndpoints(sourceX, sourceY, targetX, targetY, waypoints),
  );
  const fromSource = withDirectedDeparture(anchored, sourcePosition);
  return withDirectedDeparture(
    [...fromSource].reverse(),
    targetPosition,
  ).reverse();
}

function portLeadPoint(x: number, y: number, position: Position) {
  if (position === Position.Top) return { x, y: y - EDGE_PORT_LEAD };
  if (position === Position.Bottom) return { x, y: y + EDGE_PORT_LEAD };
  if (position === Position.Left) return { x: x - EDGE_PORT_LEAD, y };
  return { x: x + EDGE_PORT_LEAD, y };
}

export function automaticOrthogonalPoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
  obstacles: Obstacle[],
  reserved: ReservedSegment[] = [],
  sourceFrames: Obstacle[] = [],
  targetFrames: Obstacle[] = [],
  previous?: XYPosition[],
) {
  // 对齐且相向的端口无需转折；两端安全区只约束转折位置，不能制造窄 U 形绕路。
  const direct = [
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
  ];
  const facing =
    (sourceY === targetY &&
      ((sourcePosition === Position.Right &&
        targetPosition === Position.Left &&
        targetX > sourceX) ||
        (sourcePosition === Position.Left &&
          targetPosition === Position.Right &&
          targetX < sourceX))) ||
    (sourceX === targetX &&
      ((sourcePosition === Position.Bottom &&
        targetPosition === Position.Top &&
        targetY > sourceY) ||
        (sourcePosition === Position.Top &&
          targetPosition === Position.Bottom &&
          targetY < sourceY)));
  const unrelated = obstacles.filter(
    (frame) => !sourceFrames.includes(frame) && !targetFrames.includes(frame),
  );
  if (
    facing &&
    routeScore(direct, unrelated, reserved) === routeScore(direct, [], [])
  )
    return direct;
  // 内部端口先沿法向穿出自己的分组安全区，不能在外框边缘转弯。
  const outsideFrames = (
    x: number,
    y: number,
    side: Position,
    frames: Obstacle[],
  ) => {
    const lead = portLeadPoint(x, y, side);
    for (const frame of frames) {
      if (side === Position.Right) lead.x = Math.max(lead.x, frame.right);
      if (side === Position.Left) lead.x = Math.min(lead.x, frame.left);
      if (side === Position.Bottom) lead.y = Math.max(lead.y, frame.bottom);
      if (side === Position.Top) lead.y = Math.min(lead.y, frame.top);
    }
    return lead;
  };
  const departure = outsideFrames(
    sourceX,
    sourceY,
    sourcePosition,
    sourceFrames,
  );
  const approach = outsideFrames(
    targetX,
    targetY,
    targetPosition,
    targetFrames,
  );
  // 连续拖动先延用旧通道，只调整两端。不得穿框、增加线间冲突或倒转端口方向；
  // 通道失效才重新搜索，不能为每个像素枚举整张图的所有候选。
  if (previous && previous.length > 2) {
    const body = simplifyOrthogonalPoints(
      pointsWithAnchoredEndpoints(
        departure.x,
        departure.y,
        approach.x,
        approach.y,
        previous.slice(1, -1),
      ),
    );
    const complete = simplifyOrthogonalPoints([
      { x: sourceX, y: sourceY },
      ...body,
      { x: targetX, y: targetY },
    ]);
    const cost = routeScore(body, [], [], Infinity, complete);
    const wireCost = routeScore(body, [], reserved, Infinity, complete) - cost;
    const oldBody = previous.slice(1, -1);
    const oldWireCost =
      routeScore(oldBody, [], reserved, Infinity, previous) -
      routeScore(oldBody, [], [], Infinity, previous);
    if (
      !hasRouteBacktrack(complete) &&
      routeScore(body, obstacles, []) === routeScore(body, [], []) &&
      wireCost <= oldWireCost
    )
      return complete;
  }
  const routedBody = defaultOrthogonalPoints(
    departure.x,
    departure.y,
    approach.x,
    approach.y,
    obstacles,
    reserved,
    { source: { x: sourceX, y: sourceY }, target: { x: targetX, y: targetY } },
  );
  return simplifyOrthogonalPoints([
    { x: sourceX, y: sourceY },
    ...routedBody,
    { x: targetX, y: targetY },
  ]);
}

function pathFromPoints(points: XYPosition[]) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

// 直接在标签矩形内断开描边，保留透明标签；不为跨越整张图的长边分配巨大 SVG mask。
export function pathWithLabelGap(
  points: XYPosition[],
  gap?: Obstacle | Obstacle[],
) {
  if (!gap) return pathFromPoints(points);
  const gaps = Array.isArray(gap) ? gap : [gap];
  const pieces: string[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1],
      b = points[i];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const cuts = gaps
      .flatMap((rect) => {
        let enter = 0,
          leave = 1;
        for (const [start, delta, low, high] of [
          [a.x, dx, rect.left, rect.right],
          [a.y, dy, rect.top, rect.bottom],
        ]) {
          if (!delta) {
            if (start < low || start > high) return [];
          } else {
            const first = (low - start) / delta,
              last = (high - start) / delta;
            enter = Math.max(enter, Math.min(first, last));
            leave = Math.min(leave, Math.max(first, last));
          }
        }
        return enter < leave ? [{ enter, leave }] : [];
      })
      .sort((a, b) => a.enter - b.enter);
    const segment = (from: number, to: number) =>
      pieces.push(
        `M ${a.x + dx * from} ${a.y + dy * from} L ${a.x + dx * to} ${a.y + dy * to}`,
      );
    let cursor = 0;
    for (const cut of cuts) {
      if (cut.enter > cursor) segment(cursor, cut.enter);
      cursor = Math.max(cursor, cut.leave);
    }
    if (cursor < 1) segment(cursor, 1);
  }
  return pieces.join(" ");
}

function longestSegmentCenter(points: XYPosition[]) {
  let best = { x: points[0].x, y: points[0].y, length: -1 };
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    if (length > best.length) {
      best = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
        length,
      };
    }
  }
  return best;
}

export function projectLabelOntoPath(
  points: XYPosition[],
  pointer: XYPosition,
) {
  const lengths = points
    .slice(1)
    .map((point, index) =>
      Math.hypot(point.x - points[index].x, point.y - points[index].y),
    );
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let passed = 0;
  let best = { ...points[0], fraction: 0, distance: Infinity };
  lengths.forEach((length, index) => {
    if (!length) return;
    const start = points[index];
    const end = points[index + 1];
    const ratio = Math.max(
      0,
      Math.min(
        1,
        ((pointer.x - start.x) * (end.x - start.x) +
          (pointer.y - start.y) * (end.y - start.y)) /
          (length * length),
      ),
    );
    const x = start.x + ratio * (end.x - start.x);
    const y = start.y + ratio * (end.y - start.y);
    const distance = Math.hypot(pointer.x - x, pointer.y - y);
    if (distance < best.distance)
      best = { x, y, fraction: (passed + length * ratio) / total, distance };
    passed += length;
  });
  return best;
}

export function labelPointOnPath(
  points: XYPosition[],
  fraction: number,
): XYPosition {
  const lengths = points
    .slice(1)
    .map((point, index) =>
      Math.hypot(point.x - points[index].x, point.y - points[index].y),
    );
  let remaining =
    lengths.reduce((sum, length) => sum + length, 0) *
    Math.max(0, Math.min(1, fraction));
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (!length) continue;
    if (remaining <= length)
      return {
        x:
          points[index].x +
          ((points[index + 1].x - points[index].x) * remaining) / length,
        y:
          points[index].y +
          ((points[index + 1].y - points[index].y) * remaining) / length,
      };
    remaining -= length;
  }
  return points.at(-1) ?? { x: 0, y: 0 };
}

export function moveSegment(
  points: XYPosition[],
  segmentIndex: number,
  delta: XYPosition,
) {
  const next = points.map((point) => ({ ...point }));
  let startIndex = segmentIndex;
  let endIndex = segmentIndex + 1;
  const start = next[startIndex];
  const end = next[endIndex];
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const pointer = { x: start.x + delta.x, y: start.y + delta.y };

  if (startIndex === 0) {
    next.splice(
      1,
      0,
      horizontal ? { x: start.x, y: pointer.y } : { x: pointer.x, y: start.y },
    );
    startIndex = 1;
    endIndex += 1;
  }
  if (endIndex === next.length - 1) {
    const target = next[endIndex];
    next.splice(
      endIndex,
      0,
      horizontal
        ? { x: target.x, y: pointer.y }
        : { x: pointer.x, y: target.y },
    );
  }

  if (horizontal) {
    next[startIndex] = { ...next[startIndex], y: pointer.y };
    next[startIndex + 1] = { ...next[startIndex + 1], y: pointer.y };
  } else {
    next[startIndex] = { ...next[startIndex], x: pointer.x };
    next[startIndex + 1] = { ...next[startIndex + 1], x: pointer.x };
  }
  return next.slice(1, -1);
}

type RouteFrame = { bounds: Obstacle; parentId?: string };
// [OM-FREEPLAY] 入口标签离外框 32px，容纳 24px 箭头线身及断口；路由预留框另加 10px 净空。
function entranceLabelPoint(
  target: XYPosition & { side: Position },
  bounds: Obstacle,
  size: { width: number; height: number },
) {
  if (target.side === Position.Top)
    return { x: target.x, y: bounds.top - size.height / 2 - 32 };
  if (target.side === Position.Bottom)
    return { x: target.x, y: bounds.bottom + size.height / 2 + 32 };
  if (target.side === Position.Left)
    return { x: bounds.left - size.width / 2 - 32, y: target.y };
  return { x: bounds.right + size.width / 2 + 32, y: target.y };
}
type RoutePlan = {
  signature: string;
  routes: Map<string, XYPosition[]>;
  frames: Map<string, RouteFrame>;
  edgeKeys: Map<string, string>;
  entrances: Map<string, Obstacle>;
};
const routingCache = new WeakMap<object, RoutePlan>();
const routingHistory = new WeakMap<object, Map<string, RoutePlan>>();
// 同一次 React Flow 状态更新只规划一次；各边只订阅自己的点列，不订阅整张节点/边数组。
const routingSnapshots = new WeakMap<
  object,
  { version: number; routes: Map<string, XYPosition[]> }
>();
type RoutingInput = {
  version: number;
  nodes: Node[];
  edges: EditableEdge[];
  geometry: {
    node: InternalNode<Node>;
    x: number;
    y: number;
    width?: number;
    height?: number;
    handles: InternalNode<Node>["internals"]["handleBounds"];
  }[];
  routes: Map<string, XYPosition[]>;
};
const routingInputs = new WeakMap<object, RoutingInput>();
const labelPlans = new WeakMap<
  object,
  {
    routes: Map<string, XYPosition[]>;
    edges: EditableEdge[];
    version: number;
    placements: Map<string, LabelPlacement>;
  }
>();

function labelsForRoutes(
  owner: object,
  routes: Map<string, XYPosition[]>,
  edges: EditableEdge[],
) {
  const registry = labelRegistry(owner),
    version = registry.getSnapshot();
  const cached = labelPlans.get(owner);
  if (
    cached?.routes === routes &&
    cached.edges === edges &&
    cached.version === version
  )
    return cached.placements;
  const entries = edges.flatMap((edge) => {
    const points = routes.get(edge.id),
      size = registry.sizes.get(edge.id);
    if (
      !edge.data?.labelTex ||
      !points?.length ||
      size?.tex !== edge.data.labelTex
    )
      return [];
    return [
      {
        id: edge.id,
        points,
        size,
        preferred:
          edge.data.labelPosition === undefined
            ? longestSegmentCenter(points)
            : labelPointOnPath(points, edge.data.labelPosition),
        terminalPreferred:
          edge.data.terminalLabelPosition === undefined
            ? undefined
            : labelPointOnPath(points, edge.data.terminalLabelPosition),
      },
    ];
  });
  const boxes = [...(routingCache.get(owner)?.frames.values() ?? [])].map(
    (frame) => frame.bounds,
  );
  const placements = layoutEdgeLabels(entries, boxes, routes);
  // 共享规划可以变化，但没有移动的标签仍保留引用；拖一个框不重绘整页所有边。
  for (const [id, placement] of placements) {
    const old = cached?.placements.get(id);
    if (
      old &&
      old.primary.x === placement.primary.x &&
      old.primary.y === placement.primary.y &&
      old.terminal?.x === placement.terminal?.x &&
      old.terminal?.y === placement.terminal?.y &&
      old.primaryIsTerminal === placement.primaryIsTerminal &&
      old.unresolved === placement.unresolved
    )
      placements.set(id, old);
  }
  labelPlans.set(owner, { routes, edges, version, placements });
  return placements;
}

export function routesForStore(
  owner: object,
  nodes: Node[],
  edges: EditableEdge[],
  lookup: ReadonlyMap<string, InternalNode<Node>>,
) {
  const previous = routingInputs.get(owner);
  const version = labelRegistry(owner).getSnapshot();
  // 平移/缩放只改变视口，连世界坐标的签名字符串也不应重新构造。
  // 同时核对可变内部表的数值与端口引用，不能仅凭 nodes 数组引用漏掉 ResizeObserver 更新。
  if (
    previous?.nodes === nodes &&
    previous.version === version &&
    previous.edges === edges &&
    previous.geometry.length === lookup.size &&
    previous.geometry.every((g) => {
      const n = lookup.get(g.node.id);
      return (
        n === g.node &&
        n.internals.positionAbsolute.x === g.x &&
        n.internals.positionAbsolute.y === g.y &&
        n.measured.width === g.width &&
        n.measured.height === g.height &&
        n.internals.handleBounds === g.handles
      );
    })
  )
    return previous.routes;
  const routes = planArchitectureRoutes(owner, nodes, edges, (id) =>
    lookup.get(id),
  );
  const geometry = [...lookup.values()].map((node) => ({
    node,
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured.width,
    height: node.measured.height,
    handles: node.internals.handleBounds,
  }));
  routingInputs.set(owner, { nodes, edges, geometry, routes, version });
  return routes;
}

// [OM-FREEPLAY] 签名按 1/1024 世界像素归一，滤掉缩放后 DOM 测量的浮点尾差；绘制坐标保持原精度。
const endpointKey = (point: XYPosition & { side: Position }) => [
  Math.round(point.x * 1024),
  Math.round(point.y * 1024),
  point.side,
];

export function planArchitectureRoutes(
  owner: object,
  nodes: Node[],
  edges: EditableEdge[],
  getInternalNode: (id: string) => InternalNode<Node> | undefined,
) {
  const cached = routingCache.get(owner);
  const labelSizes = labelRegistry(owner).sizes;
  // 标签中心在线上，入口通道同时容纳文字及净空。
  // 实测尺寸变化（包括改字）进入路由签名；人工折线仍由原控制点负责。
  const labelDimensions = (edge: EditableEdge) => {
    const size = labelSizes.get(edge.id);
    return size && size.tex === edge.data?.labelTex
      ? [size.width, size.height]
      : undefined;
  };
  const frames = new Map<string, RouteFrame>();
  for (const node of nodes) {
    const internal = getInternalNode(node.id),
      position = internal?.internals.positionAbsolute;
    const width = internal?.measured.width,
      height = internal?.measured.height;
    if (position && width && height && !node.hidden)
      frames.set(node.id, {
        parentId: node.parentId,
        bounds: {
          left: position.x,
          top: position.y,
          right: position.x + width,
          bottom: position.y + height,
        },
      });
  }
  const endpoint = (edge: EditableEdge, kind: "source" | "target") => {
    const node = getInternalNode(edge[kind]);
    const position = node?.internals.positionAbsolute;
    const width = node?.measured.width,
      height = node?.measured.height;
    if (!node || !position || !width || !height) return null;
    const handleId = kind === "source" ? edge.sourceHandle : edge.targetHandle;
    const handles = node.internals.handleBounds;
    const handle =
      handles?.[kind]?.find((item) => item.id === handleId) ??
      handles?.source?.find((item) => item.id === handleId);
    const anchor =
      kind === "source" ? edge.data?.sourceAnchor : edge.data?.targetAnchor;
    const side = anchor?.side ?? handle?.position;
    if (!side) return null;
    // 具名端口属于内部数据框；只有人工边界吸附才使用外框归一化锚点。
    if (!anchor && handle)
      return {
        x: position.x + handle.x + handle.width / 2,
        y: position.y + handle.y + handle.height / 2,
        side,
      };
    const offset =
      (anchor ? snapBoundaryOffset(anchor.offset) : undefined) ??
      (side === Position.Top || side === Position.Bottom
        ? ((handle?.x ?? width / 2) + (handle?.width ?? 0) / 2) / width
        : ((handle?.y ?? height / 2) + (handle?.height ?? 0) / 2) / height);
    return {
      x:
        position.x +
        (side === Position.Left
          ? 0
          : side === Position.Right
            ? width
            : width * offset),
      y:
        position.y +
        (side === Position.Top
          ? 0
          : side === Position.Bottom
            ? height
            : height * offset),
      side,
    };
  };
  const items = edges
    .flatMap((edge) => {
      const source = endpoint(edge, "source"),
        target = endpoint(edge, "target");
      return source && target ? [{ edge, source, target }] : [];
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.edge.data?.waypoints?.length)) -
          Number(Boolean(a.edge.data?.waypoints?.length)) ||
        // 同侧旁路从短到长占道：内层先走，外层包住它，避免嵌套残差相互穿越。
        Number(
          !(
            a.source.side === a.target.side &&
            (a.source.side === Position.Left ||
              a.source.side === Position.Right)
          ),
        ) -
          Number(
            !(
              b.source.side === b.target.side &&
              (b.source.side === Position.Left ||
                b.source.side === Position.Right)
            ),
          ) ||
        (a.source.side === a.target.side &&
        b.source.side === b.target.side &&
        (a.source.side === Position.Left || a.source.side === Position.Right) &&
        (b.source.side === Position.Left || b.source.side === Position.Right)
          ? Math.abs(a.target.y - a.source.y) -
            Math.abs(b.target.y - b.source.y)
          : 0) ||
        a.source.y - b.source.y ||
        a.source.x - b.source.x ||
        a.edge.id.localeCompare(b.edge.id),
    );
  const edgeKeys = new Map(
    items.map(({ edge, source, target }) => [
      edge.id,
      JSON.stringify([
        edge.source,
        edge.target,
        endpointKey(source),
        endpointKey(target),
        edge.data?.waypoints,
        labelDimensions(edge),
      ]),
    ]),
  );
  // 仅几何与端口影响路由；选中、拖标签、视口变化不能触发全图重算。内部端口变化也纳入失效键。
  const signature = JSON.stringify([[...frames], [...edgeKeys]]);
  if (cached?.signature === signature) return cached.routes;
  const history = routingHistory.get(owner) ?? new Map<string, RoutePlan>();
  routingHistory.set(owner, history);
  const exact = history.get(signature);
  if (exact) {
    history.delete(signature);
    history.set(signature, exact);
    routingCache.set(owner, exact);
    return exact.routes;
  }
  const inflate = (bounds: Obstacle, padding: number): Obstacle => ({
    left: bounds.left - padding,
    top: bounds.top - padding,
    right: bounds.right + padding,
    bottom: bounds.bottom + padding,
  });
  const changedFrames = [...frames].filter(
    ([id, frame]) =>
      JSON.stringify(frame) !== JSON.stringify(cached?.frames.get(id)),
  );
  const topologyChanged = changedFrames.some(
    ([id, frame]) =>
      cached?.frames.has(id) &&
      cached.frames.get(id)?.parentId !== frame.parentId,
  );
  const ancestors = (id: string) => {
    const ids = new Set<string>();
    let parent = frames.get(id)?.parentId;
    while (parent && !ids.has(parent)) {
      ids.add(parent);
      parent = frames.get(parent)?.parentId;
    }
    return ids;
  };
  const routes = new Map<string, XYPosition[]>();
  // 入口变量也占通道，不能让后规划的导线横穿入口，再把变量挤回远处。
  // 手工路线仍保持原样，由标签避让器报告无法兼顾的情况。
  const entrances = new Map(
    items.flatMap(({ edge, target }) => {
      const size = labelSizes.get(edge.id);
      if (!size || size.tex !== edge.data?.labelTex) return [];
      let frame = frames.get(edge.target);
      while (frame?.parentId) frame = frames.get(frame.parentId);
      return frame
        ? [
            [
              edge.id,
              labelBounds(
                entranceLabelPoint(target, frame.bounds, size),
                size,
                10,
              ),
            ] as const,
          ]
        : [];
    }),
  );
  const reserved: ReservedSegment[] = [];
  const changedEntrances = new Set(
    [...entrances]
      .filter(([id, rect]) => {
        const old = cached?.entrances.get(id);
        return (
          !old ||
          old.left !== rect.left ||
          old.right !== rect.right ||
          old.top !== rect.top ||
          old.bottom !== rect.bottom
        );
      })
      .map(([id]) => id),
  );
  // 显式拖动只更新受影响通道；普通布局/字体测量重新校验全部入口，避免把初始化时的临时路线固化。
  const localEdit =
    nodes.some((node) => node.dragging) ||
    items.some(
      ({ edge }) =>
        Boolean(edge.data?.waypoints?.length) &&
        cached?.edgeKeys.get(edge.id) !== edgeKeys.get(edge.id),
    );
  const reserve = (id: string, points: XYPosition[]) => {
    routes.set(id, points);
    for (let i = 1; i < points.length; i++)
      reserved.push({ start: points[i - 1], end: points[i] });
  };
  // 固定人工线与仍然合法的自动线先占通道；移动一个框只使相连边和被新障碍挡住的边失效。
  for (const { edge, source, target } of items) {
    const previous = cached?.routes.get(edge.id);
    const waypoints = edge.data?.waypoints;
    if (waypoints?.length) {
      reserve(
        edge.id,
        cached?.edgeKeys.get(edge.id) === edgeKeys.get(edge.id) && previous
          ? previous
          : manualOrthogonalPoints(
              source.x,
              source.y,
              target.x,
              target.y,
              source.side,
              target.side,
              waypoints,
            ),
      );
    } else if (
      previous &&
      !topologyChanged &&
      cached?.edgeKeys.get(edge.id) === edgeKeys.get(edge.id)
    ) {
      const parentIds = new Set([
        ...ancestors(edge.source),
        ...ancestors(edge.target),
      ]);
      if (changedFrames.some(([id]) => parentIds.has(id))) continue;
      const excluded = new Set([edge.source, edge.target, ...parentIds]);
      // 其他局部尺寸变化可能释放旧路由的替代通道；只重试同一区域，拖动远端专家不重排上方整页。
      const area = inflate(
        {
          left: Math.min(...previous.map((p) => p.x)),
          right: Math.max(...previous.map((p) => p.x)),
          top: Math.min(...previous.map((p) => p.y)),
          bottom: Math.max(...previous.map((p) => p.y)),
        },
        EDGE_NODE_CLEARANCE,
      );
      const overlaps = (r: Obstacle) =>
        r.left <= area.right &&
        r.right >= area.left &&
        r.top <= area.bottom &&
        r.bottom >= area.top;
      const nearbyChange = changedFrames.some(
        ([id, frame]) =>
          overlaps(frame.bounds) ||
          Boolean(
            cached?.frames.get(id) && overlaps(cached.frames.get(id)!.bounds),
          ),
      );
      const blockedByLabel = [...entrances].some(
        ([id, rect]) =>
          id !== edge.id &&
          (!localEdit || nearbyChange || changedEntrances.has(id)) &&
          previous
            .slice(1)
            .some((point, i) =>
              segmentCrossesObstacle(previous[i], point, rect),
            ),
      );
      const blocked =
        blockedByLabel ||
        // 缓存只代表上次合法：别的线改道后，旧线也必须重新校验共线重叠。
        [...routes].some(
          ([id, other]) =>
            (!localEdit || cached?.routes.get(id) !== other) &&
            sharedRouteLength(previous, other) > 0,
        ) ||
        changedFrames.some(
          ([id, frame]) =>
            !excluded.has(id) &&
            previous
              .slice(1)
              .some((point, i) =>
                segmentCrossesObstacle(
                  previous[i],
                  point,
                  inflate(frame.bounds, EDGE_NODE_CLEARANCE),
                ),
              ),
        );
      if (!blocked) reserve(edge.id, previous);
    }
  }
  for (const { edge, source, target } of items) {
    if (routes.has(edge.id)) continue;
    const sourceAncestors = ancestors(edge.source),
      targetAncestors = ancestors(edge.target);
    const sourceFrames: Obstacle[] = [],
      targetFrames: Obstacle[] = [];
    const obstacles = [...frames].flatMap(([id, frame]) => {
      if (sourceAncestors.has(id) && targetAncestors.has(id)) return [];
      // 文字按横纵两个尺寸占位，不能把宽公式的整宽同时加到上下通道。
      const measured = labelSizes.get(edge.id);
      const size = measured?.tex === edge.data?.labelTex ? measured : undefined;
      const widthPad = Math.max(
        EDGE_NODE_CLEARANCE,
        (size?.width ?? 0) / 2 + 12,
      );
      const heightPad = Math.max(
        EDGE_NODE_CLEARANCE,
        (size?.height ?? 0) / 2 + 12,
      );
      const bounds = {
        left: frame.bounds.left - widthPad,
        right: frame.bounds.right + widthPad,
        top: frame.bounds.top - heightPad,
        bottom: frame.bounds.bottom + heightPad,
      };
      if (size && (id === edge.target || targetAncestors.has(id))) {
        if (target.side === Position.Left)
          bounds.left = frame.bounds.left - Math.max(widthPad, size.width + 40);
        if (target.side === Position.Right)
          bounds.right =
            frame.bounds.right + Math.max(widthPad, size.width + 40);
        if (target.side === Position.Top)
          bounds.top = frame.bounds.top - Math.max(heightPad, size.height + 40);
        if (target.side === Position.Bottom)
          bounds.bottom =
            frame.bounds.bottom + Math.max(heightPad, size.height + 40);
      }
      if (id === edge.source || sourceAncestors.has(id))
        sourceFrames.push(bounds);
      if (id === edge.target || targetAncestors.has(id))
        targetFrames.push(bounds);
      return [bounds];
    });
    obstacles.push(
      ...[...entrances]
        .filter(([id]) => id !== edge.id)
        .map(([, rect]) => rect),
    );
    reserve(
      edge.id,
      automaticOrthogonalPoints(
        source.x,
        source.y,
        target.x,
        target.y,
        source.side,
        target.side,
        obstacles,
        reserved,
        sourceFrames,
        targetFrames,
        localEdit ? cached?.routes.get(edge.id) : undefined,
      ),
    );
  }
  const plan = { signature, routes, frames, edgeKeys, entrances };
  routingCache.set(owner, plan);
  history.set(signature, plan);
  // [OM-FREEPLAY] 保留最近 64 份完整实测路由；层、模式、人工端点或障碍变化均由签名精确区分。
  if (history.size > 64) history.delete(history.keys().next().value!);
  return routes;
}
function EditableOrthogonalEdgeView({
  id,
  sourceX: handleSourceX,
  sourceY: handleSourceY,
  targetX: handleTargetX,
  targetY: handleTargetY,
  targetPosition: handleTargetPosition,
  sourcePosition: handleSourcePosition,
  source,
  target,
  selected,
  data,
  style,
}: EdgeProps<EditableEdge>) {
  const { screenToFlowPosition, getZoom, getInternalNode } = useReactFlow<
    Node,
    EditableEdge
  >();
  const store = useStoreApi();
  const registry = labelRegistry(store.getState);
  const labelVersion = useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
  );
  const { route, placement } = useStore(
    (state) => {
      let snapshot = routingSnapshots.get(state);
      if (!snapshot || snapshot.version !== labelVersion) {
        // 各 hook 的包装对象不同，getState 才是同一画布的共享身份。
        const routes = routesForStore(
          store.getState,
          state.nodes,
          state.edges as EditableEdge[],
          state.nodeLookup,
        );
        snapshot = { routes, version: labelVersion };
        routingSnapshots.set(state, snapshot);
      }
      return {
        route: snapshot.routes.get(id),
        placement: labelsForRoutes(
          store.getState,
          snapshot.routes,
          state.edges as EditableEdge[],
        ).get(id),
      };
    },
    (a, b) => a.route === b.route && a.placement === b.placement,
  );
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const labelSize = registry.sizes.get(id) ?? { width: 0, height: 0 };
  useEffect(() => {
    const label = labelRef.current;
    if (!label) return;
    return registry.observe(label, id, data?.labelTex ?? "");
  }, [data?.labelTex, id, registry]);
  const history = useContext(EditHistoryContext)!;
  const updateEdges = history.setEdges;
  // 手势直接写受控图的唯一状态；不再经过实例队列 → diff → onEdgesChange 往返。
  // 路径、标签、端点和撤销快照因此在同一次输入内看到相同的边数据。
  const setEdges = useCallback(
    (update: SetStateAction<EditableEdge[]>) =>
      flushSync(() => updateEdges(update)),
    [updateEdges],
  );
  const anchorPoint = (
    nodeId: string,
    anchor: BoundaryAnchor | undefined,
    fallback: XYPosition,
    handleSide: Position,
  ) => {
    const node = getInternalNode(nodeId);
    const absolute = node?.internals.positionAbsolute;
    const width = node?.measured.width;
    const height = node?.measured.height;
    if (!anchor || !absolute || !width || !height) return fallback;
    const side = anchor?.side ?? handleSide;
    const offset =
      (anchor ? snapBoundaryOffset(anchor.offset) : undefined) ??
      Math.max(
        0,
        Math.min(
          1,
          side === Position.Top || side === Position.Bottom
            ? (fallback.x - absolute.x) / width
            : (fallback.y - absolute.y) / height,
        ),
      );
    return {
      x:
        absolute.x +
        (side === Position.Left
          ? 0
          : side === Position.Right
            ? width
            : width * offset),
      y:
        absolute.y +
        (side === Position.Top
          ? 0
          : side === Position.Bottom
            ? height
            : height * offset),
    };
  };
  const { x: sourceX, y: sourceY } = anchorPoint(
    source,
    data?.sourceAnchor,
    { x: handleSourceX, y: handleSourceY },
    handleSourcePosition,
  );
  const { x: targetX, y: targetY } = anchorPoint(
    target,
    data?.targetAnchor,
    { x: handleTargetX, y: handleTargetY },
    handleTargetPosition,
  );
  const sourcePosition = data?.sourceAnchor?.side ?? handleSourcePosition;
  const targetPosition = data?.targetAnchor?.side ?? handleTargetPosition;
  const points =
    route ??
    automaticOrthogonalPoints(
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      [],
    );
  const preferredCenter =
    data?.labelPosition === undefined
      ? longestSegmentCenter(points)
      : labelPointOnPath(points, data.labelPosition);
  const labelCenter = placement?.primary ?? preferredCenter;
  const terminalCenter = placement?.terminal;
  const path = pathWithLabelGap(
    points,
    data?.labelTex && labelSize.width
      ? [labelCenter, ...(terminalCenter ? [terminalCenter] : [])].map(
          (center) => labelBounds(center, labelSize, 3),
        )
      : undefined,
  );
  const labelHtml = useMemo(
    () => (data?.labelTex ? latexHtml(data.labelTex) : ""),
    [data?.labelTex],
  );
  const color = data?.color ?? String(style?.stroke ?? "#37685a");
  // 同页可能有多个相同模型画布，SVG marker 的文档级 ID 不能只用边 ID。
  const arrowId = `wire-arrow-${useId().replace(/:/g, "")}`;
  const end = points.at(-1)!,
    beforeEnd = points.at(-2)!;
  const arrowLength = Math.hypot(end.x - beforeEnd.x, end.y - beforeEnd.y);
  const arrowStart = arrowLength
    ? {
        x: end.x - (end.x - beforeEnd.x) / arrowLength,
        y: end.y - (end.y - beforeEnd.y) / arrowLength,
      }
    : end;
  useEffect(() => {
    if (!selected) return;
    const hover = (event: PointerEvent) => {
      const pointer = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const radius = 14 / getZoom();
      let nearest: number | null = null;
      let distance = radius;
      for (let index = 0; index < points.length - 1; index += 1) {
        const start = points[index];
        const end = points[index + 1];
        const x = Math.max(
          Math.min(start.x, end.x),
          Math.min(Math.max(start.x, end.x), pointer.x),
        );
        const y = Math.max(
          Math.min(start.y, end.y),
          Math.min(Math.max(start.y, end.y), pointer.y),
        );
        const nextDistance = Math.hypot(pointer.x - x, pointer.y - y);
        if (nextDistance < distance) {
          distance = nextDistance;
          nearest = index;
        }
      }
      setHoveredSegment(nearest);
    };
    window.addEventListener("pointermove", hover);
    return () => window.removeEventListener("pointermove", hover);
  }, [getZoom, points, screenToFlowPosition, selected]);

  const startEndpointDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    endpoint: "source" | "target",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    const scope = event.currentTarget.closest<HTMLElement>(".react-flow");
    if (!scope) return;
    const nodeId = endpoint === "source" ? source : target;
    const side = endpoint === "source" ? sourcePosition : targetPosition;
    let preferredConnection = { nodeId, side };
    let hit: BoundaryConnection | null = null;
    let moved = false;
    let changed = false;
    const start = { x: event.clientX, y: event.clientY };
    const move = (pointerEvent: PointerEvent) => {
      if (
        Math.hypot(
          pointerEvent.clientX - start.x,
          pointerEvent.clientY - start.y,
        ) < 3 &&
        !moved
      )
        return;
      moved = true;
      hit = findBoundaryConnection(
        scope,
        { x: pointerEvent.clientX, y: pointerEvent.clientY },
        endpoint === "source" ? target : source,
        preferredConnection,
      );
      if (!hit) return;
      if (!changed) history?.beginHistory();
      changed = true;
      const connection = hit;
      preferredConnection = {
        nodeId: connection.nodeId,
        side: connection.anchor.side,
      };
      setEdges((current) =>
        current.map((edge) =>
          edge.id === id
            ? {
                ...edge,
                [endpoint]: connection.nodeId,
                [`${endpoint}Handle`]: `port-${connection.anchor.side}`,
                data: {
                  ...edge.data,
                  [`${endpoint}Anchor`]: connection.anchor,
                  waypoints: undefined,
                },
              }
            : edge,
        ),
      );
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (changed) history?.commitHistory();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };

  const startSegmentDrag = (
    event: ReactPointerEvent<Element>,
    segmentIndex: number,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setEdges((current) =>
      current.map((edge) => ({ ...edge, selected: edge.id === id })),
    );
    const start = { x: event.clientX, y: event.clientY };
    const origin = screenToFlowPosition(start);
    let changed = false;
    const move = (pointerEvent: PointerEvent) => {
      if (
        !changed &&
        Math.hypot(
          pointerEvent.clientX - start.x,
          pointerEvent.clientY - start.y,
        ) < 3
      )
        return;
      if (!changed) history?.beginHistory();
      changed = true;
      const pointer = screenToFlowPosition({
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
      });
      const waypoints = moveSegment(points, segmentIndex, {
        x: pointer.x - origin.x,
        y: pointer.y - origin.y,
      });
      setEdges((current) =>
        current.map((edge) =>
          edge.id === id
            ? { ...edge, data: { ...edge.data, waypoints } }
            : edge,
        ),
      );
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (changed) history?.commitHistory();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };

  const startLabelDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    terminal = false,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    setEdges((current) =>
      current.map((edge) => ({ ...edge, selected: edge.id === id })),
    );
    const start = { x: event.clientX, y: event.clientY };
    let changed = false;
    const move = (pointerEvent: PointerEvent) => {
      if (
        !changed &&
        Math.hypot(
          pointerEvent.clientX - start.x,
          pointerEvent.clientY - start.y,
        ) < 3
      )
        return;
      if (!changed) history?.beginHistory();
      changed = true;
      const pointer = screenToFlowPosition({
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
      });
      const { fraction } = projectLabelOntoPath(points, pointer);
      setEdges((current) =>
        current.map((edge) =>
          edge.id === id
            ? {
                ...edge,
                data: {
                  ...edge.data,
                  [terminal ? "terminalLabelPosition" : "labelPosition"]:
                    fraction,
                },
              }
            : edge,
        ),
      );
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (changed) history?.commitHistory();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };

  return (
    <>
      <g
        className="nodrag nopan"
        onPointerDown={(event) => {
          const pointer = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          let nearest = 0,
            distance = Infinity;
          for (let i = 0; i < points.length - 1; i++) {
            const candidate = projectLabelOntoPath(
              [points[i], points[i + 1]],
              pointer,
            );
            if (candidate.distance < distance) {
              distance = candidate.distance;
              nearest = i;
            }
          }
          startSegmentDrag(event, nearest);
        }}
      >
        <defs>
          <marker
            id={arrowId}
            viewBox="-10 -10 20 20"
            refX="0"
            refY="0"
            markerWidth="24"
            markerHeight="24"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path
              d="M -5,-4 L 0,0 L -5,4"
              fill="none"
              stroke={selected ? "#1565d8" : color}
              strokeWidth="1.8"
            />
          </marker>
        </defs>
        <BaseEdge
          id={id}
          path={path}
          interactionWidth={28}
          style={{
            ...style,
            // [OM-FREEPLAY] 与内部对象共用亮蓝选中色，线宽与路径几何保持不变。
            stroke: selected ? "#1565d8" : color,
            strokeWidth: DATA_WIRE_WIDTH,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            cursor: "grab",
          }}
        />
        {/* 标签断口把 path 分成多个子路径；箭头只画在真实终点，不能在每段末尾重复。 */}
        <path
          data-edge-arrow={id}
          d={`M ${arrowStart.x} ${arrowStart.y} L ${end.x} ${end.y}`}
          markerEnd={`url(#${arrowId})`}
          stroke={selected ? "#1565d8" : color}
          strokeWidth={DATA_WIRE_WIDTH}
          fill="none"
        />
      </g>
      <EdgeLabelRenderer>
        {data?.labelTex && terminalCenter && (
          <div
            data-edge-terminal-label={id}
            className="nodrag nopan"
            role="button"
            tabIndex={0}
            onPointerDown={(event) => startLabelDrag(event, true)}
            onClick={(event) => event.stopPropagation()}
            aria-label={data.labelTex}
            style={{
              position: "absolute",
              transform: `translate(-50%,-50%) translate(${terminalCenter.x}px,${terminalCenter.y}px)`,
              zIndex: 1002,
              padding: "3px 7px",
              background: "transparent",
              color: "#716d63",
              fontSize: EDGE_LABEL_FONT_SIZE,
              fontWeight: 700,
              pointerEvents: "all",
              cursor: "grab",
              userSelect: "none",
              whiteSpace: "nowrap",
            }}
          >
            <MathMarkup html={labelHtml} tex={data.labelTex} />
          </div>
        )}
        {(["source", "target"] as const).map((endpoint) => (
          <button
            key={endpoint}
            type="button"
            className="nodrag nopan architecture-edge-endpoint"
            aria-label={`拖动连线${endpoint === "source" ? "起点" : "箭头"}`}
            data-edge-id={id}
            data-endpoint={endpoint}
            data-selected={Boolean(selected)}
            onPointerDown={(event) => startEndpointDrag(event, endpoint)}
            style={{
              position: "absolute",
              left: endpoint === "source" ? sourceX : targetX,
              top: endpoint === "source" ? sourceY : targetY,
              width: 24,
              height: 24,
              padding: 7,
              transform: "translate(-50%,-50%)",
              border: 0,
              outline: "none",
              boxShadow: "none",
              background: "transparent",
              pointerEvents: "all",
              cursor:
                (endpoint === "source" ? sourcePosition : targetPosition) ===
                  Position.Top ||
                (endpoint === "source" ? sourcePosition : targetPosition) ===
                  Position.Bottom
                  ? "ew-resize"
                  : "ns-resize",
            }}
          >
            <span
              style={{
                display: "block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: "2px solid #fffefa",
                background: color,
                pointerEvents: "none",
              }}
            />
          </button>
        ))}
        {data?.labelTex && (
          <div
            ref={labelRef}
            className="nodrag nopan"
            data-edge-label={id}
            data-edge-terminal-label={
              placement?.primaryIsTerminal ? id : undefined
            }
            data-label-unresolved={placement?.unresolved || undefined}
            role="button"
            tabIndex={0}
            aria-label={data.labelTex}
            onPointerDown={(event) =>
              startLabelDrag(event, Boolean(placement?.primaryIsTerminal))
            }
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelCenter.x}px,${labelCenter.y}px)`,
              // 选中连线会升至 1000 层；透明标签仍须高于线与端点。
              zIndex: 1002,
              padding: "3px 7px",
              borderRadius: 5,
              background: "transparent",
              color: "#716d63",
              fontSize: EDGE_LABEL_FONT_SIZE,
              fontWeight: 700,
              pointerEvents: "all",
              cursor: "grab",
              userSelect: "none",
              whiteSpace: "nowrap",
            }}
          >
            <MathMarkup html={labelHtml} tex={data.labelTex} />
          </div>
        )}
        {selected &&
          points.slice(0, -1).map((point, index) => {
            if (index !== hoveredSegment) return null;
            const end = points[index + 1];
            const horizontal =
              Math.abs(end.x - point.x) >= Math.abs(end.y - point.y);
            return (
              <button
                key={`${id}-segment-${index}`}
                type="button"
                className="nodrag nopan"
                aria-label={`拖动第 ${index + 1} 段折线`}
                onPointerDown={(event) => startSegmentDrag(event, index)}
                style={{
                  position: "absolute",
                  left: (point.x + end.x) / 2,
                  top: (point.y + end.y) / 2,
                  width: 12,
                  height: 12,
                  padding: 0,
                  transform: "translate(-50%, -50%)",
                  border: "2px solid #fffefa",
                  borderRadius: 3,
                  background: color,
                  boxShadow: "0 1px 4px rgba(42,41,36,.25)",
                  cursor: horizontal ? "ns-resize" : "ew-resize",
                  pointerEvents: "all",
                }}
              />
            );
          })}
      </EdgeLabelRenderer>
    </>
  );
}

export const EditableOrthogonalEdge = memo(EditableOrthogonalEdgeView);
