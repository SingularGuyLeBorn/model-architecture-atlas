import { test, expect } from "@playwright/test";

test("所有参数列名按公式定高，切层和放大父框不拉高单符号", async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 2800, height: 2200 });
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [1, 15, 29, 40]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: layer < 29 ? "Prefill · 整段矩阵" : "Decode · 单步一行",
        exact: true,
      })
      .click();
    for (const id of ["q", "kv", "router", "hc-mix-a", "hc-mix-f"]) {
      await focus.selectOption(id);
      const scope =
        id === "q"
          ? page.locator(
              '.react-flow__node[data-id="q-wdown"], .react-flow__node[data-id="q-wup"]',
            )
          : page.locator(`.react-flow__node[data-id="${id}"]`);
      const cells = scope.locator("[data-parameter-column]");
      await expect(cells).toHaveCount(id === "q" ? 6 : 3);
      const sizes = await cells.evaluateAll((elements) =>
        elements.map((el) => {
          const rect = el.getBoundingClientRect();
          const formula = el
            .querySelector("[aria-label]")!
            .getBoundingClientRect();
          const scale = rect.width / (el as HTMLElement).offsetWidth;
          const frame = el
            .closest("[data-expanded-tensor]")!
            .getBoundingClientRect();
          return {
            height: rect.height / scale,
            extra: (rect.height - formula.height) / scale,
            contained:
              rect.left >= frame.left &&
              rect.right <= frame.right &&
              rect.top >= frame.top &&
              rect.bottom <= frame.bottom,
          };
        }),
      );
      for (const size of sizes) {
        expect(size.extra, `${layer}/${id}`).toBeLessThan(16);
        expect(size.contained, `${layer}/${id} 的列名完整位于参数框内`).toBe(
          true,
        );
      }
      if (id === "q") {
        for (const node of await scope.all()) {
          await expect
            .poll(() => node.evaluate((el) => (el as HTMLElement).offsetHeight))
            .toBeLessThan(100);
        }
      }
      if (layer === 15) {
        if (id === "q") {
          await page
            .locator('.react-flow__node[data-id="q"]')
            .screenshot({ path: "artifacts/parameter-query.png" });
        } else {
          await scope.screenshot({ path: `artifacts/parameter-${id}.png` });
        }
      }
      // 增大父轨道后仍按内容排版，恢复后继续检查其它模块。
      const stable = await cells.evaluateAll((elements) =>
        elements.every((el) => {
          const parent = el.parentElement!;
          const previous = parent.getAttribute("style");
          const before = (el as HTMLElement).offsetHeight;
          parent.style.minHeight = "200px";
          parent.style.alignItems = "stretch";
          const after = (el as HTMLElement).offsetHeight;
          if (previous === null) parent.removeAttribute("style");
          else parent.setAttribute("style", previous);
          return before === after;
        }),
      );
      expect(stable).toBe(true);
    }
  }
});
