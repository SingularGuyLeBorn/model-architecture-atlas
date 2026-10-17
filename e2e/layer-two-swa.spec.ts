import { test, expect, type Page, type Locator } from "@playwright/test";

async function settle(page: Page) {
  let previous = "",
    stable = 0;
  await expect
    .poll(
      async () => {
        const current = await page
          .locator(".react-flow__viewport")
          .getAttribute("style");
        stable = current === previous ? stable + 1 : 0;
        previous = current ?? "";
        return stable;
      },
      { intervals: [100, 150, 200] },
    )
    .toBeGreaterThanOrEqual(3);
}

async function contentFits(node: Locator) {
  await expect(node.locator(".katex-error")).toHaveCount(0);
  const overflow = await node.locator("div,section").evaluateAll((elements) =>
    elements
      .filter((el) => {
        if (
          !el.clientWidth ||
          el.classList.contains("react-flow__handle") ||
          el.hasAttribute("data-boundary-connectable") ||
          Array.from(el.children).some((child) =>
            child.classList.contains("react-flow__handle"),
          )
        )
          return false;
        const b = el.getBoundingClientRect(),
          tolerance = (b.width / el.clientWidth) * 2;
        return (
          el.scrollWidth > el.clientWidth + 2 &&
          Array.from(el.querySelectorAll("div,span,p")).some(
            (child) =>
              !child.closest(".react-flow__handle") &&
              child.getBoundingClientRect().right > b.right + tolerance,
          )
        );
      })
      .map((el) => el.textContent?.slice(0, 80)),
  );
  expect(overflow).toEqual([]);
}

