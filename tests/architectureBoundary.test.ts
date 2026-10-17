import { afterEach, describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import {
  architectureFanoutGap,
  architectureArrowMarker,
  automaticOrthogonalPoints,
  findBoundaryConnection,
  labelPointOnPath,
  projectLabelOntoPath,
  sharedRouteLength,
  pathWithLabelGap,
  moveSegment,
  manualOrthogonalPoints,
  simplifyOrthogonalPoints,
} from "../src/components/EditableArchitectureGraph";
import { buildGraph } from "../src/compositions/DeepSeekV41Layer";

it("拖动延用安全通道；新障碍挡住旧通道时重新避让", () => {
  const previous = [
    { x: 0, y: 0 },
    { x: 0, y: 180 },
    { x: 400, y: 180 },
    { x: 400, y: 500 },
  ];
  const route = (
    obstacles: { left: number; right: number; top: number; bottom: number }[],
  ) =>
    automaticOrthogonalPoints(
      10,
      0,
      400,
      500,
      Position.Bottom,
      Position.Top,
      obstacles,
      [],
      [],
      [],
      previous,
    );
  expect(route([])).toEqual([
    { x: 10, y: 0 },
    { x: 10, y: 180 },
    { x: 400, y: 180 },
    { x: 400, y: 500 },
  ]);
  const blocked = route([{ left: 150, right: 250, top: 150, bottom: 210 }]);
  expect(blocked).not.toEqual(route([]));
  for (let i = 1; i < blocked.length; i++) {
    const a = blocked[i - 1],
      b = blocked[i];
    expect(
      a.y === b.y &&
        a.y > 150 &&
        a.y < 210 &&
        Math.min(a.x, b.x) < 250 &&
        Math.max(a.x, b.x) > 150,
    ).toBe(false);
    expect(
      a.x === b.x &&
        a.x > 150 &&
        a.x < 250 &&
        Math.min(a.y, b.y) < 210 &&
        Math.max(a.y, b.y) > 150,
    ).toBe(false);
  }
});

it("保留起终点范围外、两个障碍之间的窄通道", () => {
  const source = { left: 356, right: 1184, top: 7987, bottom: 8658 };
  const target = { left: 1116, right: 2604, top: 10770, bottom: 13189 };
  const kv = { left: 876, right: 2364, top: 8750, bottom: 9971 };
  const compressor = { left: 2576, right: 4464, top: 8750, bottom: 10602 };
  const points = automaticOrthogonalPoints(
    1140,
    8409,
    1860,
    10814,
    Position.Right,
    Position.Top,
    [source, target, kv, compressor],
    [],
    [source],
    [target],
  );
  expect(points.some((p) => p.x >= kv.right && p.x <= compressor.left)).toBe(
    true,
  );
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    for (const box of [kv, compressor]) {
      const crosses =
        a.x === b.x
          ? a.x > box.left &&
            a.x < box.right &&
            Math.max(a.y, b.y) > box.top &&
            Math.min(a.y, b.y) < box.bottom
          : a.y > box.top &&
            a.y < box.bottom &&
            Math.max(a.x, b.x) > box.left &&
            Math.min(a.x, b.x) < box.right;
      expect(crosses).toBe(false);
    }
  }
});

