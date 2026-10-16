import { test, expect } from "@playwright/test";

test("KV 串行横排折行，下一层交接框按层切换真实依赖", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 2200, height: 1700 });
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  await focus.selectOption("kv");
  const kv = page.locator('.react-flow__node[data-id="kv"]');
  await expect(kv.locator("[data-serial-step]")).toHaveCount(4);
  await expect(kv.locator("[data-serial-link]")).toHaveCount(3);
  await expect
    .poll(() =>
      kv.evaluate((root) => {
        const steps = [...root.querySelectorAll("[data-serial-step]")].map(
          (el) => el.getBoundingClientRect(),
        );
        return (
          Math.abs(steps[0].top - steps[1].top) < 2 &&
          steps[2].top > steps[0].bottom &&
          steps[2].top < steps[1].bottom &&
          steps[3].top > steps[2].bottom
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      kv.evaluate((root) => {
        const steps = [...root.querySelectorAll("[data-serial-step]")].map(
          (el) => el.getBoundingClientRect(),
        );
        return [
          ...root.querySelectorAll<SVGPathElement>("[data-serial-link]"),
        ].every((path, i) => {
          const matrix = path.getScreenCTM()!;
          const start = path.getPointAtLength(0).matrixTransform(matrix);
          const end = path
            .getPointAtLength(path.getTotalLength())
            .matrixTransform(matrix);
          const source = steps[i],
            target = steps[i + 1];
          const boundaryGap = (point: DOMPoint, rect: DOMRect) =>
            Math.min(
              Math.abs(point.x - rect.left),
              Math.abs(point.x - rect.right),
              Math.abs(point.y - rect.top),
              Math.abs(point.y - rect.bottom),
            );
          const sourceGap = boundaryGap(start, source),
            targetGap = boundaryGap(end, target);
          return sourceGap < 2 && targetGap < 2;
        });
      }),
    )
    .toBe(true);
  const dimensions = await kv.evaluate((el) => ({
    width: (el as HTMLElement).offsetWidth,
    height: (el as HTMLElement).offsetHeight,
  }));
  expect(dimensions.height).toBeLessThan(dimensions.width);
  await kv.screenshot({ path: "artifacts/kv-horizontal.png" });
  // 用真实边缘拖动收窄框体，检查折回布局能退回单列且顺序不变。
  const bounds = await kv.boundingBox();
  const right = await kv
    .locator(".architecture-resize-edge")
    .nth(1)
    .boundingBox();
  const scale = bounds!.width / dimensions.width;
  await page.mouse.move(
    right!.x + right!.width / 2,
    right!.y + right!.height / 3,
  );
  await page.mouse.down();
  await page.mouse.move(
    right!.x + right!.width / 2 - 650 * scale,
    right!.y + right!.height / 3,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(kv.locator("[data-serial-flow]")).toHaveAttribute(
    "data-serial-flow",
    "rows",
  );
  await expect
    .poll(() =>
      kv
        .locator("[data-serial-step]")
        .evaluateAll((elements) =>
          elements
            .map((el) => el.getBoundingClientRect())
            .every(
              (rect, index, rects) =>
                index === 0 || rect.top > rects[index - 1].bottom,
            ),
        ),
    )
    .toBe(true);
  for (const layer of [3, 24, 40]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await focus.selectOption("next-inputs");
    const frame = page.locator("[data-next-layer-frame]");
    await expect(frame).toBeVisible();
    await expect(frame).toHaveCSS("border-top-style", "dashed");
    await expect(frame.locator("[data-next-global-kv]")).toHaveCount(
      layer === 40 ? 0 : 1,
    );
    await expect(frame.locator("[data-next-indices]")).toHaveCount(
      layer === 3 ? 1 : 0,
    );
    await expect(frame.locator("[data-next-index-key]")).toHaveCount(
      layer === 24 ? 1 : 0,
    );
    await expect(frame.locator("[data-next-candidates]")).toHaveCount(
      layer === 24 ? 1 : 0,
    );
    await expect
      .poll(() =>
        frame
          .locator("div")
          .evaluateAll((elements) =>
            elements
              .filter(
                (el) =>
                  !el.querySelector(".react-flow__handle") &&
                  el.clientWidth > 0 &&
                  el.scrollWidth > el.clientWidth + 2,
              )
              .map((el) => el.textContent?.slice(0, 100)),
          ),
      )
      .toEqual([]);
    await frame.screenshot({
      path: `artifacts/next-layer-inputs-${layer}.png`,
    });
  }
  await expect(page.locator(".katex-error")).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log("KV 横排实测尺寸", dimensions);
});
