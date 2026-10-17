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

test("第 2 层 token t：生成、淘汰、追加、读取是同一条实际路径", async ({
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
      expect(formulas).toContain("\\mathbf x_{2,t}");
      expect(formulas).toContain("\\mathbf u_{2,t}");
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
      await expect(
        page.locator('.react-flow__node[data-id="swa-result"]'),
      ).toHaveCount(0);
      await expect(
        node.locator('[data-selection-window] [data-handleid="local-window"]'),
      ).toHaveCount(1);
      await expect(
        node.locator('[data-window-token="t"] [data-window-element]'),
      ).toHaveCount(3);
      const cellWidths = await node
        .locator("[data-selection-window] [data-window-element]")
        .evaluateAll((cells) =>
          cells.map((cell) => cell.getBoundingClientRect().width),
        );
      expect(Math.max(...cellWidths) - Math.min(...cellWidths)).toBeLessThan(2);
      await expect(
        node.locator('[data-previous-token="t-128"]'),
      ).toHaveAttribute("aria-label", "淘汰");
      await expect(
        node
          .locator('[data-previous-token="t-128"] [data-window-element]')
          .first(),
      ).toHaveCSS("background-color", "rgb(231, 233, 232)");
      await expect(
        node.locator('[data-selection-window] [data-window-token="t-128"]'),
      ).toHaveCount(0);
      await expect(
        node.locator('[data-selection-window] [data-window-token="t"]'),
      ).toHaveAttribute("data-window-state", "new");
      await expect(
        node.locator('[data-window-new-kv] [data-handleid="projected-kv"]'),
      ).toHaveCount(1);
      // 追加连接实际到当前 t 行左边，不到公式、外框或灰色淘汰行。
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
                  '[data-selection-window] [data-window-token="t"]',
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
      const sourceDistance = await page
        .locator(
          '.react-flow__edge[data-id="swa-merge"] .react-flow__edge-path',
        )
        .evaluate((element) => {
          const path = element as SVGPathElement;
          const start = path
            .getPointAtLength(0)
            .matrixTransform(path.getScreenCTM()!);
          const source = document
            .querySelector(
              '[data-selection-window] [data-handleid="local-window"]',
            )!
            .getBoundingClientRect();
          return Math.hypot(
            start.x - source.left - source.width / 2,
            start.y - source.top - source.height / 2,
          );
        });
      expect(sourceDistance).toBeLessThan(2);
    }
    if (id === "heads") {
      await expect(node.locator("[data-attention-window-map]")).toHaveCount(3);
      await expect(
        node.locator("[data-attention-window-map]").first(),
      ).toContainText("r+j-1");
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
    await node.screenshot({ path: `artifacts/layer2-token t-${id}.png` });
    await page.setViewportSize({ width: 2200, height: 1800 });
  }
  await focus.selectOption("swa-window");
  await settle(page);
  await page.screenshot({ path: "artifacts/layer2-token t-context.png" });
  await page.setViewportSize({ width: 900, height: 1200 });
  await focus.selectOption("swa-window");
  await settle(page);
  await contentFits(page.locator('.react-flow__node[data-id="swa-window"]'));
  await page.screenshot({ path: "artifacts/layer2-token t-narrow.png" });
  await page
    .locator(
      '.react-flow__node[data-id="swa-window"] [data-window-update] > strong',
    )
    .click();
  const inspector = page.getByRole("complementary", { name: "模块解释" });
  if (!(await inspector.isVisible()))
    await page.getByRole("button", { name: "显示解释", exact: true }).click();
  await expect(inspector).toContainText("原样保留 t−127 到 t−1");
  await expect(inspector).toContainText("上一层的本地 KV 不拼进本层");
  await expect(inspector.locator(".katex-error")).toHaveCount(0);
  expect(await inspector.locator("annotation").allTextContents()).toContain(
    "W_{2}^{KV,\\mathrm{SWA}}",
  );
  await expect
    .poll(() => inspector.evaluate((el) => el.scrollWidth - el.clientWidth))
    .toBeLessThanOrEqual(2);
  await page.screenshot({ path: "artifacts/layer2-token t-inspector.png" });
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

test("Full、Reindex、Reuse 都在本层连接历史窗口、全局读取和 Attention", async ({
  page,
}) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 2400, height: 1800 });
  await page.goto("/?revision=inspector-prose#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  await page
    .getByRole("button", { name: "Decode · 单步一行", exact: true })
    .click();
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [3, 4, 21, 25, 26]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    for (const id of [
      "kv",
      "swa-window",
      "compressor",
      "indexer",
      "global-select",
      "kv-merge",
      "heads",
      "concat",
    ]) {
      await focus.selectOption(id);
      await settle(page);
      const node = page.locator(`.react-flow__node[data-id="${id}"]`);
      await contentFits(node);
      if (id === "swa-window") {
        await expect(
          node.locator('[data-previous-token="t-128"]'),
        ).toHaveAttribute("aria-label", "淘汰");
        await expect(node.locator('[data-window-token="t"]')).toHaveAttribute(
          "data-window-state",
          "new",
        );
        await expect(
          node.locator('[data-selection-window] [data-window-token="t-128"]'),
        ).toHaveCount(0);
        await expect(
          node.locator('[data-window-new-kv] [data-handleid="projected-kv"]'),
        ).toHaveCount(1);
      }
      if (id === "compressor") {
        if (layer === 3)
          await expect(node.locator("[data-compressor-pending]")).toContainText(
            "G / Key 不追加",
          );
        if (layer === 21)
          await expect(node.locator("[data-global-history]")).toContainText(
            "每步追加",
          );
        if ([4, 25, 26].includes(layer))
          await expect(
            node.locator('[data-cache-reference="G"]'),
          ).toHaveAttribute("data-reference-source", layer === 4 ? "3" : "21");
      }
      if (id === "indexer" && [4, 26].includes(layer)) {
        await expect(
          node.locator('[data-cache-reference="I"]'),
        ).toHaveAttribute("data-reference-source", layer === 4 ? "3" : "25");
        await expect(node.locator("[data-index-projection]")).toHaveCount(0);
      }
      if (id === "heads") {
        await expect(node.locator("[data-attention-window-map]")).toHaveCount(
          3,
        );
        await expect(
          node.locator("[data-attention-window-map]").first(),
        ).toContainText("后段：选中 G 行");
        await expect(node.locator("[data-attention-softmax]")).toHaveCount(3);
      }
      if (id === "concat") {
        await expect(node.locator("[data-head-concat-original]")).toHaveCount(
          3,
        );
        await expect(node.locator("[data-original-head]")).toHaveCount(9);
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
      await node.screenshot({
        path: `artifacts/layer${layer}-token-t-${id}.png`,
      });
      await page.setViewportSize({ width: 2400, height: 1800 });
    }
  }
  expect(errors).toEqual([]);
});