describe("人工折线端点接入", () => {
  it("窄间隙直线横移后，两端引线不重叠", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 0, y: 20 },
    ];
    const path = manualOrthogonalPoints(
      0,
      0,
      0,
      20,
      Position.Bottom,
      Position.Top,
      moveSegment(line, 0, { x: 30, y: 0 }),
    );
    expect(path).toHaveLength(6);
    expect(path[1].y).toBeGreaterThan(0);
    expect(path[1].y).toBeLessThan(path.at(-2)!.y);
    expect(path.at(-2)!.y).toBeLessThan(20);
  });
  const base = [
    { x: 0, y: 0 },
    { x: 0, y: 100 },
    { x: 900, y: 100 },
    { x: 900, y: 500 },
  ];
  const rotate = (p: { x: number; y: number }, turns: number) => {
    for (let i = 0; i < turns; i++) p = { x: -p.y, y: p.x };
    return { x: p.x || 0, y: p.y || 0 };
  };
  const sides = [Position.Bottom, Position.Left, Position.Top, Position.Right];
  for (let turn = 0; turn < 4; turn++) {
    it(`${sides[turn]} 出线：拖动首段、中段、末段不重走线段，端点方向正确且恢复幂等`, () => {
      const points = base.map((p) => rotate(p, turn));
      const source = points[0],
        target = points.at(-1)!;
      const route = (waypoints: typeof points) =>
        manualOrthogonalPoints(
          source.x,
          source.y,
          target.x,
          target.y,
          sides[turn],
          sides[(turn + 2) % 4],
          waypoints,
        );
      for (const segment of [0, 1, 2]) {
        for (const displacement of [0, 8, 90, -70, 600, -180, 0]) {
          const delta = rotate(
            segment === 1
              ? { x: 0, y: displacement }
              : { x: displacement, y: 0 },
            turn,
          );
          const path = route(moveSegment(points, segment, delta));
          expect(path[0]).toEqual(source);
          expect(path.at(-1)).toEqual(target);
          expect(route(path.slice(1, -1))).toEqual(path);
          const normal = rotate({ x: 0, y: 1 }, turn);
          const dot = (a: typeof source, b: typeof source) =>
            (b.x - a.x) * normal.x + (b.y - a.y) * normal.y;
          expect(dot(source, path[1])).toBeGreaterThan(0);
          expect(dot(path.at(-2)!, target)).toBeGreaterThan(0);
          const segments = path.slice(1).map((b, i) => ({ a: path[i], b }));
          for (const [i, { a, b }] of segments.entries()) {
            expect(a.x === b.x || a.y === b.y).toBe(true);
            for (const { a: c, b: d } of segments.slice(i + 1)) {
              if (a.x === b.x && c.x === d.x && a.x === c.x)
                expect(
                  Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) -
                    Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)),
                ).toBeLessThanOrEqual(0);
              if (a.y === b.y && c.y === d.y && a.y === c.y)
                expect(
                  Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) -
                    Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)),
                ).toBeLessThanOrEqual(0);
            }
          }
        }
      }
      expect(route(base.slice(1, -1).map((p) => rotate(p, turn)))).toEqual(
        points,
      );
    });
  }
  it("恢复已有尾刺时只消去重走部分，不改变连接对象或远端通道", () => {
    const path = manualOrthogonalPoints(
      0,
      0,
      900,
      500,
      Position.Bottom,
      Position.Top,
      [
        { x: 0, y: 100 },
        { x: 990, y: 100 },
        { x: 990, y: 500 },
        { x: 990, y: 476 },
        { x: 900, y: 476 },
      ],
    );
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 990, y: 100 },
      { x: 990, y: 476 },
      { x: 900, y: 476 },
      { x: 900, y: 500 },
    ]);
  });
});

it("重合折点化简保留直角，不能删成斜线", () => {
  const a = { x: 0, y: 0 },
    b = { x: 0, y: 100 },
    c = { x: 900, y: 100 };
  expect(simplifyOrthogonalPoints([a, b, b, c])).toEqual([a, b, c]);
  expect(simplifyOrthogonalPoints([a, a, b, b, b, c, c])).toEqual([a, b, c]);
});

it("拖动长折线以初始路径的法向位移为准，往返不漂移，端点不变", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 0, y: 100 },
    { x: 900, y: 100 },
    { x: 900, y: 200 },
  ];
  for (const y of [0, 6, 70, -120, 13, 0]) {
    const path = [
      points[0],
      ...moveSegment(points, 1, { x: 200, y }),
      points[3],
    ];
    expect(path).toEqual([
      points[0],
      { x: 0, y: 100 + y },
      { x: 900, y: 100 + y },
      points[3],
    ]);
    path
      .slice(1)
      .forEach((p, i) =>
        expect(p.x === path[i].x || p.y === path[i].y).toBe(true),
      );
  }
  for (const segment of [0, 2]) {
    const path = [
      points[0],
      ...moveSegment(points, segment, { x: 30, y: 0 }),
      points[3],
    ];
    path
      .slice(1)
      .forEach((p, i) =>
        expect(p.x === path[i].x || p.y === path[i].y).toBe(true),
      );
  }
});

