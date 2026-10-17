import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { qwenPle, qwenPleWindow, qwenPleAddresses } from "../src/data/qwen-ple";
import { qwenPleRecipe } from "../src/templates/qwen-ple";
import { inspectInternalTarget } from "../src/components/internal-selection";

it("PLE 的 16 个不重叠质数地址区间、160 维与 128 行补齐", () => {
  expect(qwenPle.primes).toHaveLength(16);
  expect(qwenPle.dim).toBe(160);
  expect(qwenPle.rows % 128).toBe(0);
  expect(qwenPle.rows - qwenPle.usedRows).toBeLessThan(128);
  qwenPle.multipliers.forEach((a) => expect(a % 2n).toBe(1n));
  for (let i = 1; i < 16; i++) {
    expect(qwenPle.offsets[i]).toBe(
      qwenPle.offsets[i - 1] + qwenPle.primes[i - 1],
    );
    expect(qwenPle.primes[i]).toBeGreaterThan(qwenPle.primes[i - 1]);
  }
});
it("开头补 EOS，当前 EOS 可读自身历史，EOS 后的位置不越段", () => {
  const e = qwenPle.eos;
  expect(qwenPleWindow([17], 1)).toEqual([17, e, e]);
  expect(qwenPleWindow([17, 18, e, 19, 20], 3)).toEqual([e, 18, 17]);
  expect(qwenPleWindow([17, 18, e, 19, 20], 4)).toEqual([19, e, e]);
  expect(qwenPleWindow([17, 18, e, 19, 20], 5)).toEqual([20, 19, e]);
});
it("Decode 保留两项历史，与一次 Prefill 的每个地址相同", () => {
  const text = [17, 18, 19, qwenPle.eos, 20, 21, 22, 23];
  for (let t = 1; t <= text.length; t++) {
    const chunk = text.slice(Math.max(0, t - 3), t);
    const result = qwenPleAddresses(text, t);
    expect(qwenPleAddresses(chunk, chunk.length)).toEqual(result);
    result.forEach((b, i) => {
      expect(b).toBeGreaterThanOrEqual(qwenPle.offsets[i]);
      expect(b).toBeLessThan(qwenPle.offsets[i] + qwenPle.primes[i]);
    });
  }
});
for (const phase of ["prefill", "decode"] as const)
  it(`PLE ${phase} 六个代表地址接到同号原行，卷积与原始旁路分别汇入`, () => {
    const recipe = qwenPleRecipe(phase);
    const hash = document.createElement("div");
    hash.innerHTML = renderToStaticMarkup(
      <>{recipe.stages.find((s) => s.id === "ple-hash")!.body}</>,
    );
    expect(
      hash.querySelectorAll(
        '[data-sum-node] [aria-label="\\\\mathord{\\\\oplus}"]',
      ),
    ).toHaveLength(2);
    expect(hash.querySelectorAll("[data-sum-input-arrow]")).toHaveLength(5);
    expect(
      inspectInternalTarget(hash.querySelector("[data-sum-node]"), hash)?.detail
        .description,
    ).toContain("异或");
    expect(
      inspectInternalTarget(hash.querySelector("[data-sum-input-arrow]"), hash)
        ?.detail.description,
    ).toContain("异或");
    const lookup = document.createElement("div");
    lookup.innerHTML = renderToStaticMarkup(
      <>{recipe.stages.find((s) => s.id === "ple-lookup")!.body}</>,
    );
    for (const n of [2, 3])
      for (const h of [1, 2, 8]) {
        expect(
          lookup.querySelector(`[data-trace-object="addr-${n},${h}"]`)
            ?.textContent,
        ).toContain("b");
        expect(
          lookup.querySelector(`[data-trace-object="read-${n},${h}"]`),
        ).not.toBeNull();
        const row = lookup.querySelector(
          `[data-trace-object="table-${n},${h}"]`,
        )!;
        expect(row.classList.contains("picked")).toBe(true);
        expect(
          row.querySelector("[aria-label]")?.getAttribute("aria-label"),
        ).toBe(`b_{2,${n},${h},t}`);
      }
    expect(recipe.links).toContainEqual({
      source: "input",
      target: "ple-inject",
      tex: "H^{pre}_{2,t}",
    });
    expect(recipe.links).toContainEqual({
      source: "ple-broadcast",
      target: "ple-inject",
      tex: "Z^P_{2,t}",
    });
    expect(recipe.links).toContainEqual({
      source: "ple-conv",
      target: "ple-inject",
      tex: "Y^P_{2,t}",
    });
  });
