import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CandidateFilter,
  CANDIDATE_SOURCE,
  REINDEX_LAYERS,
  ReindexCandidates,
  reindexTeachingExample,
} from "../src/components/ReindexCandidates";
import { cacheExplanation } from "../src/components/CacheSemantics";

it("四个 Reindex 共享 21 层候选范围，教学例按块掩码筛选而非串行缩小", () => {
  expect(CANDIDATE_SOURCE).toBe(21);
  expect(REINDEX_LAYERS).toEqual([25, 29, 33, 37]);
  const e = reindexTeachingExample();
  expect(e.candidates).toHaveLength(16384);
  expect(e.candidates.slice(0, 2)).toEqual([1, 2]);
  expect(e.candidates.slice(-9)).toEqual([
    16376, 19993, 19994, 19995, 19996, 19997, 19998, 19999, 20000,
  ]);
  for (const b of e.branches) {
    expect(b.scored).toHaveLength(20000);
    expect(b.ids).toHaveLength(512);
    expect(new Set(b.ids).size).toBe(512);
    expect(b.ids.every((id) => e.candidates.includes(id))).toBe(true);
    expect(b.scored[16376]).toEqual({ id: 16377, raw: 9, masked: -Infinity });
    expect(b.ids.every((id) => b.scored[id - 1].masked === 3)).toBe(true);
    expect(cacheExplanation(b.layer).join("")).toContain("同一份候选掩码");
  }
  expect(e.branches[0].ids[0]).toBe(1);
  expect(e.branches[1].ids[0]).toBe(513);
  expect(e.branches[2].ids[0]).toBe(1025);
  expect(e.branches[3].ids[0]).toBe(15873);
  expect(e.branches[3].ids.at(-1)).toBe(20000);
});

it("候选来源、应用位置、形状与教学声明都在图中", () => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<ReindexCandidates />);
  expect(root.querySelectorAll("[data-reindex-branch]")).toHaveLength(4);
  expect(root.querySelector(".katex-error")).toBeNull();
  expect(root.textContent).toContain("非模型实测");
  expect(root.textContent).toContain("20000 × 512");
  expect(root.querySelectorAll("[data-mask-range]")).toHaveLength(3);
  expect(
    root
      .querySelector('[data-mask-range="16377–19992"]')
      ?.getAttribute("data-allowed"),
  ).toBe("0");
  expect(root.querySelector('[data-split-arrows="4"]')).not.toBeNull();
  for (const layer of REINDEX_LAYERS) {
    const html = renderToStaticMarkup(<CandidateFilter layer={layer} />);
    expect(html).toContain("B₂₁,t");
    expect(html).toContain("过滤后的分数");
    expect(html).not.toContain("katex-error");
  }
});