it("相向端口安全区重叠时仍然直连，不产生窄 U 形尾刺", () => {
  const source = { left: -100, right: 44, top: -80, bottom: 80 };
  const target = { left: 41, right: 200, top: -80, bottom: 80 };
  expect(
    automaticOrthogonalPoints(
      0,
      0,
      85,
      0,
      Position.Right,
      Position.Left,
      [source, target],
      [],
      [source],
      [target],
    ),
  ).toEqual([
    { x: 0, y: 0 },
    { x: 85, y: 0 },
  ]);
  const blocker = { left: 50, right: 60, top: -10, bottom: 10 };
  expect(
    automaticOrthogonalPoints(
      0,
      0,
      85,
      0,
      Position.Right,
      Position.Left,
      [source, target, blocker],
      [],
      [source],
      [target],
    ).length,
  ).toBeGreaterThan(2);
});

it("无遮挡右出上入优先一次转折，垂直对齐优先零转折", () => {
  for (const distance of [200, 2000, 20000]) {
    const corner = automaticOrthogonalPoints(
      0,
      0,
      distance,
      distance,
      Position.Right,
      Position.Top,
      [],
    );
    expect(corner).toEqual([
      { x: 0, y: 0 },
      { x: distance, y: 0 },
      { x: distance, y: distance },
    ]);
    const straight = automaticOrthogonalPoints(
      0,
      0,
      0,
      distance,
      Position.Bottom,
      Position.Top,
      [],
    );
    expect(straight).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: distance },
    ]);
  }
});

it("绕障时出入通道独立选择，不为少拐而重叠既有线", () => {
  const existing = [
    [
      { x: -60, y: 40 },
      { x: 300, y: 40 },
    ],
    [
      { x: -60, y: 260 },
      { x: 300, y: 260 },
    ],
  ];
  const route = automaticOrthogonalPoints(
    60,
    0,
    200,
    300,
    Position.Bottom,
    Position.Top,
    [{ left: -10, right: 240, top: 80, bottom: 220 }],
    existing.map(([start, end]) => ({ start, end })),
    [{ left: -10, right: 110, top: -40, bottom: 40 }],
    [{ left: 150, right: 250, top: 260, bottom: 340 }],
  );
  for (const line of existing) expect(sharedRouteLength(route, line)).toBe(0);
  expect(route.length - 2).toBe(4);
  expect(route[1].x).toBe(60);
  expect(route.at(-2)!.x).toBe(200);
});

it("Compressor 的归一化分支与缓存矩阵使用不同真实出口", () => {
  for (const layer of [15, 29]) {
    const edges = buildGraph(layer).edges;
    expect(
      edges.find((edge) => edge.id === "compressor-indexer")?.sourceHandle,
    ).toBe("to-indexer");
    expect(
      edges.find((edge) => edge.id === "indexer-matrix")?.sourceHandle,
    ).toBe("global-kv-out");
  }
});

it("端点附近密集框边界不挤掉相隔完整线间距的扇出通道", () => {
  const source = { left: -24, right: 864, top: 10518, bottom: 10770 };
  const target = { left: -4, right: 2484, top: 15086, bottom: 17779 };
  const existing = [
    { x: 1265, y: 9932 },
    { x: 1265, y: 10770 },
    { x: 830, y: 10770 },
  ];
  const route = automaticOrthogonalPoints(
    656,
    10706,
    2043,
    15257,
    Position.Bottom,
    Position.Top,
    [
      source,
      target,
      { left: -1000, right: 600, top: 10700, bottom: 14000 },
      { left: -4, right: 864, top: 10862, bottom: 13967 },
      { left: 1000, right: 2400, top: 10862, bottom: 13967 },
      ...[10772, 10774, 10776].map((top) => ({
        left: 1200,
        right: 1201,
        top,
        bottom: top + 1,
      })),
    ],
    existing.slice(1).map((end, i) => ({ start: existing[i], end })),
    [source],
    [target],
  );
  expect(sharedRouteLength(route, existing)).toBe(0);
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      horizontal = a.y === b.y;
    for (let j = 1; j < existing.length; j++) {
      const c = existing[j - 1],
        d = existing[j];
      if (horizontal !== (c.y === d.y)) continue;
      const axis = horizontal ? "x" : "y",
        normal = horizontal ? "y" : "x";
      const overlap =
        Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis])) -
        Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]));
      if (overlap > 0)
        expect(
          Math.abs(a[normal] - c[normal]),
          JSON.stringify(route),
        ).toBeGreaterThanOrEqual(44);
    }
  }
});

