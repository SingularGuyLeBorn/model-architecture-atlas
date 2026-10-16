import { test, expect } from "@playwright/test";
import { buildGraph } from "../src/compositions/DeepSeekV41Layer";

test("完整层逐模块截图、同级框碰撞和内部溢出审查", async ({ page }, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 2800, height: 2200 });
  await page.goto("/#model=v41&chapter=layer");
  const reports: unknown[] = [];
  for (const layer of [1, 15, 29, 40]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    const phase = layer >= 29 ? "decode" : "prefill";
    await page
      .getByRole("button", {
        name: phase === "decode" ? "Decode · 单步一行" : "Prefill · 整段矩阵",
        exact: true,
      })
      .click();
    const focus = page.getByRole("combobox", { name: "定位模块" });
    const ids = await focus
      .locator("option")
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLOptionElement).value).filter(Boolean),
      );
    const overflow: unknown[] = [];
    for (const id of ids) {
      await focus.selectOption(id);
      const node = page.locator(`.react-flow__node[data-id="${id}"]`);
      await expect(node.locator("[data-detail-suspended]")).toHaveCount(0);
      // 两帧后读取浏览器实际布局，避免把初次测量中的占位当最终尺寸。
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const items = await node.locator("div,section").evaluateAll((elements) =>
        elements
          .filter(
            (el) =>
              el.clientWidth > 0 &&
              !el.querySelector(".react-flow__handle") &&
              el.scrollWidth > el.clientWidth + 2,
          )
          .map((el) => ({
            text: el.textContent?.slice(0, 80),
            width: el.clientWidth,
            content: el.scrollWidth,
          })),
      );
      if (items.length) overflow.push({ id, items });
      if (
        layer === 15 ||
        (layer === 40 && ["next-inputs", "swa-window"].includes(id))
      ) {
        const size = await node.evaluate((el) => ({
          width: (el as HTMLElement).offsetWidth,
          height: (el as HTMLElement).offsetHeight,
        }));
        await page.setViewportSize({
          width: Math.max(2800, Math.ceil(size.width * 0.8 + 220)),
          height: Math.max(2200, Math.ceil(size.height * 0.8 + 480)),
        });
        await focus.selectOption(id);
        await node.screenshot({ path: `artifacts/audit-${layer}-${id}.png` });
        if (["heads", "experts", "hc-mix-f"].includes(id)) {
          const detail = node
            .locator(
              id === "heads"
                ? "[data-attention-denominator]"
                : id === "experts"
                  ? "[data-expert-activation]"
                  : "[data-mhc-gate-branches]",
            )
            .first();
          if (await detail.count())
            await detail.screenshot({
              path: `artifacts/audit-${layer}-${id}-detail.png`,
            });
        }
        await page.setViewportSize({ width: 2800, height: 2200 });
      }
    }
    const topIds = buildGraph(layer, new Map(), phase)
      .nodes.filter((n) => !n.parentId)
      .map((n) => n.id);
    const collisions = await page
      .locator(".react-flow__node")
      .evaluateAll((elements, ids) => {
        const boxes = elements
          .filter((el) => ids.includes((el as HTMLElement).dataset.id!))
          .map((el) => ({
            id: (el as HTMLElement).dataset.id!,
            r: el.getBoundingClientRect(),
          }));
        const hits: string[] = [];
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i],
              b = boxes[j];
            if (
              Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) >
                2 &&
              Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 2
            )
              hits.push(`${a.id} / ${b.id}`);
          }
        return hits;
      }, topIds);
    reports.push({ layer, phase, overflow, collisions });
    await expect(page.locator(".katex-error")).toHaveCount(0);
  }
  console.log("整页结构审查", JSON.stringify(reports));
  await info.attach("full-page-audit.json", {
    body: JSON.stringify(reports, null, 2),
    contentType: "application/json",
  });
  for (const report of reports as {
    overflow: unknown[];
    collisions: string[];
  }[]) {
    expect(report.overflow).toEqual([]);
    expect(report.collisions).toEqual([]);
  }
});

test("切层真实点击到内容更新与下一帧基线", async ({ page }, info) => {
  await page.goto("/#model=v41&chapter=layer");
  await expect(
    page.locator('.react-flow__node[data-id="tokenizer"]'),
  ).toBeVisible();
  await expect
    .poll(() => page.locator("[data-detail-suspended]").count())
    .toBeGreaterThan(45);
  await page.evaluate(() => {
    const results: unknown[] = [];
    (window as unknown as { layerMeasurements: unknown[] }).layerMeasurements =
      results;
    document.addEventListener(
      "click",
      (event) => {
        const button = (event.target as Element).closest<HTMLButtonElement>(
          ".layer-grid button",
        );
        if (!button) return;
        const start = performance.now(),
          layer = Number(button.textContent);
        const observer = new MutationObserver(() => {
          const renderedLayer = document
            .querySelector(".architecture-flow")
            ?.getAttribute("data-render-layer");
          const contentLayer = document
            .querySelector(
              '.react-flow__node[data-id="tokenizer"] > [data-content-layer]',
            )
            ?.getAttribute("data-content-layer");
          if (renderedLayer !== String(layer) || contentLayer !== String(layer))
            return;
          observer.disconnect();
          const dom = performance.now() - start;
          const result = {
            layer,
            dom,
            frame: 0,
            followingFrame: 0,
            geometryReady: 0,
            geometryFollowingFrame: 0,
          };
          requestAnimationFrame(() => {
            result.frame = performance.now() - start;
            requestAnimationFrame(() => {
              result.followingFrame = performance.now() - start;
            });
          });
          const ready = () => {
            const nodes = [
              ...document.querySelectorAll<HTMLElement>(
                ".react-flow__node > [data-content-layer]",
              ),
            ];
            if (
              !nodes.length ||
              nodes.some(
                (node) =>
                  node.dataset.geometryReady !== "true" ||
                  node.dataset.contentLayer !==
                    (node.parentElement?.dataset.id === "first-input"
                      ? "1"
                      : String(layer)),
              )
            ) {
              requestAnimationFrame(ready);
              return;
            }
            result.geometryReady = performance.now() - start;
            requestAnimationFrame(() => {
              result.geometryFollowingFrame = performance.now() - start;
              results.push(result);
            });
          };
          requestAnimationFrame(ready);
        });
        observer.observe(document.querySelector(".architecture-flow")!, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
      },
      true,
    );
  });
  const profiler = process.env.ATLAS_PROFILE
    ? await page.context().newCDPSession(page)
    : null;
  await profiler?.send("Profiler.enable");
  await profiler?.send("Profiler.start");
  const layers = [15, 29, 40, 1, 15, 29, 40, 1];
  for (const [index, layer] of layers.entries()) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await expect(
      page.getByText(`DeepSeek V4.1-Flash · Layer ${layer}`, { exact: true }),
    ).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect
      .poll(() => page.locator("[data-detail-suspended]").count())
      .toBeGreaterThan(45);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { layerMeasurements: unknown[] })
              .layerMeasurements.length,
        ),
      )
      .toBe(index + 1);
  }
  if (profiler) {
    const { profile } = await profiler.send("Profiler.stop");
    await info.attach("layer-cpu-profile.json", {
      body: JSON.stringify(profile),
      contentType: "application/json",
    });
  }
  const results = await page.evaluate(
    () =>
      (window as unknown as { layerMeasurements: unknown[] }).layerMeasurements,
  );
  console.log("切层基线 ms", JSON.stringify(results));
  await info.attach("layer-latency.json", {
    body: JSON.stringify(results),
    contentType: "application/json",
  });
  expect(results).toHaveLength(8);
});
