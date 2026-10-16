import { describe, expect, it, vi } from "vitest";
import katex from "katex";
import { Position, type InternalNode, type Node } from "@xyflow/react";
import {
  latexHtml,
  pathWithLabelGap,
  planArchitectureRoutes,
  routesForStore,
  type EditableEdge,
} from "../src/components/EditableArchitectureGraph";
import {
  applySavedLayout,
  buildGraph,
  buildMeasuredGraph,
  captureDiagramLayout,
  isArchitectureDetailVisible,
  measurementsForGraph,
  restoreMeasuredGeometry,
} from "../src/compositions/DeepSeekV41Layer";

it("移出再移入屏幕不重复排版同一公式，行间与行内缓存分开", () => {
  const render = vi.spyOn(katex, "renderToString");
  try {
    const tex = "x_{\\mathrm{panCacheRegression}}";
    expect(latexHtml(tex)).toBe(latexHtml(tex));
    expect(render).toHaveBeenCalledTimes(1);
    expect(latexHtml(tex, true)).toContain('display="block"');
    expect(render).toHaveBeenCalledTimes(2);
  } finally {
    render.mockRestore();
  }
});

it("原生公式保留分数、上下标和 TeX 语义，不生成逐字形 HTML 盒", () => {
  const root = document.createElement("div");
  root.innerHTML = latexHtml(
    "\\frac{q_{1,t}K^{\\mathsf T}}{\\sqrt{512}}",
    true,
  );
  expect(root.querySelector('math[display="block"]')).not.toBeNull();
  expect(root.querySelector("mfrac")).not.toBeNull();
  expect(root.querySelector("msub")).not.toBeNull();
  expect(root.querySelector("msqrt")).not.toBeNull();
  expect(
    root.querySelector('annotation[encoding="application/x-tex"]')?.textContent,
  ).toContain("q_{1,t}");
  expect(root.querySelector(".katex-html")).toBeNull();
});

describe("文章内画布按实际屏幕裁剪", () => {
  const viewport = {
    x: 0,
    y: 0,
    zoom: 1,
    width: 1000,
    height: 2600,
    clip: { left: 0, top: 0, right: 1000, bottom: 650 },
  };
  it("屏幕下方内容不因为画布很高而保持渲染", () => {
    expect(
      isArchitectureDetailVisible(
        { x: 100, y: 1200, width: 600, height: 400 },
        viewport,
      ),
    ).toBe(false);
    expect(
      isArchitectureDetailVisible(
        { x: 100, y: 600, width: 600, height: 400 },
        viewport,
      ),
    ).toBe(true);
  });
  it("区分屏幕内立即显示与屏幕外的可中断预加载", () => {
    const rect = { x: 100, y: 800, width: 600, height: 400 };
    expect(isArchitectureDetailVisible(rect, viewport)).toBe(true);
    expect(isArchitectureDetailVisible(rect, viewport, 0)).toBe(false);
    expect(isArchitectureDetailVisible(rect, { ...viewport, y: -200 }, 0)).toBe(
      true,
    );
  });
  it("页面滚动或画布平移后显示进入屏幕的内容", () => {
    const rect = { x: 100, y: 1200, width: 600, height: 400 };
    expect(
      isArchitectureDetailVisible(rect, {
        ...viewport,
        clip: { left: 0, top: 1000, right: 1000, bottom: 1650 },
      }),
    ).toBe(true);
    expect(isArchitectureDetailVisible(rect, { ...viewport, y: -800 })).toBe(
      true,
    );
  });
});

function fixture() {
  const nodes: Node[] = [
    { id: "a", position: { x: 0, y: 0 }, data: {} },
    { id: "b", position: { x: 0, y: 400 }, data: {} },
    { id: "c", position: { x: 600, y: 0 }, data: {} },
    { id: "d", position: { x: 600, y: 400 }, data: {} },
  ];
  const internals = new Map(
    nodes.map((node) => [
      node.id,
      {
        ...node,
        measured: { width: 100, height: 80 },
        internals: {
          positionAbsolute: { ...node.position },
          z: 0,
          userNode: node,
          handleBounds: {
            source: [
              {
                id: "out",
                nodeId: node.id,
                type: "source",
                position: Position.Bottom,
                x: 45,
                y: 75,
                width: 10,
                height: 10,
              },
            ],
            target: [
              {
                id: "in",
                nodeId: node.id,
                type: "target",
                position: Position.Top,
                x: 45,
                y: -5,
                width: 10,
                height: 10,
              },
            ],
          },
        },
      } as InternalNode<Node>,
    ]),
  );
  const edges: EditableEdge[] = [
    {
      id: "ab",
      source: "a",
      target: "b",
      sourceHandle: "out",
      targetHandle: "in",
    },
    {
      id: "cd",
      source: "c",
      target: "d",
      sourceHandle: "out",
      targetHandle: "in",
    },
  ];
  return {
    nodes,
    edges,
    internals,
    getNode: (id: string) => internals.get(id),
    owner: {},
  };
}

