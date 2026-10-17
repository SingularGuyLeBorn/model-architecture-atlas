import { test, expect } from "@playwright/test";

test("局部紧凑布局、Attention 同对象同色与左侧复用出口", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 3600, height: 4200 });
  await page.goto("/?revision=inspector-prose#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [3, 25, 29]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await focus.selectOption("heads");
    for (const head of await page.locator("[data-head-layout]").all()) {
      const colors = await head.evaluate((root) => {
        const fill = (tex: string) =>
          [...root.querySelectorAll<HTMLElement>("[aria-label]")]
            .filter((el) => el.getAttribute("aria-label") === tex)
            .filter(
              (el) =>
                !tex.startsWith("a_") ||
                el.closest(
                  "[data-attention-softmax], [data-attention-value-sum]",
                ) ||
                el
                  .closest("[data-attention-tensor]")
                  ?.getAttribute("data-attention-tensor") === "\\mathbf a",
            )
            .map((el) => {
              let box: HTMLElement | null = el;
              while (
                box &&
                ["rgba(0, 0, 0, 0)", "transparent"].includes(
                  getComputedStyle(box).backgroundColor,
                )
              )
                box = box.parentElement;
              return box ? getComputedStyle(box).backgroundColor : "missing";
            });
        return {
          a: [
            ...fill("a_i"),
            ...fill("a_{1}"),
            ...fill("a_{2}"),
            ...fill("a_{L_t}"),
          ],
          v: fill("v_{1,1}"),
          z: fill("z_i"),
          d: fill("D"),
          exponentFill: getComputedStyle(
            root.querySelector('[data-attention-exponent="score"] menclose')!,
          ).backgroundColor,
          denominatorFill: getComputedStyle(
            [
              ...root.querySelectorAll("[data-attention-softmax] menclose"),
            ].find((el) => el.textContent === "D")!,
          ).backgroundColor,
          output: fill("\\widetilde o_{1}"),
        };
      });
      expect(colors.a.length).toBeGreaterThanOrEqual(7);
      expect(new Set(colors.a).size).toBe(1);
      expect(colors.exponentFill).toBe(colors.z[0]);
      expect(colors.denominatorFill).toBe(colors.d[0]);
      expect(
        new Set([colors.a[0], colors.v[0], colors.z[0], colors.output[0]]).size,
      ).toBe(4);
    }
    await page
      .locator("[data-head-layout]")
      .first()
      .screenshot({ path: `artifacts/attention-colors-${layer}.png` });
    await focus.selectOption("kv-merge");
    const rows = page.locator("[data-concat-row]");
    expect(await rows.count()).toBe(12);
    const metrics = await rows
      .locator("[data-concat-element]")
      .evaluateAll((items) =>
        items.map((row) => {
          const box = row as HTMLElement;
          const formula = box.querySelector("[aria-label]")!;
          return {
            text: box.textContent,
            slack:
              box.getBoundingClientRect().width -
              formula.getBoundingClientRect().width,
          };
        }),
      );
    expect(metrics.every((m) => !m.text?.includes("维") && m.slack < 50)).toBe(
      true,
    );
    await page
      .locator("[data-kv-row-concat]")
      .screenshot({ path: `artifacts/kv-concat-compact-${layer}.png` });
    await focus.selectOption("indexer");
    const flow = page.locator("[data-index-result-flow]");
    const horizontal = await flow.evaluate((el) => {
      const a = el
        .querySelector("[data-index-score-summary]")!
        .getBoundingClientRect();
      const b = el
        .querySelector("[data-index-selection-stages]")!
        .getBoundingClientRect();
      return a.right < b.left && a.top < b.bottom && b.top < a.bottom;
    });
    expect(horizontal).toBe(true);
    await flow.screenshot({
      path: `artifacts/indexer-tail-horizontal-${layer}.png`,
    });
    if (layer !== 3) {
      await focus.selectOption("compressor");
      const port = page.locator(
        '.react-flow__node[data-id="compressor"] [data-handleid="to-indexer"]',
      );
      await expect(port).toHaveClass(/react-flow__handle-left/);
      const edge = page.locator(
        '.react-flow__edge[data-id="compressor-indexer"] .react-flow__edge-path',
      );
      await expect(edge).toHaveAttribute("d", /^M/);
      expect(
        await edge.evaluate((el) => {
          const path = el as SVGPathElement;
          return path.getPointAtLength(8).x < path.getPointAtLength(0).x;
        }),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/reindex-left-route-${layer}.png`,
      });
    }
    await focus.selectOption("add1");
    const top = page.locator("[data-mhc-parallel-inputs]");
    const compact = await top.evaluate((el) =>
      [...el.children].every((section) => {
        const children = [...section.children].map((c) =>
          c.getBoundingClientRect(),
        );
        return children[1].left - children[0].right < 30;
      }),
    );
    expect(compact).toBe(true);
    await top.screenshot({ path: `artifacts/mhc-post-inputs-${layer}.png` });
  }
  await expect(page.locator(".katex-error")).toHaveCount(0);
});
