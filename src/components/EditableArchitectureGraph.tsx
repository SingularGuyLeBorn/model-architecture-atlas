import React, {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import katex from "katex";
import { MathMarkup } from "./MathMarkup";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  NodeResizeControl,
  Position,
  ResizeControlVariant,
  useStore,
  useReactFlow,
  useStoreApi,
  type Edge,
  type EdgeProps,
  type ConnectionLineComponentProps,
  type Node,
  type InternalNode,
  type XYPosition,
} from "@xyflow/react";

export type EditableEdgeData = {
  labelTex?: string;
  waypoints?: XYPosition[];
  color?: string;
  sourceAnchor?: BoundaryAnchor;
  targetAnchor?: BoundaryAnchor;
  labelPosition?: number;
};

export type BoundaryAnchor = { side: Position; offset: number };
export type BoundaryConnection = { nodeId: string; anchor: BoundaryAnchor };

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
          anchor: { side, offset },
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
};

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

export function EightResizeHandles({
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

export function EightConnectionPorts({
  color = "#37685a",
}: {
  color?: string;
}) {
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

// [OM-FREEPLAY] 用户要求自动线不得贴框；24px 引出段与 28px 障碍外扩可在当前最窄并列间距内同时成立。
const EDGE_PORT_LEAD = 24;
const EDGE_NODE_CLEARANCE = 28;
// [OM-FREEPLAY] 相邻自动线路保留 16px 的中心线间距，兼顾开放箭头和短公式标签。
const EDGE_LANE_GAP = 16;
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

function simplifyOrthogonalPoints(points: XYPosition[]) {
  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const before = points[index - 1];
    const after = points[index + 1];
    if (point.x === before.x && point.y === before.y) return false;
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

function routeScore(
  points: XYPosition[],
  obstacles: Obstacle[],
  reserved: ReservedSegment[],
  upperBound = Infinity,
) {
  let crossings = 0;
  let crowding = 0;
  let length = 0;
  for (let index = 1; index < points.length; index++)
    length +=
      Math.abs(points[index].x - points[index - 1].x) +
      Math.abs(points[index].y - points[index - 1].y);
  // 长度与折点已经给出成本下界；劣于当前解的候选无需再逐个检查全图障碍。
  if (length + points.length * 8 >= upperBound) return Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    // 所有代价非负：一旦不可能优于已有路线，停止检查剩余障碍和线段；评分规则不变。
    for (const obstacle of obstacles) {
      if (segmentCrossesObstacle(start, end, obstacle)) crossings += 1;
      if (
        crossings * 100_000_000 + crowding + length + points.length * 8 >=
        upperBound
      )
        return Infinity;
    }
    const horizontal = start.y === end.y;
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
        crossings * 100_000_000 + crowding + length + points.length * 8 >=
        upperBound
      )
        return Infinity;
    }
  }
  return crossings * 100_000_000 + crowding + length + points.length * 8;
}

function defaultOrthogonalPoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  obstacles: Obstacle[],
  reserved: ReservedSegment[],
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
      ...nearChannels(verticalChannels, sourceX, targetX),
    ]),
  ];
  const nearY = [
    ...new Set([
      top,
      bottom,
      ...nearChannels(horizontalChannels, sourceY, targetY),
    ]),
  ];
  let best = candidates[0];
  let bestScore = Infinity;
  const consider = (candidate: XYPosition[]) => {
    const points = simplifyOrthogonalPoints(candidate);
    const score = routeScore(points, obstacles, reserved, bestScore);
    if (score < bestScore) {
      best = points;
      bestScore = score;
    }
  };
  for (const candidate of candidates) consider(candidate);
  const minimumScore =
    Math.abs(sourceX - targetX) +
    Math.abs(sourceY - targetY) +
    (sourceX === targetX || sourceY === targetY ? 2 : 3) * 8;
  if (bestScore <= minimumScore) return best;
  for (const x of nearX)
    for (const y of nearY) {
      const minimumLength =
        Math.abs(sourceX - x) +
        Math.abs(x - targetX) +
        Math.abs(sourceY - y) +
        Math.abs(y - targetY);
      if (minimumLength + 16 >= bestScore) continue;
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

function pointsWithDirectedTarget(
  points: XYPosition[],
  targetX: number,
  targetY: number,
  targetPosition: Position,
) {
  const lead = EDGE_PORT_LEAD;
  const approach =
    targetPosition === Position.Top
      ? { x: targetX, y: targetY - lead }
      : targetPosition === Position.Bottom
        ? { x: targetX, y: targetY + lead }
        : targetPosition === Position.Left
          ? { x: targetX - lead, y: targetY }
          : { x: targetX + lead, y: targetY };
  const body = points.slice(0, -1);
  while (
    body.length > 1 &&
    body.at(-1)?.x === targetX &&
    body.at(-1)?.y === targetY
  )
    body.pop();
  const previous = body.at(-1) ?? points[0];
  const elbow =
    targetPosition === Position.Top || targetPosition === Position.Bottom
      ? { x: previous.x, y: approach.y }
      : { x: approach.x, y: previous.y };
  return simplifyOrthogonalPoints([
    ...body,
    elbow,
    approach,
    { x: targetX, y: targetY },
  ]);
}

function pointsWithDirectedSource(
  points: XYPosition[],
  sourceX: number,
  sourceY: number,
  sourcePosition: Position,
) {
  const lead = EDGE_PORT_LEAD;
  const departure =
    sourcePosition === Position.Top
      ? { x: sourceX, y: sourceY - lead }
      : sourcePosition === Position.Bottom
        ? { x: sourceX, y: sourceY + lead }
        : sourcePosition === Position.Left
          ? { x: sourceX - lead, y: sourceY }
          : { x: sourceX + lead, y: sourceY };
  const body = points.slice(1);
  while (body.length > 1 && body[0]?.x === sourceX && body[0]?.y === sourceY)
    body.shift();
  const next = body[0] ?? points.at(-1) ?? departure;
  const elbow =
    sourcePosition === Position.Top || sourcePosition === Position.Bottom
      ? { x: next.x, y: departure.y }
      : { x: departure.x, y: next.y };
  return simplifyOrthogonalPoints([
    { x: sourceX, y: sourceY },
    departure,
    elbow,
    ...body,
  ]);
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
) {
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
  const routedBody = defaultOrthogonalPoints(
    departure.x,
    departure.y,
    approach.x,
    approach.y,
    obstacles,
    reserved,
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

// [OM-FREEPLAY] 超过 600 世界像素视为长线；在目标外侧保留 36px 净空复述变量。
// 内部端口的引入段不放标签，避免标签盖住目标容器的内部结构。
export function terminalLabelPoint(
  points: XYPosition[],
  target: Obstacle | undefined,
  side: Position,
  size: { width: number; height: number },
  primary: XYPosition,
) {
  const end = points.at(-1);
  if (!end || !target) return null;
  const length = points
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y),
      0,
    );
  if (length < 600) return null;
  const vertical = side === Position.Top || side === Position.Bottom;
  const internal =
    side === Position.Top
      ? end.y - target.top
      : side === Position.Bottom
        ? target.bottom - end.y
        : side === Position.Left
          ? end.x - target.left
          : target.right - end.x;
  const distance =
    Math.max(0, internal) + 36 + (vertical ? size.height : size.width) / 2;
  const point = labelPointOnPath(points, Math.max(0, 1 - distance / length));
  if (
    Math.abs(point.x - primary.x) < size.width + 20 &&
    Math.abs(point.y - primary.y) < size.height + 20
  )
    return null;
  if (
    point.x > target.left &&
    point.x < target.right &&
    point.y > target.top &&
    point.y < target.bottom
  )
    return null;
  return point;
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

function moveSegment(
  points: XYPosition[],
  segmentIndex: number,
  pointer: XYPosition,
) {
  const next = points.map((point) => ({ ...point }));
  let startIndex = segmentIndex;
  let endIndex = segmentIndex + 1;
  const start = next[startIndex];
  const end = next[endIndex];
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);

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
type RoutePlan = {
  signature: string;
  routes: Map<string, XYPosition[]>;
  frames: Map<string, RouteFrame>;
  edgeKeys: Map<string, string>;
};
const routingCache = new WeakMap<object, RoutePlan>();
const routingHistory = new WeakMap<object, Map<string, RoutePlan>>();
// 同一次 React Flow 状态更新只规划一次；各边只订阅自己的点列，不订阅整张节点/边数组。
const routingSnapshots = new WeakMap<object, Map<string, XYPosition[]>>();
type RoutingInput = {
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

export function routesForStore(
  owner: object,
  nodes: Node[],
  edges: EditableEdge[],
  lookup: ReadonlyMap<string, InternalNode<Node>>,
) {
  const previous = routingInputs.get(owner);
  // 平移/缩放只改变视口，连世界坐标的签名字符串也不应重新构造。
  // 同时核对可变内部表的数值与端口引用，不能仅凭 nodes 数组引用漏掉 ResizeObserver 更新。
  if (
    previous?.nodes === nodes &&
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
  routingInputs.set(owner, { nodes, edges, geometry, routes });
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
      anchor?.offset ??
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
  const reserved: ReservedSegment[] = [];
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
          : pointsWithDirectedTarget(
              pointsWithDirectedSource(
                pointsWithAnchoredEndpoints(
                  source.x,
                  source.y,
                  target.x,
                  target.y,
                  waypoints,
                ),
                source.x,
                source.y,
                source.side,
              ),
              target.x,
              target.y,
              target.side,
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
      const blocked = changedFrames.some(
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
      const bounds = inflate(
        frame.bounds,
        id === edge.source || id === edge.target ? 8 : EDGE_NODE_CLEARANCE,
      );
      if (id === edge.source || sourceAncestors.has(id))
        sourceFrames.push(bounds);
      if (id === edge.target || targetAncestors.has(id))
        targetFrames.push(bounds);
      return [bounds];
    });
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
      ),
    );
  }
  const plan = { signature, routes, frames, edgeKeys };
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
  markerEnd,
  selected,
  data,
  style,
}: EdgeProps<EditableEdge>) {
  const { screenToFlowPosition, getZoom, setEdges, getInternalNode } =
    useReactFlow<Node, EditableEdge>();
  const store = useStoreApi();
  const route = useStore((state) => {
    let routes = routingSnapshots.get(state);
    if (!routes) {
      // 各 hook 的包装对象不同，getState 才是同一画布的共享身份。
      routes = routesForStore(
        store.getState,
        state.nodes,
        state.edges as EditableEdge[],
        state.nodeLookup,
      );
      routingSnapshots.set(state, routes);
    }
    return routes.get(id);
  });
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [labelSize, setLabelSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const label = labelRef.current;
    if (!label) return;
    const observer = new ResizeObserver((entries) =>
      setLabelSize((current) => {
        const box = entries[0]?.borderBoxSize[0];
        if (!box) return current;
        const width = box.inlineSize,
          height = box.blockSize;
        return current.width === width && current.height === height
          ? current
          : { width, height };
      }),
    );
    observer.observe(label);
    return () => observer.disconnect();
  }, [data?.labelTex]);
  const history = useContext(EditHistoryContext);
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
      anchor?.offset ??
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
  const labelCenter =
    data?.labelPosition === undefined
      ? longestSegmentCenter(points)
      : labelPointOnPath(points, data.labelPosition);
  const targetNode = getInternalNode(target),
    targetAbsolute = targetNode?.internals.positionAbsolute;
  const targetBounds =
    targetAbsolute && targetNode?.measured.width && targetNode.measured.height
      ? {
          left: targetAbsolute.x,
          top: targetAbsolute.y,
          right: targetAbsolute.x + targetNode.measured.width,
          bottom: targetAbsolute.y + targetNode.measured.height,
        }
      : undefined;
  const terminalCenter = terminalLabelPoint(
    points,
    targetBounds,
    targetPosition,
    labelSize,
    labelCenter,
  );
  const path = pathWithLabelGap(
    points,
    data?.labelTex && labelSize.width
      ? [labelCenter, ...(terminalCenter ? [terminalCenter] : [])].map(
          (center) => ({
            left: center.x - labelSize.width / 2,
            right: center.x + labelSize.width / 2,
            top: center.y - labelSize.height / 2,
            bottom: center.y + labelSize.height / 2,
          }),
        )
      : undefined,
  );
  const labelHtml = useMemo(
    () => (data?.labelTex ? latexHtml(data.labelTex) : ""),
    [data?.labelTex],
  );
  const color = data?.color ?? String(style?.stroke ?? "#37685a");
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
    event: ReactPointerEvent<HTMLButtonElement>,
    segmentIndex: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    history?.beginHistory();
    const move = (pointerEvent: PointerEvent) => {
      const pointer = screenToFlowPosition({
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
      });
      const waypoints = moveSegment(points, segmentIndex, pointer);
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
      history?.commitHistory();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };

  const startLabelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    setEdges((current) =>
      current.map((edge) => ({ ...edge, selected: edge.id === id })),
    );
    let changed = false;
    const move = (pointerEvent: PointerEvent) => {
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
            ? { ...edge, data: { ...edge.data, labelPosition: fraction } }
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
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={28}
        style={{
          ...style,
          stroke: color,
          strokeWidth: selected ? 3.4 : Number(style?.strokeWidth ?? 2.2),
        }}
      />
      <EdgeLabelRenderer>
        {data?.labelTex && terminalCenter && (
          <div
            data-edge-terminal-label={id}
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
              pointerEvents: "none",
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
            role="button"
            tabIndex={0}
            aria-label={data.labelTex}
            onPointerDown={startLabelDrag}
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