it("Indexer 权重输入直接来自归一化 X，复用层不重复接入", () => {
  for (const layer of [3, 15, 25, 29]) {
    const edge = buildGraph(layer).edges.find(
      (edge) => edge.id === "norm-index-weights",
    );
    expect(edge).toMatchObject({
      source: "norm1",
      target: "indexer",
      sourceHandle: "index-weights",
      targetHandle: "weight-input",
    });
  }
  expect(
    buildGraph(4).edges.some((edge) => edge.id === "norm-index-weights"),
  ).toBe(false);
});

it("全层箭头独立于线宽，箭翼不占满相邻通道，转角到端口留足直线", () => {
  const marker = architectureArrowMarker("#123456");
  expect(marker.markerUnits).toBe("userSpaceOnUse");
  // React Flow 开口箭头路径为 -5,-4 → 0,0 → -5,4，视口为 20×20。
  const arrowWidth = ((8 + marker.strokeWidth!) * marker.height!) / 20;
  const arrowLength = ((5 + marker.strokeWidth!) * marker.width!) / 20;
  expect(arrowWidth + 3.4).toBeLessThan(16);
  for (const side of [
    Position.Top,
    Position.Bottom,
    Position.Left,
    Position.Right,
  ]) {
    const points = automaticOrthogonalPoints(
      0,
      0,
      300,
      300,
      Position.Bottom,
      side,
      [],
    );
    const end = points.at(-1)!,
      before = points.at(-2)!;
    expect(Math.hypot(end.x - before.x, end.y - before.y)).toBeGreaterThan(
      arrowLength + 8,
    );
  }
  for (const layer of [1, 15, 29, 40]) {
    for (const edge of buildGraph(layer).edges) {
      expect(edge.markerEnd).toMatchObject({
        markerUnits: "userSpaceOnUse",
        width: 24,
        height: 24,
      });
    }
  }
});

it("窄入口不能先沿框边到达再倒车，自动路径不留下反向尾刺", () => {
  const frame = { left: 62, top: 500, right: 1500, bottom: 1500 };
  const points = automaticOrthogonalPoints(
    715,
    0,
    70,
    1000,
    Position.Left,
    Position.Left,
    [frame],
    [],
    [],
    [frame],
  );
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    expect(
      (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y),
    ).toBeGreaterThanOrEqual(0);
  }
  expect(points.at(-2)!.x).toBeLessThanOrEqual(46);
  expect(points.at(-2)!.y).toBe(1000);
});

function addFrame(
  id: string,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const node = document.createElement("div");
  node.className = "react-flow__node";
  node.dataset.id = id;
  const content = document.createElement("div");
  content.dataset.boundaryConnectable = "true";
  node.append(content);
  node.getBoundingClientRect = () => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  });
  document.body.append(node);
  return node;
}

afterEach(() => document.body.replaceChildren());

it("透明标签分别断开所属线条", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 0, y: 1000 },
  ];
  expect(
    pathWithLabelGap(points, [
      { left: -40, right: 40, top: 390, bottom: 410 },
      { left: -40, right: 40, top: 844, bottom: 864 },
    ]),
  ).toBe("M 0 0 L 0 390 M 0 410 L 0 844 M 0 864 L 0 1000");
});

