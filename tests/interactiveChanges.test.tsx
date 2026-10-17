import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { applyNodeChanges, type Node, type NodeChange } from "@xyflow/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { applyInteractiveNodeChanges } from "../src/components/EditableArchitectureGraph";

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => vi.unstubAllGlobals());

it("拖框及缩放在事件返回前更新唯一状态，结束帧不丢最终位置", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  let change: (changes: NodeChange[]) => void;
  function Demo() {
    const [nodes, setNodes] = useState<Node[]>([
      { id: "box", position: { x: 0, y: 0 }, data: { title: "保持结构" } },
    ]);
    change = (changes) =>
      applyInteractiveNodeChanges(changes, (items) =>
        setNodes((current) => applyNodeChanges(items, current)),
      );
    return <output>{JSON.stringify(nodes)}</output>;
  }
  try {
    await act(async () => root.render(<Demo />));
    await act(async () => {
      for (const dragging of [true, false]) {
        const position = { x: dragging ? 10 : 30, y: 20 };
        change([{ id: "box", type: "position", position, dragging }]);
        expect(JSON.parse(host.textContent!)[0]).toMatchObject({
          position,
          dragging,
          data: { title: "保持结构" },
        });
      }
      change([
        {
          id: "box",
          type: "dimensions",
          dimensions: { width: 300, height: 200 },
          resizing: true,
        },
      ]);
      expect(JSON.parse(host.textContent!)[0].measured).toEqual({
        width: 300,
        height: 200,
      });
    });
  } finally {
    await act(async () => root.unmount());
  }
});

it("初始化测量与程序化坐标在生命周期中继续批处理，不触发同步刷新警告", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const error = vi.spyOn(console, "error");
  function Demo() {
    const [nodes, setNodes] = useState<Node[]>([
      { id: "box", position: { x: 0, y: 0 }, data: {} },
    ]);
    useEffect(() => {
      applyInteractiveNodeChanges<Node>(
        [
          {
            id: "box",
            type: "dimensions",
            dimensions: { width: 300, height: 200 },
          },
          { id: "box", type: "position", position: { x: 50, y: 60 } },
        ],
        (changes) => setNodes((current) => applyNodeChanges(changes, current)),
      );
    }, []);
    return <output>{JSON.stringify(nodes)}</output>;
  }
  try {
    await act(async () => root.render(<Demo />));
    expect(JSON.parse(host.textContent!)[0]).toMatchObject({
      position: { x: 50, y: 60 },
      measured: { width: 300, height: 200 },
    });
    expect(
      error.mock.calls.filter((args) => args.join(" ").includes("flushSync")),
    ).toEqual([]);
  } finally {
    await act(async () => root.unmount());
    error.mockRestore();
  }
});
