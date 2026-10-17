import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EngramHash } from "../src/components/EngramHash";

describe("Engram 哈希结构", () => {
  it.each([2, 15])("Layer %i 展开各 token 乘数及第 1/2/8 个地址头", (layer) => {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(<EngramHash layer={layer} />);
    for (const n of [2, 3, 4]) {
      const branch = root.querySelector(`[data-ngram="${n}"]`)!;
      expect(branch.querySelectorAll("[data-hash-product]")).toHaveLength(n);
      expect(
        [...branch.querySelectorAll<HTMLElement>("[data-hash-head]")].map(
          (el) => el.dataset.hashHead,
        ),
      ).toEqual(["1", "2", "8"]);
      expect(
        branch.querySelector('[data-hash-port="xor"]')?.textContent,
      ).toContain("⊕");
      const formulas = [...branch.querySelectorAll("[aria-label]")].map((el) =>
        el.getAttribute("aria-label"),
      );
      for (let j = 0; j < n; j++)
        expect(formulas).toContain(`a_{${layer},${j}}`);
      for (const h of [1, 2, 8])
        for (const symbol of ["p", "o", "b"])
          expect(formulas).toContain(`${symbol}_{${n},${h}}`);
    }
    expect(root.querySelector(".katex-error")).toBeNull();
  });
});