describe("自动连线分配独立通道", () => {
  it("起终点位于宽分组投影内时，经外侧多折通道绕开全部分组", () => {
    const obstacles = [
      { left: 422, right: 1178, top: 72, bottom: 328 },
      { left: 272, right: 1928, top: 372, bottom: 578 },
      { left: 2072, right: 3128, top: 372, bottom: 678 },
      { left: 272, right: 2328, top: 672, bottom: 928 },
      { left: 272, right: 1328, top: 972, bottom: 1528 },
    ];
    const path = automaticOrthogonalPoints(
      1150,
      200,
      1050,
      1000,
      Position.Right,
      Position.Top,
      obstacles,
      [],
      [obstacles[0]],
      [obstacles[4]],
    );
    for (let i = 1; i < path.length; i++)
      for (const box of obstacles.slice(1, 4)) {
        const a = path[i - 1],
          b = path[i];
        const crosses =
          a.x === b.x
            ? a.x > box.left &&
              a.x < box.right &&
              Math.max(a.y, b.y) > box.top &&
              Math.min(a.y, b.y) < box.bottom
            : a.y > box.top &&
              a.y < box.bottom &&
              Math.max(a.x, b.x) > box.left &&
              Math.min(a.x, b.x) < box.right;
        expect(crosses).toBe(false);
      }
  });
  it("内部小框出线先离开父框安全区，再转弯", () => {
    const parent = { left: -8, top: 477, right: 848, bottom: 1283 };
    const neighbor = { left: 892, top: 477, right: 1448, bottom: 973 };
    const path = automaticOrthogonalPoints(
      792,
      651,
      1370,
      1363,
      Position.Right,
      Position.Top,
      [parent, neighbor],
      [],
      [parent],
    );
    expect(path[1].y).toBe(651);
    expect(path[1].x).toBeGreaterThanOrEqual(parent.right);
    for (let i = 2; i < path.length; i += 1) {
      const a = path[i - 1],
        b = path[i];
      if (a.x === b.x && Math.max(a.y, b.y) > 505 && Math.min(a.y, b.y) < 1255)
        expect(Math.abs(a.x - 820)).toBeGreaterThanOrEqual(28);
    }
  });
  it("六路扇出不共用折线段，且上下端保持垂直", () => {
    const paths: Array<Array<{ x: number; y: number }>> = [];
    const reserved: Array<{
      start: { x: number; y: number };
      end: { x: number; y: number };
    }> = [];
    for (let i = 0; i < 6; i += 1) {
      const path = automaticOrthogonalPoints(
        600 + i * 90,
        0,
        100 + i * 180,
        architectureFanoutGap(6),
        Position.Bottom,
        Position.Top,
        [],
        reserved,
      );
      for (const previous of paths)
        expect(sharedRouteLength(path, previous)).toBe(0);
      expect(path[0].x).toBe(path[1].x);
      expect(path.at(-1)?.x).toBe(path.at(-2)?.x);
      paths.push(path);
      for (let j = 1; j < path.length; j += 1)
        reserved.push({ start: path[j - 1], end: path[j] });
    }
  });

  it("保留起点附近的窄通道，不从并列框内部穿过", () => {
    const obstacles = [
      { left: 822, top: 477, right: 1378, bottom: 973 },
      { left: 20, top: 1067, right: 820, bottom: 1267 },
    ];
    const path = automaticOrthogonalPoints(
      792,
      651,
      1370,
      1363,
      Position.Right,
      Position.Top,
      obstacles,
    );
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1],
        b = path[i];
      for (const box of obstacles) {
        const crosses =
          a.y === b.y
            ? a.y > box.top &&
              a.y < box.bottom &&
              Math.max(a.x, b.x) > box.left &&
              Math.min(a.x, b.x) < box.right
            : a.x > box.left &&
              a.x < box.right &&
              Math.max(a.y, b.y) > box.top &&
              Math.min(a.y, b.y) < box.bottom;
        expect(crosses).toBe(false);
      }
    }
  });
});

