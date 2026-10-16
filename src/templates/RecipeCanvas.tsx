import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useNodesInitialized,
  addEdge,
  type Node,
  type NodeProps,
  type OnNodesChange,
} from "@xyflow/react";
import {
  EditableOrthogonalEdge,
  architectureArrowMarker,
  EditHistoryProvider,
  EightResizeHandles,
  type EditableEdge,
} from "../components/EditableArchitectureGraph";
import { MathFormula as M } from "../components/diagram-primitives";
import { type Recipe, type Stage } from "./recipes";

type StageNode = Node<
  Stage & {
    ordinal: number;
    level?: number;
    inputs?: { id: string; tex: string }[];
    outputs?: { id: string; tex: string }[];
  },
  "stage"
>;
type Snapshot = { nodes: StageNode[]; edges: EditableEdge[] };
export function layoutStages(nodes: StageNode[]) {
  let y = 30;
  const positions = new Map<string, { x: number; y: number }>();
  const levels = [
    ...new Set(nodes.map((node) => node.data.level ?? node.data.ordinal)),
  ].sort((a, b) => a - b);
  for (const level of levels) {
    const row = nodes.filter(
      (node) => (node.data.level ?? node.data.ordinal) === level,
    );
    let x = 40;
    for (const node of row) {
      positions.set(node.id, { x, y });
      x += Number(node.style?.width ?? node.measured?.width ?? 1200) + 180;
    }
    // [OM-FREEPLAY] 按同排最大实测高度与边数预留路由通道，禁止靠固定卡片高度排版。
    y +=
      Math.max(...row.map((node) => node.measured?.height ?? 400)) +
      Math.max(120, row.length * 90);
  }
  return nodes.map((node) => ({ ...node, position: positions.get(node.id)! }));
}
const StageView = memo(function StageView({
  data,
  selected,
}: NodeProps<StageNode>) {
  return (
    <article
      className={`stage-card ${selected ? "selected" : ""}`}
      data-boundary-connectable="true"
      data-stage={data.id}
    >
      <EightResizeHandles minWidth={800} minHeight={200} />
      <header className="stage-title">
        <span>{String(data.ordinal).padStart(2, "0")}</span>
        <h3>{data.title.replace(/^\d+ · /, "")}</h3>
      </header>
      {!!data.inputs?.length && (
        <div className="port-row">
          {data.inputs.map((port) => (
            <div className="stage-input" key={port.id}>
              <Handle type="target" id={port.id} position={Position.Top} />
              <small>输入</small>
              <M tex={port.tex} />
            </div>
          ))}
        </div>
      )}
      <div className="stage-body">{data.body}</div>
      <div className="port-row">
        {(data.outputs?.length
          ? data.outputs
          : [{ id: "out", tex: data.output }]
        ).map((port) => (
          <div className="stage-output" key={port.id}>
            <small>输出</small>
            <M tex={port.tex} />
            <Handle type="source" id={port.id} position={Position.Bottom} />
          </div>
        ))}
      </div>
    </article>
  );
});
const nodeTypes = { stage: StageView };
const edgeTypes = { "editable-orthogonal": EditableOrthogonalEdge };