test("第 2 层 token129：生成、淘汰、追加、读取是同一条实际路径", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 2200, height: 1800 });
  await page.goto("/?revision=inspector-prose#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await page
    .getByRole("button", { name: "Decode · 单步一行", exact: true })
    .click();
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const id of ["kv", "swa-window", "kv-merge", "heads"]) {
    await focus.selectOption(id);
    await settle(page);
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    await contentFits(node);
    if (id === "kv") {
      await expect(
        node.locator("[data-local-parameter-meaning]"),
      ).toContainText("窗口追加、淘汰在下方");
      const formulas = await node.locator("annotation").allTextContents();
      expect(formulas).toContain("\\mathbf x_{2,129}");
      expect(formulas).toContain("\\mathbf u_{2,129}");
      // 在来源节点可见时检查起点；滚到窗口后，来源内部 DOM 会按既有虚拟化机制卸载。
      const sourceDistance = await page
        .locator('.react-flow__edge[data-id="kv-swa"] .react-flow__edge-path')
        .evaluate((element) => {
          const path = element as SVGPathElement;
          const start = path
            .getPointAtLength(0)
            .matrixTransform(path.getScreenCTM()!);
          const source = document
            .querySelector('[data-local-kv-result] [data-handleid="swa"]')!
            .getBoundingClientRect();
          return Math.hypot(
            start.x - source.left - source.width / 2,
            start.y - source.top - source.height / 2,
          );
        });
      expect(sourceDistance).toBeLessThan(2);
    }
    if (id === "swa-window") {
      await expect(node.locator('[data-previous-token="1"]')).toContainText(
        "淘汰",
      );
      await expect(node.locator('[data-previous-token="1"]')).toHaveCSS(
        "background-color",
        "rgb(231, 233, 232)",
      );
      await expect(
        node.locator('[data-selection-window] [data-window-token="1"]'),
      ).toHaveCount(0);
      await expect(
        node.locator('[data-selection-window] [data-window-token="129"]'),
      ).toHaveAttribute("data-window-state", "new");
      await expect(
        node.locator('[data-window-new-kv] [data-handleid="projected-kv"]'),
      ).toHaveCount(1);
      // 追加连接实际到第 129 行左边，不到公式、外框或灰色淘汰行。
      await expect
        .poll(() =>
          node
            .locator("[data-window-append-connector] path")
            .evaluate((path) => {
              const d = path.getAttribute("d") ?? "";
              const end = d.match(/V ([\d.]+) H ([\d.]+) M/);
              if (!end) return 1000;
              const svg = path.parentElement!.getBoundingClientRect();
              const row = document
                .querySelector(
                  '[data-selection-window] [data-window-token="129"]',
                )!
                .getBoundingClientRect();
              const scale =
                svg.width /
                (path.parentElement as unknown as SVGSVGElement).clientWidth;
              return Math.hypot(
                svg.left + Number(end[2]) * scale - row.left,
                svg.top + Number(end[1]) * scale - row.top - row.height / 2,
              );
            }),
        )
        .toBeLessThan(2);
      const edge = page.locator(
        '.react-flow__edge[data-id="kv-swa"] .react-flow__edge-path',
      );
      const distance = await edge.evaluate((element) => {
        const path = element as SVGPathElement;
        const end = path
          .getPointAtLength(path.getTotalLength())
          .matrixTransform(path.getScreenCTM()!);
        const target = document
          .querySelector('[data-window-new-kv] [data-handleid="projected-kv"]')!
          .getBoundingClientRect();
        return Math.hypot(
          end.x - target.left - target.width / 2,
          end.y - target.top - target.height / 2,
        );
      });
      expect(distance).toBeLessThan(2);
    }
    if (id === "heads") {
      await expect(node.locator("[data-attention-window-map]")).toHaveCount(3);
      await expect(
        node.locator("[data-attention-window-map]").first(),
      ).toContainText("token i+1");
      await expect(node.locator("[data-attention-softmax]")).toHaveCount(3);
      await expect(node.locator("[data-attention-value-sum]")).toHaveCount(3);
    }
    const height = await node.evaluate(
      (el) => (el as HTMLElement).offsetHeight,
    );
    await page.setViewportSize({
      width: 2800,
      height: Math.ceil(height + 650),
    });
    await focus.selectOption(id);
    await settle(page);
    await node.screenshot({ path: `artifacts/layer2-token129-${id}.png` });
    await page.setViewportSize({ width: 2200, height: 1800 });
  }
  await focus.selectOption("swa-window");
  await settle(page);
  await page.screenshot({ path: "artifacts/layer2-token129-context.png" });
  await page.setViewportSize({ width: 900, height: 1200 });
  await focus.selectOption("swa-window");
  await settle(page);
  await contentFits(page.locator('.react-flow__node[data-id="swa-window"]'));
  await page.screenshot({ path: "artifacts/layer2-token129-narrow.png" });
  await page
    .locator(
      '.react-flow__node[data-id="swa-window"] [data-window-update] > strong',
    )
    .click();
  const inspector = page.getByRole("complementary", { name: "模块解释" });
  if (!(await inspector.isVisible()))
    await page.getByRole("button", { name: "显示解释", exact: true }).click();
  await expect(inspector).toContainText("token2–128 原样保留");
  await expect(inspector).toContainText("第 1 层的本地 KV 不拼进第 2 层缓存");
  await expect(inspector.locator(".katex-error")).toHaveCount(0);
  expect(await inspector.locator("annotation").allTextContents()).toContain(
    "W_2^{KV,\\mathrm{SWA}}",
  );
  await expect
    .poll(() => inspector.evaluate((el) => el.scrollWidth - el.clientWidth))
    .toBeLessThanOrEqual(2);
  await page.screenshot({ path: "artifacts/layer2-token129-inspector.png" });
  await page.getByRole("button", { name: "关闭模块解释", exact: true }).click();
  await page
    .getByRole("button", { name: "Prefill · 整段矩阵", exact: true })
    .click();
  await page.setViewportSize({ width: 2200, height: 1800 });
  await focus.selectOption("swa-window");
  await settle(page);
  const prefill = page.locator('.react-flow__node[data-id="swa-window"]');
  await expect(prefill.locator("[data-window-update]")).toHaveCount(0);
  await expect(prefill.locator("[data-prefill-causal]")).toHaveCount(1);
  await contentFits(prefill);
  await prefill.screenshot({ path: "artifacts/layer2-prefill-window.png" });
  expect(errors).toEqual([]);
});