describe("架构图增量路由", () => {
  it("内部具名端口连接小框本身，人工锚点仍连接外框", () => {
    const f = fixture();
    const a = f.internals.get("a")!,
      b = f.internals.get("b")!;
    a.internals.handleBounds!.source![0] = {
      id: "out",
      nodeId: "a",
      type: "source",
      position: Position.Right,
      x: 55,
      y: 35,
      width: 10,
      height: 10,
    };
    b.internals.handleBounds!.target![0] = {
      id: "in",
      nodeId: "b",
      type: "target",
      position: Position.Left,
      x: 25,
      y: 35,
      width: 10,
      height: 10,
    };
    const route = planArchitectureRoutes(
      f.owner,
      f.nodes,
      f.edges,
      f.getNode,
    ).get("ab")!;
    expect(route[0]).toEqual({ x: 60, y: 40 });
    expect(route.at(-1)).toEqual({ x: 30, y: 440 });
    expect(route[1].x).toBeGreaterThanOrEqual(108);
    const edges = f.edges.map((e) =>
      e.id === "ab"
        ? {
            ...e,
            data: { sourceAnchor: { side: Position.Right, offset: 0.5 } },
          }
        : e,
    );
    expect(
      planArchitectureRoutes(f.owner, f.nodes, edges, f.getNode).get("ab")![0],
    ).toEqual({ x: 100, y: 40 });
  });
  it("视口更新复用路由，内部尺寸单独改变仍会失效", () => {
    const f = fixture();
    const first = routesForStore(f.owner, f.nodes, f.edges, f.internals);
    expect(routesForStore(f.owner, f.nodes, f.edges, f.internals)).toBe(first);
    f.internals.get("a")!.measured.width = 200;
    expect(routesForStore(f.owner, f.nodes, f.edges, f.internals)).not.toBe(
      first,
    );
  });
  it("返回完整相同几何时复用该版本路由，恢复后继续编辑仍从正确版本增量计算", () => {
    const f = fixture();
    const first = planArchitectureRoutes(f.owner, f.nodes, f.edges, f.getNode);
    const node = f.internals.get("a")!;
    const originalX = node.internals.positionAbsolute.x;
    node.internals.positionAbsolute.x = originalX + 60;
    const moved = planArchitectureRoutes(f.owner, f.nodes, f.edges, f.getNode);
    expect(moved).not.toBe(first);
    node.internals.positionAbsolute.x = originalX;
    expect(planArchitectureRoutes(f.owner, f.nodes, f.edges, f.getNode)).toBe(
      first,
    );
    node.internals.positionAbsolute.x = originalX + 60;
    expect(planArchitectureRoutes(f.owner, f.nodes, f.edges, f.getNode)).toBe(
      moved,
    );
    node.internals.handleBounds!.source![0].x += 12;
    const edited = planArchitectureRoutes(f.owner, f.nodes, f.edges, f.getNode);
    expect(edited).not.toBe(moved);
    expect(edited.get("ab")![0].x).toBe(moved.get("ab")![0].x + 12);
  });
  it("缩放测量浮点尾差不重排通道，真正移动端口仍更新", () => {
    const f = fixture();
    const first = planArchitectureRoutes(f.owner, f.nodes, f.edges, f.getNode);
    f.internals.get("a")!.internals.handleBounds!.source![0].x += 1e-8;
    expect(planArchitectureRoutes(f.owner, f.nodes, f.edges, f.getNode)).toBe(
      first,
    );
    f.internals.get("a")!.internals.handleBounds!.source![0].x += 1;
    expect(
      planArchitectureRoutes(f.owner, f.nodes, f.edges, f.getNode),
    ).not.toBe(first);
  });
  it("选择或改标签不改变几何，不重算路线", () => {
    const { owner, nodes, edges, getNode } = fixture();
    const first = planArchitectureRoutes(owner, nodes, edges, getNode);
    expect(
      planArchitectureRoutes(
        owner,
        nodes.map((n) => ({ ...n, selected: true })),
        edges.map((e) => ({
          ...e,
          data: { labelTex: "新标签", labelPosition: 0.2 },
        })),
        getNode,
      ),
    ).toBe(first);
  });
  it("移动一个端点只更新其相关边，无关边保留同一条路线", () => {
    const { owner, nodes, edges, internals, getNode } = fixture();
    const first = planArchitectureRoutes(owner, nodes, edges, getNode);
    internals.get("a")!.internals.positionAbsolute.x = 40;
    const next = planArchitectureRoutes(owner, nodes, edges, getNode);
    expect(next.get("ab")).not.toBe(first.get("ab"));
    expect(next.get("ab")![0].x).toBe(90);
    expect(next.get("cd")).toBe(first.get("cd"));
  });
  it("节点数组不变而内部端口变化时，仍会更新端点", () => {
    const { owner, nodes, edges, internals, getNode } = fixture();
    planArchitectureRoutes(owner, nodes, edges, getNode);
    internals.get("a")!.internals.handleBounds!.source![0].x = 65;
    expect(
      planArchitectureRoutes(owner, nodes, edges, getNode).get("ab")![0].x,
    ).toBe(70);
  });
  it("新障碍挡住非相连的旧路线时，也必须重新避障", () => {
    const { owner, nodes, edges, internals, getNode } = fixture();
    const first = planArchitectureRoutes(owner, nodes, edges, getNode);
    internals.get("c")!.internals.positionAbsolute = { x: 10, y: 180 };
    const next = planArchitectureRoutes(owner, nodes, edges, getNode);
    expect(next.get("ab")).not.toBe(first.get("ab"));
    const points = next.get("ab")!;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const crosses =
        a.x === b.x
          ? a.x > 10 &&
            a.x < 110 &&
            Math.max(a.y, b.y) > 180 &&
            Math.min(a.y, b.y) < 260
          : a.y > 180 &&
            a.y < 260 &&
            Math.max(a.x, b.x) > 10 &&
            Math.min(a.x, b.x) < 110;
      expect(crosses).toBe(false);
    }
  });
  it("不同画布的路由缓存隔离", () => {
    const f = fixture();
    const first = planArchitectureRoutes(f.owner, f.nodes, f.edges, f.getNode);
    expect(planArchitectureRoutes({}, f.nodes, f.edges, f.getNode)).not.toBe(
      first,
    );
  });
  it("调整框宽后端点仍贴边，无关边不变", () => {
    const f = fixture();
    const edges = f.edges.map((e) =>
      e.id === "ab"
        ? {
            ...e,
            data: { sourceAnchor: { side: Position.Bottom, offset: 0.5 } },
          }
        : e,
    );
    const first = planArchitectureRoutes(f.owner, f.nodes, edges, f.getNode);
    f.internals.get("a")!.measured.width = 200;
    const next = planArchitectureRoutes(f.owner, f.nodes, edges, f.getNode);
    expect(next.get("ab")![0]).toEqual({ x: 100, y: 80 });
    expect(next.get("cd")).toBe(first.get("cd"));
  });
  it("手动折线编辑会失效，选择动作仍保留人工路径", () => {
    const f = fixture();
    const edges: EditableEdge[] = [
      {
        ...f.edges[0],
        data: {
          waypoints: [
            { x: 50, y: 140 },
            { x: -80, y: 140 },
            { x: -80, y: 340 },
            { x: 50, y: 340 },
          ],
        },
      },
    ];
    const first = planArchitectureRoutes(f.owner, f.nodes, edges, f.getNode);
    expect(
      planArchitectureRoutes(
        f.owner,
        f.nodes,
        edges.map((e) => ({ ...e, selected: true })),
        f.getNode,
      ),
    ).toBe(first);
    edges[0].data!.waypoints![1].x = -120;
    const next = planArchitectureRoutes(f.owner, f.nodes, edges, f.getNode);
    expect(next.get("ab")).not.toBe(first.get("ab"));
    expect(next.get("ab")).toContainEqual({ x: -120, y: 140 });
  });
  it("重连和删边更新缓存，不保留旧端点或旧边", () => {
    const f = fixture();
    planArchitectureRoutes(f.owner, f.nodes, f.edges, f.getNode);
    const edges = [{ ...f.edges[0], target: "d" }];
    const next = planArchitectureRoutes(f.owner, f.nodes, edges, f.getNode);
    expect(next.size).toBe(1);
    expect(next.get("ab")!.at(-1)).toEqual({ x: 650, y: 400 });
    expect(next.has("cd")).toBe(false);
  });
});