describe("架构图连续边缘吸附", () => {
  it("靠近边缘任意位置即可落线，不要求对准固定起线点", () => {
    addFrame("matrix", 100, 100, 400, 200);
    expect(
      findBoundaryConnection(document.body, { x: 394, y: 88 }),
    ).toMatchObject({
      nodeId: "matrix",
      anchor: { side: Position.Top, offset: 0.735 },
    });
    expect(
      findBoundaryConnection(document.body, { x: 508, y: 246 }),
    ).toMatchObject({
      nodeId: "matrix",
      anchor: { side: Position.Right, offset: 0.73 },
    });
  });

  it("沿原边平滑拖动，拐角附近轻微抖动保持当前边", () => {
    addFrame("matrix", 100, 100, 400, 200);
    expect(
      findBoundaryConnection(document.body, { x: 104, y: 103 }, undefined, {
        nodeId: "matrix",
        side: Position.Top,
      }),
    ).toMatchObject({ anchor: { side: Position.Top, offset: 0.01 } });
    expect(
      findBoundaryConnection(document.body, { x: 95, y: 99 }, undefined, {
        nodeId: "matrix",
        side: Position.Top,
      }),
    ).toMatchObject({ anchor: { side: Position.Top, offset: 0 } });
    expect(
      findBoundaryConnection(document.body, { x: 101, y: 104 }, undefined, {
        nodeId: "matrix",
        side: Position.Top,
      }),
    ).toMatchObject({ anchor: { side: Position.Top } });
  });

  it("同一次拖动可连续切换四条边并再次回到顶部", () => {
    addFrame("matrix", 100, 100, 400, 200);
    let preferred = { nodeId: "matrix", side: Position.Top };
    for (const [x, y, side, offset] of [
      [500, 115, Position.Right, 0.075],
      [485, 300, Position.Bottom, 0.9625],
      [100, 285, Position.Left, 0.925],
      [115, 100, Position.Top, 0.0375],
    ] as const) {
      const connection = findBoundaryConnection(
        document.body,
        { x, y },
        undefined,
        preferred,
      );
      expect(connection).toMatchObject({
        nodeId: "matrix",
        anchor: { side, offset },
      });
      preferred = { nodeId: connection!.nodeId, side: connection!.anchor.side };
    }
  });

  it("换边后的路由按新边法向进入，箭头方向随之改变", () => {
    for (const side of [
      Position.Top,
      Position.Right,
      Position.Bottom,
      Position.Left,
    ]) {
      const path = automaticOrthogonalPoints(
        0,
        0,
        300,
        300,
        Position.Bottom,
        side,
        [],
      );
      const end = path.at(-1)!,
        before = path.at(-2)!;
      if (side === Position.Top) {
        expect(before.x).toBe(end.x);
        expect(before.y).toBeLessThan(end.y);
      }
      if (side === Position.Bottom) {
        expect(before.x).toBe(end.x);
        expect(before.y).toBeGreaterThan(end.y);
      }
      if (side === Position.Left) {
        expect(before.y).toBe(end.y);
        expect(before.x).toBeLessThan(end.x);
      }
      if (side === Position.Right) {
        expect(before.y).toBe(end.y);
        expect(before.x).toBeGreaterThan(end.x);
      }
    }
  });

  it("可以改连另一个框，远离所有边缘时不误连", () => {
    addFrame("old", 100, 100, 400, 200);
    addFrame("next", 600, 100, 200, 400);
    expect(
      findBoundaryConnection(document.body, { x: 590, y: 380 }, undefined, {
        nodeId: "old",
        side: Position.Top,
      }),
    ).toMatchObject({
      nodeId: "next",
      anchor: { side: Position.Left, offset: 0.7 },
    });
    expect(
      findBoundaryConnection(document.body, { x: 350, y: 200 }),
    ).toBeNull();
  });

  it("不会吸附回被排除的另一端节点，重叠边界优先内部小框", () => {
    addFrame("outer", 100, 100, 400, 200);
    addFrame("inner", 100, 140, 100, 80);
    expect(
      findBoundaryConnection(document.body, { x: 98, y: 180 }),
    ).toMatchObject({ nodeId: "inner" });
    expect(
      findBoundaryConnection(document.body, { x: 98, y: 180 }, "inner"),
    ).toMatchObject({ nodeId: "outer" });
  });
});

describe("连线文字沿线路拖动", () => {
  const path = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it("离开线路的鼠标位置投影回最近线段", () => {
    expect(projectLabelOntoPath(path, { x: 50, y: 35 })).toMatchObject({
      x: 50,
      y: 0,
      fraction: 0.25,
    });
    expect(projectLabelOntoPath(path, { x: 130, y: 60 })).toMatchObject({
      x: 100,
      y: 60,
      fraction: 0.8,
    });
  });

  it("不会拖出线的两端", () => {
    expect(projectLabelOntoPath(path, { x: -20, y: -40 })).toMatchObject({
      x: 0,
      y: 0,
      fraction: 0,
    });
    expect(projectLabelOntoPath(path, { x: 130, y: 140 })).toMatchObject({
      x: 100,
      y: 100,
      fraction: 1,
    });
  });

  it("路径改变后保存的相对位置仍位于线上", () => {
    expect(labelPointOnPath(path, 0.75)).toEqual({ x: 100, y: 50 });
    expect(
      labelPointOnPath(
        [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
          { x: 200, y: 200 },
        ],
        0.75,
      ),
    ).toEqual({ x: 200, y: 100 });
  });
});