export function RecipeCanvas({
  recipe,
  storageKey,
}: {
  recipe: Recipe;
  storageKey: string;
}) {
  const initial = useMemo<Snapshot>(() => {
    const levels = new Map<string, number>();
    recipe.stages.forEach((stage) =>
      levels.set(
        stage.id,
        Math.max(
          0,
          ...recipe.links
            .filter((link) => link.target === stage.id)
            .map((link) => (levels.get(link.source) ?? 0) + 1),
        ),
      ),
    );
    const nodes: StageNode[] = recipe.stages.map((stage, i) => ({
      id: stage.id,
      type: "stage",
      position: { x: 40, y: i * 600 },
      data: {
        ...stage,
        ordinal: i + 1,
        level: levels.get(stage.id),
        inputs: recipe.links.flatMap((link, i) =>
          link.target === stage.id ? [{ id: `in-${i}`, tex: link.tex }] : [],
        ),
        outputs: recipe.links.flatMap((link, i) =>
          link.source === stage.id ? [{ id: `out-${i}`, tex: link.tex }] : [],
        ),
      },
      style: {
        width:
          stage.id === "experts"
            ? 3200
            : stage.id === "post" && stage.title.includes("并行")
              ? 3000
              : 1200,
      },
    }));
    const edges: EditableEdge[] = recipe.links.map((link, i) => ({
      id: `${link.source}-${link.target}-${i}`,
      source: link.source,
      sourceHandle: `out-${i}`,
      target: link.target,
      targetHandle: `in-${i}`,
      type: "editable-orthogonal",
      data: { labelTex: link.tex, color: "#37685a" },
      markerEnd: architectureArrowMarker(),
    }));
    return { nodes: layoutStages(nodes), edges };
  }, [recipe]);
  const [nodes, setNodes, applyChanges] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [notice, setNotice] = useState("");
  const { fitView, setViewport, getNode } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);
  const focus = useCallback(
    (id: string) => {
      const node = getNode(id);
      if (!node) return;
      // [OM-FREEPLAY] 默认不低于 65%，窄屏允许平移阅读，不把整图缩成不可读缩略图。
      const zoom = Math.max(
        0.65,
        Math.min(
          1,
          ((canvasRef.current?.clientWidth ?? 1200) - 60) /
            Number(node.width ?? node.style?.width ?? 1200),
        ),
      );
      setViewport(
        {
          x: 30 - node.position.x * zoom,
          y: 65 - node.position.y * zoom,
          zoom,
        },
        { duration: 0 },
      ).catch(() => {});
    },
    [getNode, setViewport],
  );
  const ready = useNodesInitialized();
  const loaded = useRef(false);
  const history = useRef<{
    past: Snapshot[];
    future: Snapshot[];
    draft?: Snapshot;
  }>({ past: [], future: [] });
  const current = useRef<Snapshot>({ nodes, edges });
  current.current = { nodes, edges };
  const beginHistory = useCallback(() => {
    history.current.draft ??= current.current;
  }, []);
  const commitHistory = useCallback(() => {
    if (history.current.draft) {
      history.current.past.push(history.current.draft);
      history.current.future = [];
      history.current.draft = undefined;
    }
  }, []);
  const restore = useCallback(
    (snapshot: Snapshot) => {
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
    },
    [setNodes, setEdges],
  );
  const undo = useCallback(() => {
    const previous = history.current.past.pop();
    if (previous) {
      history.current.future.push(current.current);
      restore(previous);
    }
  }, [restore]);
  const redo = useCallback(() => {
    const next = history.current.future.pop();
    if (next) {
      history.current.past.push(current.current);
      restore(next);
    }
  }, [restore]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        /INPUT|TEXTAREA/.test((event.target as HTMLElement).tagName)
      )
        return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [undo, redo]);
  const onNodesChange: OnNodesChange<StageNode> = useCallback(
    (changes) => {
      applyChanges(changes);
      if (
        !loaded.current &&
        changes.some((change) => change.type === "dimensions")
      )
        setNodes(layoutStages);
    },
    [applyChanges, setNodes],
  );
  useEffect(() => {
    if (!ready || loaded.current) return;
    loaded.current = true;
    setNodes(layoutStages);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved: {
          positions: Record<string, { x: number; y: number }>;
          sizes: Record<string, { width?: number; height?: number }>;
          edges: EditableEdge[];
        } = JSON.parse(raw);
        if (saved.positions && Array.isArray(saved.edges)) {
          setNodes((values) =>
            values.map((node) => {
              const position = saved.positions[node.id];
              const size = saved.sizes?.[node.id];
              return position &&
                Number.isFinite(position.x) &&
                Number.isFinite(position.y)
                ? {
                    ...node,
                    position,
                    style:
                      size && Number.isFinite(size.width) && size.width! >= 800
                        ? {
                            ...node.style,
                            width: size.width,
                            ...(size.height && size.height >= 200
                              ? { height: size.height }
                              : {}),
                          }
                        : node.style,
                  }
                : node;
            }),
          );
          const ids = new Set(initial.nodes.map((node) => node.id));
          setEdges(
            saved.edges
              .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
              .map((edge) => ({
                ...edge,
                markerEnd: architectureArrowMarker(
                  edge.data?.color ?? String(edge.style?.stroke ?? "#37685a"),
                ),
              })),
          );
        }
      }
    } catch {
      setNotice("布局文件无法读取，已使用默认结构。");
    }
    focus(recipe.stages[0].id);
  }, [ready, storageKey, recipe, initial, setNodes, setEdges, focus]);
  const save = () => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          positions: Object.fromEntries(
            nodes.map((node) => [node.id, node.position]),
          ),
          sizes: Object.fromEntries(
            nodes.map((node) => [
              node.id,
              {
                width: node.width ?? node.style?.width,
                height: node.height ?? node.style?.height,
              },
            ]),
          ),
          edges,
        }),
      );
      setNotice("布局已保存到此浏览器。");
    } catch {
      setNotice("保存失败：浏览器存储不可用或已满。");
    }
  };
  return (
    <div className="recipe-workspace">
      <nav className="stage-nav" aria-label="图中步骤">
        {recipe.stages.map((stage, i) => (
          <button
            key={stage.id}
            title={stage.title}
            onClick={() => focus(stage.id)}
          >
            <span>{i + 1}</span>
            {stage.title.replace(/^\d+ · /, "")}
          </button>
        ))}
      </nav>
      <div className="recipe-canvas" ref={canvasRef}>
        <div className="canvas-toolbar">
          <button onClick={save}>保存布局</button>
          <button onClick={undo}>撤销</button>
          <button onClick={redo}>重做</button>
          <button
            onClick={() => {
              beginHistory();
              restore({ nodes: layoutStages(nodes), edges: initial.edges });
              commitHistory();
            }}
          >
            恢复排列
          </button>
          <button
            onClick={() => {
              fitView({ padding: 0.1 }).catch(() => {});
            }}
          >
            全图
          </button>
          <button
            onClick={() => {
              setViewport({ x: 20, y: 20, zoom: 1 }).catch(() => {});
            }}
          >
            100%
          </button>
          <span role="status">
            {notice || "拖空白平移 · 滚轮缩放 · 点击左侧步骤定位"}
          </span>
        </div>
        <EditHistoryProvider value={{ beginHistory, commitHistory }}>
          <ReactFlow
            className="atlas-flow"
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={beginHistory}
            onNodeDragStop={commitHistory}
            onConnect={(connection) => {
              beginHistory();
              setEdges((values) =>
                addEdge(
                  {
                    ...connection,
                    type: "editable-orthogonal",
                    data: { labelTex: "x" },
                    markerEnd: architectureArrowMarker(),
                  },
                  values,
                ),
              );
              commitHistory();
            }}
            // [OM-FREEPLAY] 与完整层图统一为 2%–800% 的手动缩放范围。
            minZoom={0.02}
            maxZoom={8}
            deleteKeyCode={null}
            onlyRenderVisibleElements={loaded.current}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} color="#d8d6ce" size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </EditHistoryProvider>
      </div>
    </div>
  );
}
