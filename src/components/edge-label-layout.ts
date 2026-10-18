export type LabelPoint = { x: number; y: number };
export type LabelRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};
export type LabelSize = { width: number; height: number };
export type LabelEntry = {
  id: string;
  points: LabelPoint[];
  size: LabelSize;
  preferred: LabelPoint;
  terminalPreferred?: LabelPoint;
};
export type LabelPlacement = {
  primary: LabelPoint;
  terminal?: LabelPoint;
  primaryIsTerminal: boolean;
  unresolved: boolean;
};

// [OM-FREEPLAY] 标签与框、其他标签留 6px；与其他线留 4px。600px 沿用项目长线阈值。
const LABEL_CLEARANCE = 6;
export const LONG_EDGE_LENGTH = 600;
export const labelBounds = (
  point: LabelPoint,
  size: LabelSize,
  padding = 0,
): LabelRect => ({
  left: point.x - size.width / 2 - padding,
  right: point.x + size.width / 2 + padding,
  top: point.y - size.height / 2 - padding,
  bottom: point.y + size.height / 2 + padding,
});
export const edgeLength = (points: LabelPoint[]) =>
  points
    .slice(1)
    .reduce(
      (total, p, i) => total + Math.hypot(p.x - points[i].x, p.y - points[i].y),
      0,
    );

/** 统一预留标签位置；先放终端标签，再放主标签。所有候选都在所属路径上。 */
export function layoutEdgeLabels(
  entries: LabelEntry[],
  boxes: LabelRect[],
  routes: ReadonlyMap<string, LabelPoint[]>,
) {
  const placed: LabelRect[] = [];
  const result = new Map<string, LabelPlacement>();
  const wires = [...routes].flatMap(([id, points]) =>
    points.slice(1).map((p, i) => ({
      id,
      left: Math.min(p.x, points[i].x) - 4,
      right: Math.max(p.x, points[i].x) + 4,
      top: Math.min(p.y, points[i].y) - 4,
      bottom: Math.max(p.y, points[i].y) + 4,
    })),
  );
  const locate = (entry: LabelEntry, terminal: boolean) => {
    const { size } = entry;
    const preferred = terminal ? entry.terminalPreferred : entry.preferred;
    // 端口布局的亚像素误差不应把一条可用直线切成两段；仅合并标签候选，不改导线。
    const snapped: LabelPoint[] = [];
    for (const point of entry.points) {
      const previous = snapped.at(-1);
      const next = previous
        ? {
            x: Math.abs(point.x - previous.x) < 0.5 ? previous.x : point.x,
            y: Math.abs(point.y - previous.y) < 0.5 ? previous.y : point.y,
          }
        : point;
      if (!previous || next.x !== previous.x || next.y !== previous.y)
        snapped.push(next);
    }
    const points = snapped.filter((point, i) => {
      if (i === 0 || i === snapped.length - 1) return true;
      const a = snapped[i - 1],
        b = snapped[i + 1];
      return !(
        (a.x === point.x &&
          point.x === b.x &&
          (point.y - a.y) * (b.y - point.y) >= 0) ||
        (a.y === point.y &&
          point.y === b.y &&
          (point.x - a.x) * (b.x - point.x) >= 0)
      );
    });
    const total = edgeLength(points);
    let passed = 0,
      best: { point: LabelPoint; score: number } | undefined;
    const obstacles = [
      ...boxes,
      ...placed,
      ...wires.filter((w) => w.id !== entry.id),
    ];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        horizontal = a.y === b.y;
      const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (!length) continue;
      const start = horizontal ? a.x : a.y,
        end = horizontal ? b.x : b.y,
        fixed = horizontal ? a.y : a.x;
      const half =
        (horizontal ? size.width : size.height) / 2 + LABEL_CLEARANCE;
      const crossHalf =
        (horizontal ? size.height : size.width) / 2 + LABEL_CLEARANCE;
      // 不把标签跨放在折角或箭头上；末段额外保留 24px 箭头线身，避免断口截短箭头。
      let intervals: [number, number][] = [
        [
          Math.min(start, end) +
            half +
            (i === points.length - 1 && end < start ? 24 : 4),
          Math.max(start, end) -
            half -
            (i === points.length - 1 && end > start ? 24 : 4),
        ],
      ];
      for (const rect of obstacles) {
        if (
          fixed < (horizontal ? rect.top : rect.left) - crossHalf ||
          fixed > (horizontal ? rect.bottom : rect.right) + crossHalf
        )
          continue;
        const low = (horizontal ? rect.left : rect.top) - half,
          high = (horizontal ? rect.right : rect.bottom) + half;
        // 只切真正相交的区间；远处障碍不再为每个候选复制数组。
        // 保持原来的闭区间、排序及端点规则，减少连续拖动中的临时分配。
        for (let j = intervals.length - 1; j >= 0; j--) {
          const [l, h] = intervals[j];
          if (h < l) {
            intervals.splice(j, 1);
          } else if (high > l && low < h) {
            const leftEnd = Math.min(h, low),
              rightStart = Math.max(l, high);
            if (leftEnd >= l && rightStart <= h)
              intervals.splice(j, 1, [l, leftEnd], [rightStart, h]);
            else if (leftEnd >= l) intervals[j] = [l, leftEnd];
            else if (rightStart <= h) intervals[j] = [rightStart, h];
            else intervals.splice(j, 1);
          }
        }
        if (!intervals.length) break;
      }
      for (const [low, high] of intervals) {
        if (high < low) continue;
        const wanted = preferred
          ? horizontal
            ? preferred.x
            : preferred.y
          : end;
        const value = Math.max(low, Math.min(high, wanted));
        const point = horizontal
          ? { x: value, y: fixed }
          : { x: fixed, y: value };
        const score = preferred
          ? Math.hypot(point.x - preferred.x, point.y - preferred.y)
          : total - passed - Math.abs(value - start);
        if (!best || score < best.score) best = { point, score };
      }
      passed += length;
    }
    if (best) placed.push(labelBounds(best.point, size, LABEL_CLEARANCE));
    return best?.point;
  };
  // 固定排序避免挂载与测量顺序决定谁挤掉谁。
  const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));
  for (const entry of sorted) {
    const terminal =
      edgeLength(entry.points) >= LONG_EDGE_LENGTH
        ? locate(entry, true)
        : undefined;
    result.set(entry.id, {
      primary: entry.preferred,
      terminal,
      primaryIsTerminal: false,
      unresolved: false,
    });
  }
  for (const entry of sorted) {
    const placement = result.get(entry.id)!;
    const primary = locate(entry, false);
    if (primary) placement.primary = primary;
    else if (placement.terminal) {
      placement.primary = placement.terminal;
      placement.terminal = undefined;
      placement.primaryIsTerminal = true;
    } else placement.unresolved = true;
  }
  return result;
}

