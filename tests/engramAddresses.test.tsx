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
