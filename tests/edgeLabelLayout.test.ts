import { describe, expect, it, vi } from "vitest";
import {
  labelBounds,
  labelRegistry,
  layoutEdgeLabels,
  type LabelEntry,
} from "../src/components/edge-label-layout";

const entry = (id = "a"): LabelEntry => ({
  id,
  points: [
    { x: 0, y: 0 },
    { x: 0, y: 1000 },
  ],
  size: { width: 80, height: 30 },
  preferred: { x: 0, y: 500 },
});
describe("整张画布统一放置变量标签", () => {
  it("终端标签可单独沿线拖动，仍避让框体，主标签偏好保持不变", () => {
    const e = { ...entry(), terminalPreferred: { x: 0, y: 830 } };
    const p = layoutEdgeLabels([e], [], new Map([[e.id, e.points]])).get(e.id)!;
    expect(p.terminal).toEqual(e.terminalPreferred);
    expect(p.primary).toEqual(e.preferred);
    const moved = layoutEdgeLabels(
      [e],
      [{ left: -100, right: 100, top: 800, bottom: 850 }],
      new Map([[e.id, e.points]]),
    ).get(e.id)!;
    expect(moved.unresolved).toBe(false);
    expect(Math.abs(moved.terminal!.y - 830)).toBeGreaterThan(30);
  });
  it("长线在目标前就近复述变量，同时保留主标签", () => {
    const e = entry();
    const p = layoutEdgeLabels(
      [e],
      [{ left: -100, right: 100, top: 950, bottom: 1100 }],
      new Map([[e.id, e.points]]),
    ).get(e.id)!;
    expect(p.unresolved).toBe(false);
    expect(p.primary).toEqual(e.preferred);
    expect(p.terminal?.y).toBeGreaterThan(900);
    expect(labelBounds(p.terminal!, e.size).bottom).toBeLessThan(950);
  });
  it("让出其他线、框与已占用的标签位置，输入顺序不影响布局", () => {
    const a = entry(),
      b = {
        ...entry("b"),
        points: [
          { x: 100, y: 0 },
          { x: 100, y: 1000 },
        ],
        preferred: { x: 100, y: 500 },
        size: { width: 150, height: 30 },
      };
    const routes = new Map([
      [a.id, a.points],
      [b.id, b.points],
      [
        "cross",
        [
          { x: -200, y: 500 },
          { x: 200, y: 500 },
        ],
      ],
    ]);
    const boxes = [{ left: -50, right: 50, top: 900, bottom: 1100 }];
    const p = layoutEdgeLabels([a, b], boxes, routes);
    expect(p).toEqual(layoutEdgeLabels([b, a], boxes, routes));
    for (const value of p.values()) expect(value.unresolved).toBe(false);
    expect(Math.abs(p.get("a")!.primary.y - 500)).toBeGreaterThan(15);
  });
  it("短线亚像素折点不拆散标签可用空间，且不修改原路径", () => {
    const e = {
      ...entry(),
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 54 },
        { x: 0.01, y: 54 },
        { x: 0.01, y: 108 },
      ],
      preferred: { x: 0, y: 54 },
    };
    const original = JSON.stringify(e.points);
    const p = layoutEdgeLabels([e], [], new Map([[e.id, e.points]])).get(e.id)!;
    expect(p.unresolved).toBe(false);
    expect(p.primary).toEqual({ x: 0, y: 54 });
    expect(p.terminal).toBeUndefined();
    expect(JSON.stringify(e.points)).toBe(original);
  });
  it("没有安全位置时明确报告，不能假装避让成功", () => {
    const e = entry();
    expect(
      layoutEdgeLabels(
        [e],
        [{ left: -500, right: 500, top: -500, bottom: 1500 }],
        new Map([[e.id, e.points]]),
      ).get(e.id)?.unresolved,
    ).toBe(true);
  });
  it("窄直角入口仍选择靠近箭头的竖线，不把终端变量退到远处横线", () => {
    const e: LabelEntry = {
      id: "residual",
      size: { width: 64, height: 35 },
      preferred: { x: 1000, y: 1500 },
      points: [
        { x: 2000, y: 0 },
        { x: 2000, y: 1500 },
        { x: 256, y: 1500 },
        { x: 256, y: 520 },
        { x: 328, y: 520 },
      ],
    };
    const p = layoutEdgeLabels(
      [e],
      [{ left: 300, right: 1500, top: 300, bottom: 1400 }],
      new Map([[e.id, e.points]]),
    ).get(e.id)!;
    expect(p.unresolved).toBe(false);
    expect(p.terminal!.x).toBe(256);
    expect(Math.abs(p.terminal!.y - 520)).toBeLessThan(40);
  });
  it("尺寸注册表按画布隔离，相同尺寸不引起重复规划", () => {
    const owner = {},
      registry = labelRegistry(owner),
      listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    registry.measure("a", "x", { width: 80, height: 30 });
    registry.measure("a", "x", { width: 80, height: 30 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(labelRegistry(owner)).toBe(registry);
    expect(labelRegistry({}).sizes.size).toBe(0);
    registry.measure("a", "y", { width: 80, height: 30 });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    registry.measure("a", "y", { width: 90, height: 30 });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