// 尺寸由同一画布的 ResizeObserver 回报；平移缩放不改变世界坐标尺寸，也不触发重新规划。
const registries = new WeakMap<object, ReturnType<typeof createRegistry>>();
function createRegistry() {
  let version = 0;
  const sizes = new Map<string, LabelSize & { tex: string }>(),
    listeners = new Set<() => void>(),
    targets = new Map<Element, { id: string; tex: string }>();
  let observer: ResizeObserver | undefined;
  // 一批测量原子发布一次，避免 E 条边各自触发一次全图路由。
  const measure = (values: (LabelSize & { id: string; tex: string })[]) => {
    let changed = false;
    for (const { id, tex, width, height } of values) {
      const old = sizes.get(id);
      if (old?.tex === tex && old.width === width && old.height === height)
        continue;
      sizes.set(id, { tex, width, height });
      changed = true;
    }
    if (!changed) return;
    version++;
    listeners.forEach((listener) => listener());
  };
  return {
    sizes,
    measure,
    observe: (element: Element, id: string, tex: string) => {
      targets.set(element, { id, tex });
      observer ??= new ResizeObserver((entries) => {
        measure(
          entries.flatMap((entry) => {
            const target = targets.get(entry.target),
              box = entry.borderBoxSize[0];
            return target && box
              ? [{ ...target, width: box.inlineSize, height: box.blockSize }]
              : [];
          }),
        );
      });
      observer.observe(element);
      return () => {
        targets.delete(element);
        observer?.unobserve(element);
        if (!targets.size) {
          observer?.disconnect();
          observer = undefined;
        }
      };
    },
    getSnapshot: () => version,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export function labelRegistry(owner: object) {
  let registry = registries.get(owner);
  if (!registry) {
    registry = createRegistry();
    registries.set(owner, registry);
  }
  return registry;
}
