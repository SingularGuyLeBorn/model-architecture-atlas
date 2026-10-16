import { test, expect } from "@playwright/test";

test("四路残差的子矩阵、维度与高亮行始终留在框内", async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 2800, height: 1800 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [1, 3, 4, 40]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    for (const phase of ["Prefill", "Decode"]) {
      await page
        .getByRole("button", {
          name: `${phase} · ${phase === "Prefill" ? "整段矩阵" : "单步一行"}`,
          exact: true,
        })
        .click();
      for (const id of ["input", "state1", "output", "next-inputs"]) {
        await focus.selectOption(id);
        const node = page.locator(`.react-flow__node[data-id="${id}"]`);
        await expect(node.locator("[data-four-stream-row]")).toHaveCount(1);
        const audit = () =>
          node.evaluate((root) => {
            const issues: string[] = [];
            const frame = root.getBoundingClientRect();
            const matrices = [
              ...root.querySelectorAll<HTMLElement>(
                "[data-four-stream-row] > [data-uniform-matrix]",
              ),
            ];
            if (matrices.length !== 4) return ["四路没有全部展开"];
            const top = matrices[0].getBoundingClientRect().top;
            for (const [i, matrix] of matrices.entries()) {
              const r = matrix.getBoundingClientRect();
              const zoom = r.width / matrix.offsetWidth;
              const css = getComputedStyle(matrix);
              const inset =
                (parseFloat(css.paddingRight) +
                  parseFloat(css.borderRightWidth)) *
                zoom;
              if (Math.abs(r.top - top) > 1) issues.push(`第${i}路不在同排`);
              if (r.right > frame.right - 2 || r.left < frame.left + 2)
                issues.push(`第${i}路越过模块边界`);
              for (const child of [
                matrix.firstElementChild!,
                matrix.lastElementChild!,
                ...matrix.querySelectorAll(
                  "[data-vector-cell], [data-vector-selected], [aria-label]",
                ),
              ]) {
                const c = child.getBoundingClientRect();
                if (
                  c.right > r.right - inset + 1 ||
                  c.left < r.left + inset - 1 ||
                  c.bottom > r.bottom - inset + 1
                )
                  issues.push(
                    `第${i}路子项越过内边距：${child.textContent?.slice(0, 20)}`,
                  );
              }
              if (matrix.scrollWidth > matrix.clientWidth + 1)
                issues.push(`第${i}路横向溢出`);
            }
            return issues;
          });
        await expect.poll(audit).toEqual([]);
        if (phase === "Prefill" && [1, 40].includes(layer))
          await node.screenshot({
            path: `artifacts/residual-${layer}-${id}.png`,
          });
        if (layer === 1 && phase === "Prefill" && id === "input") {
          const sizes = await node
            .locator("[data-vector-cell]")
            .evaluateAll((cells) =>
              cells.map((c) => [c.clientWidth, c.clientHeight]),
            );
          const box = (await node.boundingBox())!;
          await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(
            box.x + box.width - 200,
            box.y + box.height / 2,
            { steps: 8 },
          );
          await page.mouse.up();
          await expect.poll(audit).toEqual([]);
          expect(
            await node
              .locator("[data-vector-cell]")
              .evaluateAll((cells) =>
                cells.map((c) => [c.clientWidth, c.clientHeight]),
              ),
          ).toEqual(sizes);
          await page.setViewportSize({ width: 900, height: 1800 });
          await focus.selectOption("input");
          await expect.poll(audit).toEqual([]);
          await page.screenshot({ path: "artifacts/residual-narrow.png" });
          await page.setViewportSize({ width: 2800, height: 1800 });
        }
      }
    }
  }
});
