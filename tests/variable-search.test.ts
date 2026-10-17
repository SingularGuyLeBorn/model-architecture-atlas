import { describe, expect, it } from "vitest";
import {
  findVariables,
  normalizeVariable,
} from "../src/components/variable-search";

describe("变量名查找", () => {
  it("兼容普通、Unicode 下标与 LaTeX，保留大小写", () => {
    expect(normalizeVariable("U₁,t")).toBe(normalizeVariable("U_{1,t}"));
    expect(normalizeVariable("\\mathrm{KV}_{3,t}")).toBe("KV3t");
    expect(normalizeVariable("\\mathbf u_{1,t}")).not.toBe(
      normalizeVariable("U_1,t"),
    );
  });
  it("精确匹配优先，去重但保留不同层与消费模块", () => {
    const base = {
      layer: 1,
      nodeId: "swa-window",
      title: "本地窗口",
      tex: "U_{1,t}",
    };
    const results = findVariables(
      [
        { ...base, tex: "U_{1,t-1}" },
        base,
        base,
        { ...base, nodeId: "kv-merge" },
      ],
      "U₁,t",
    );
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual(base);
    expect(findVariables([base], "u1t")).toEqual([]);
    expect(findVariables([base], "窗口")).toEqual([base]);
  });
});