describe("透明连线标签使用几何断线", () => {
  const gap = { left: 40, right: 60, top: -10, bottom: 10 };
  it("水平线只在标签内断开，不再需要全幅 mask", () => {
    expect(
      pathWithLabelGap(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        gap,
      ),
    ).toBe("M 0 0 L 40 0 M 60 0 L 100 0");
  });
  it("反向线和竖线保持起终点方向", () => {
    expect(
      pathWithLabelGap(
        [
          { x: 100, y: 0 },
          { x: 0, y: 0 },
        ],
        gap,
      ),
    ).toBe("M 100 0 L 60 0 M 40 0 L 0 0");
    expect(
      pathWithLabelGap(
        [
          { x: 50, y: -50 },
          { x: 50, y: 50 },
        ],
        gap,
      ),
    ).toBe("M 50 -50 L 50 -10 M 50 10 L 50 50");
  });
  it("不相交的线段与无标签折线保持完整", () => {
    expect(
      pathWithLabelGap(
        [
          { x: 0, y: 20 },
          { x: 100, y: 20 },
        ],
        gap,
      ),
    ).toBe("M 0 20 L 100 20");
    expect(
      pathWithLabelGap([
        { x: 0, y: 0 },
        { x: 0, y: 20 },
        { x: 100, y: 20 },
      ]),
    ).toBe("M 0 0 L 0 20 L 100 20");
  });
});

