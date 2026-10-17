import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EngramAddressFlow } from "../src/components/EngramAddressFlow";

it.each([2, 15])("Layer %i 三组地址与两表同号选中行一一对应", (layer) => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <EngramAddressFlow
      layer={layer}
      rows={layer === 2 ? 384006168 : 384016682}
    />,
  );
  expect(root.querySelectorAll("[data-engram-address-vector]")).toHaveLength(3);
  expect(root.querySelectorAll("[data-engram-index]")).toHaveLength(9);
  for (const n of [2, 3, 4])
    for (const h of [1, 2, 8]) {
      const index = `b_{${n},${h}}`;
      expect(
        root.querySelector(
          `[data-engram-address-vector="${n}"] [aria-label="${index}"]`,
        ),
      ).not.toBeNull();
      expect(
        root.querySelector(`[data-engram-index="${index}"]`),
      ).not.toBeNull();
      for (const table of ["fp8", "scale"]) {
        const row = root.querySelector(
          `[data-engram-row="${table}:${index}"]`,
        )!;
        expect(row.querySelector("[data-vector-selected]")).not.toBeNull();
        expect(row.querySelectorAll("[data-vector-cell]")).toHaveLength(3);
      }
    }
  expect(root.querySelector(".katex-error")).toBeNull();
});

it.each([2, 15])("Layer %i 同一个 b 的系数逐块对应 32 个数值", (layer) => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <EngramAddressFlow layer={layer} rows={384006168} />,
  );
  const dequant = root.querySelector("[data-engram-dequantization]")!;
  expect(dequant.querySelector('[aria-label="b:=b_{4,8}"]')).not.toBeNull();
  for (const k of [1, 2, 8]) {
    const block = dequant.querySelector(`[data-dequant-block="${k}"]`)!;
    expect(block.textContent).toContain(`列 ${(k - 1) * 32 + 1}–${k * 32}`);
    expect(
      block.querySelector(
        `[data-dequant-scale-block] [aria-label="s_{b,${k}}"]`,
      ),
    ).not.toBeNull();
    for (const d of [(k - 1) * 32 + 1, (k - 1) * 32 + 2, k * 32]) {
      expect(
        block.querySelector(
          `[data-dequant-value-block] [aria-label="\\\\bar e_{b,${d}}"]`,
        ),
      ).not.toBeNull();
      expect(
        block.querySelector(
          `[data-dequant-result-block] [aria-label="\\\\hat e_{4,8,${d}}"]`,
        ),
      ).not.toBeNull();
    }
  }
  expect(dequant.textContent).toContain("转为 BF16");
  expect(
    dequant.querySelector(
      '[data-engram-read-result] [aria-label="\\\\mathbf e_{4,8}^{(256)}"]',
    ),
  ).not.toBeNull();
});
