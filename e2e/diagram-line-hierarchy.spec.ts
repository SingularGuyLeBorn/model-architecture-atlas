import { test, expect } from "@playwright/test";
import {
  frameColor,
  DATA_WIRE_WIDTH,
} from "../src/components/diagram-appearance";
import { COLORS } from "../src/components/diagram-primitives";

test("框线浅色细描边，导线深色加粗，透明矩阵与选择保持可辨", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2400, height: 1800 });
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  await focus.selectOption("experts");
  const frame = page.locator("[data-expert-structure]").first();
  const rgb = (hex: string) =>
    `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  await expect(frame.locator("[data-expert-matrix]").first()).toHaveCSS(
    "border-top-color",
    rgb(frameColor(COLORS.blue)),
  );
  const wire = page.locator(
    '.react-flow__edge[data-id="moe-input-shared"] .react-flow__edge-path',
  );
  await expect(wire).toHaveCSS("stroke", rgb(COLORS.blue));
  await expect(wire).toHaveCSS("stroke-width", `${DATA_WIRE_WIDTH}px`);
  await expect(wire).toHaveCSS("stroke-linejoin", "round");
  await frame.screenshot({ path: "artifacts/line-hierarchy-expert.png" });
  await page.getByRole("button", { name: "15", exact: true }).click();
  await focus.selectOption("indexer");
  await page
    .locator('.react-flow__node[data-id="indexer"]')
    .screenshot({ path: "artifacts/line-hierarchy-indexer.png" });
  const selectedRow = page.locator(
    '[data-index-result-flow] [data-vector-selected="true"]',
  );
  await expect(selectedRow).toHaveCSS("outline-color", rgb(COLORS.amber));
  await page.setViewportSize({ width: 390, height: 844 });
  await focus.selectOption("indexer");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await expect(page.locator(".katex-error")).toHaveCount(0);
});