describe("详情可见性以世界坐标和缩放计算", () => {
  const viewport = { x: 0, y: 0, zoom: 1, width: 1000, height: 800 };
  it("保留视口内及预加载边缘，不渲染远离视口的内容", () => {
    expect(
      isArchitectureDetailVisible(
        { x: 0, y: 0, width: 100, height: 100 },
        viewport,
      ),
    ).toBe(true);
    expect(
      isArchitectureDetailVisible(
        { x: 1100, y: 0, width: 100, height: 100 },
        viewport,
      ),
    ).toBe(true);
    expect(
      isArchitectureDetailVisible(
        { x: 1500, y: 0, width: 100, height: 100 },
        viewport,
      ),
    ).toBe(false);
    expect(
      isArchitectureDetailVisible(
        { x: 0, y: -1000, width: 100, height: 2000 },
        viewport,
      ),
    ).toBe(true);
  });
  it("平移或放大后重新进入视口会恢复详情", () => {
    const rect = { x: 5000, y: 5000, width: 1000, height: 1000 };
    expect(isArchitectureDetailVisible(rect, viewport)).toBe(false);
    expect(
      isArchitectureDetailVisible(rect, {
        ...viewport,
        zoom: 0.5,
        x: -2500,
        y: -2500,
      }),
    ).toBe(true);
  });
});

it("回到已测量层时，先恢复子节点高度再匹配父框几何，避免缓存循环依赖", () => {
  const graph = buildGraph(
    15,
    new Map([
      ["q-rmsnorm", 777],
      ["norm1", 880],
    ]),
  );
  const cache = new Map(
    graph.nodes.map((node) => [
      JSON.stringify([
        node.data,
        Number(node.style!.width),
        node.style!.height ?? node.style!.minHeight,
      ]),
      {
        width: Math.round(Number(node.style!.width)),
        height:
          node.id === "q-rmsnorm"
            ? 777
            : node.id === "norm1"
              ? 880
              : Number(node.style!.height ?? 300),
        handles: [],
      },
    ]),
  );
  const result = buildMeasuredGraph(15, "prefill", cache);
  expect(result.nodes.every((node) => node.measured)).toBe(true);
  expect(
    result.nodes.find((node) => node.id === "q")!.data.queryNormHeight,
  ).toBe(777);
  const expected = buildGraph(
    15,
    new Map(result.nodes.map((node) => [node.id, node.measured!.height!])),
  );
  expect(result.nodes.find((node) => node.id === "q")!.position).toEqual(
    expected.nodes.find((node) => node.id === "q")!.position,
  );
});

