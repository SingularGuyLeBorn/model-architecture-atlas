import { test, expect } from "@playwright/test";
import { auditContentBounds } from "./helpers/content-bounds";

test("选行、乘积向量与 mHC 运算符的实际边界和净空", async ({ page }, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 2400, height: 2000 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  const focus = page.getByRole("combobox", { name: "定位模块" });
  const reports = [];
  for (const [layer, phase, width] of [
    [15, "Prefill", 900],
    [3, "Prefill", 2400],
    [29, "Decode", 2400],
  ] as const) {
    await page.setViewportSize({ width, height: 2000 });
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: phase === "Prefill" ? "Prefill · 整段矩阵" : "Decode · 单步一行",
        exact: true,
      })
      .click();
    for (const id of [
      "global-select",
      "hc-mix-a",
      "hc-mix-f",
      ...(layer !== 29 ? ["compressor"] : []),
    ]) {
      await page.setViewportSize({ width, height: 2000 });
      await focus.selectOption(id);
      const node = page.locator(`.react-flow__node[data-id="${id}"]`);
      await expect(node.locator("math").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(async () => (await auditContentBounds(node)).issues)
        .toEqual([]);
      const result = await auditContentBounds(node);
      expect(result.checked).toBeGreaterThan(20);
      reports.push({ layer, phase, width, id, ...result });
      if (id.startsWith("hc-mix")) {
        const gaps = await node
          .locator("[data-mhc-affine-row]")
          .evaluateAll((rows) =>
            rows.flatMap((row) => {
              const scale =
                row.getBoundingClientRect().width /
                (row as HTMLElement).offsetWidth;
              return [...row.querySelectorAll("[data-diagram-operator]")].map(
                (operator) => {
                  const glyph = operator
                    .querySelector("math")!
                    .getBoundingClientRect();
                  const left =
                    operator.previousElementSibling!.getBoundingClientRect();
                  const right =
                    operator.nextElementSibling!.getBoundingClientRect();
                  return [
                    (glyph.left - left.right) / scale,
                    (right.left - glyph.right) / scale,
                  ];
                },
              );
            }),
          );
        expect(gaps).toHaveLength(24);
        for (const pair of gaps)
          expect(Math.min(...pair)).toBeGreaterThanOrEqual(6);
      }
      if (id === "compressor")
        await expect(
          node.locator("[data-compressor-product] [data-expanded-tensor]"),
        ).toHaveCount(2);
      if (id === "global-select" && layer === 15) {
        // 负例：元素自己不溢出，但祖先容器收窄并裁切；必须能抓到用户这类截图。
        const prior = await node.evaluate((root) => {
          const frame = root.querySelector<HTMLElement>(
            "[data-content-layer] > div:last-child",
          )!;
          const before = frame.getAttribute("style");
          frame.dataset.overflowProbe = "true";
          frame.style.width = "500px";
          frame.style.overflow = "hidden";
          return before;
        });
        const broken = await auditContentBounds(node);
        expect(
          broken.issues.some(
            (issue) =>
              issue.ancestor.includes("data-overflow-probe") &&
              issue.sides.includes("right"),
          ),
        ).toBe(true);
        await node
          .locator("[data-overflow-probe]")
          .evaluate((frame, before) => {
            frame.setAttribute("style", before ?? "");
            frame.removeAttribute("data-overflow-probe");
          }, prior);
        await expect
          .poll(async () => (await auditContentBounds(node)).issues)
          .toEqual([]);
      }
      if (layer === 15) {
        // 取景与测量分开：locator.screenshot 会滚动被裁切的画布，可能截成相邻 p。
        await page.setViewportSize({ width: 2800, height: 3000 });
        await focus.selectOption(id);
        const target = id.startsWith("hc-mix")
          ? node.locator('[data-mhc-gate="q"]')
          : node;
        let last = "",
          stable = 0;
        await expect
          .poll(async () => {
            const key = JSON.stringify(await target.boundingBox());
            stable = key === last ? stable + 1 : 0;
            last = key;
            return stable;
          })
          .toBeGreaterThanOrEqual(2);
        const clip = (await target.boundingBox())!;
        expect(clip.x).toBeGreaterThanOrEqual(0);
        expect(clip.y).toBeGreaterThanOrEqual(0);
        expect(clip.x + clip.width).toBeLessThanOrEqual(2800);
        expect(clip.y + clip.height).toBeLessThanOrEqual(3000);
        await page.screenshot({ path: `artifacts/bounds-${id}-15.png`, clip });
      }
    }
  }
  await info.attach("content-bounds", {
    body: JSON.stringify(reports, null, 2),
    contentType: "application/json",
  });
});