it("保存恢复使用编辑后的实际尺寸，不被初始 style 覆盖", () => {
  const graph = buildGraph(15);
  const input = graph.nodes.find((n) => n.id === "input")!;
  input.width = 1104;
  input.height = 600;
  input.measured = { width: 1104, height: 600 };
  const saved = captureDiagramLayout(graph.nodes, graph.edges);
  expect(saved.nodes.find((n) => n.id === "input")).toMatchObject({
    width: 1104,
    height: 600,
  });
  const restored = applySavedLayout(buildGraph(15), saved).nodes.find(
    (n) => n.id === "input",
  )!;
  expect(restored.style!.width).toBe(1104);
  expect(restored.style!.minHeight ?? restored.style!.height).toBe(600);
});

describe("切层复用完整的实测几何", () => {
  it("同一层切 Prefill/Decode 时拒绝旧视角的高度，避免把旧图位移累加到新图", () => {
    const graph = buildGraph(29, new Map(), "decode");
    const oldNodes = buildGraph(29, new Map(), "prefill").nodes.map((node) => ({
      ...node,
      measured: { width: 600, height: 900 },
    }));
    expect(measurementsForGraph(graph, oldNodes)).toBeNull();
    const correct = graph.nodes.map((node) => ({
      ...node,
      measured: { width: 600, height: 900 },
    }));
    expect(measurementsForGraph(graph, correct)?.get("kv")).toBe(900);
    // 高层图仍包含真实的首层输入对象，不能把所有节点一律要求为 Layer 29。
    expect(correct.find((node) => node.id === "first-input")?.data.layer).toBe(
      1,
    );
    expect(measurementsForGraph(graph, correct.slice(1))).toBeNull();
    expect(
      measurementsForGraph(
        graph,
        correct.map((node) =>
          node.id === "kv"
            ? { ...node, data: { ...node.data, layer: 15 } }
            : node,
        ),
      ),
    ).toBeNull();
  });
  function measuredFixture() {
    const original = buildGraph(15);
    const graph = {
      nodes: original.nodes.filter((n) =>
        ["q", "expert-output-7"].includes(n.id),
      ),
      edges: [],
    };
    const cache = new Map(
      graph.nodes.map((n) => [
        JSON.stringify([
          n.data,
          Number(n.style!.width),
          n.style!.height ?? n.style!.minHeight,
        ]),
        {
          width: Math.round(Number(n.style!.width)),
          height: Number(n.style!.height ?? 300),
          handles: [
            {
              id: "main-out",
              type: "source" as const,
              position: Position.Bottom,
              x: 40,
              y: 290,
              width: 10,
              height: 10,
            },
          ],
        },
      ]),
    );
    return { graph, cache };
  }
  it("以声明宽度匹配，保留浏览器实测的整数尺寸和端口", () => {
    const { graph, cache } = measuredFixture();
    const result = restoreMeasuredGeometry(graph, cache);
    expect(
      result.nodes.every((n) => n.measured && n.handles?.length === 1),
    ).toBe(true);
    expect(
      result.nodes.find((n) => n.id === "expert-output-7")!.measured!.width,
    ).toBe(
      Math.round(
        Number(
          graph.nodes.find((n) => n.id === "expert-output-7")!.style!.width,
        ),
      ),
    );
  });
  it("缺一项时整体重新测量，不能让适配视口只使用局部边界", () => {
    const { graph, cache } = measuredFixture();
    cache.delete(cache.keys().next().value!);
    expect(restoreMeasuredGeometry(graph, cache)).toBe(graph);
  });
  it("未保存的人工拉高不能污染默认内容高度", () => {
    const { graph, cache } = measuredFixture();
    const node = graph.nodes.find((n) => n.id === "expert-output-7")!;
    const naturalKey = JSON.stringify([
      node.data,
      Number(node.style!.width),
      node.style!.minHeight,
    ]);
    const measured = cache.get(naturalKey)!;
    cache.delete(naturalKey);
    cache.set(JSON.stringify([node.data, Number(node.style!.width), 900]), {
      ...measured,
      height: 900,
    });
    expect(restoreMeasuredGeometry(graph, cache)).toBe(graph);
  });
  it.each(["width", "height", "phase"])("%s 变化不能沿用旧几何", (field) => {
    const { graph, cache } = measuredFixture();
    const node = graph.nodes[0];
    if (field === "phase") node.data = { ...node.data, phase: "decode" };
    else node.style = { ...node.style, [field]: 2000 };
    expect(restoreMeasuredGeometry(graph, cache)).toBe(graph);
  });
});
