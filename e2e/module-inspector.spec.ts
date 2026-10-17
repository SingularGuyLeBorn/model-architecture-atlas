import { test, expect } from "@playwright/test";
import { centerCanvasTarget } from "./canvas-navigation";

test("解释面板显式开关、独立占位、滚轮平移与 mHC 结构验收", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 2200, height: 1700 });
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  const pane = page.getByRole("complementary", { name: "模块解释" });
  await focus.selectOption("hc-mix-a");
  const mix = page.locator('.react-flow__node[data-id="hc-mix-a"]');
  await expect(mix.locator("[data-mhc-flatten]")).toBeVisible();
  await expect(mix).not.toContainText(
    /不是|而非|并非|不能|不要|仍沿用同一绿色|不另起|避免.*混淆/,
  );
  await expect
    .poll(() =>
      mix
        .locator("div,section")
        .evaluateAll((elements) =>
          elements
            .filter(
              (el) =>
                el.clientWidth > 0 &&
                !el.querySelector(".react-flow__handle") &&
                el.scrollWidth > el.clientWidth + 2,
            )
            .map((el) => el.textContent?.slice(0, 70)),
        ),
    )
    .toEqual([]);
  await page.setViewportSize({ width: 3400, height: 3200 });
  await focus.selectOption("hc-mix-a");
  await mix.screenshot({ path: "artifacts/mhc-coefficients-structured.png" });
  await mix
    .locator("[data-mhc-gate-branches]")
    .screenshot({ path: "artifacts/mhc-coefficient-branches.png" });
  await page.setViewportSize({ width: 2200, height: 1700 });
  await focus.selectOption("hc-mix-a");
  await page.evaluate(() => {
    const timings: number[] = [];
    (window as unknown as { inspectorTimes: number[] }).inspectorTimes =
      timings;
    window.addEventListener(
      "click",
      (event) => {
        if (!(event.target as Element).closest(".react-flow__node")) return;
        const started = event.timeStamp;
        requestAnimationFrame(() => {
          if (document.querySelector("[data-module-inspector]"))
            timings.push(performance.now() - started);
        });
      },
      true,
    );
  });
  await centerCanvasTarget(page, mix.locator("[data-mhc-mix]>strong"));
  await mix.locator("[data-mhc-mix]>strong").click();
  await expect(pane).toBeVisible();
  await expect(pane.getByRole("heading", { level: 2 })).toContainText(
    "控制系数",
  );
  await expect(pane.locator(".inspector-prose > p").first()).toContainText(
    "四路残差",
  );
  await expect(pane.locator("dl,h3,h4,ul,ol,.inspector-formula")).toHaveCount(
    0,
  );
  await expect(pane).not.toContainText("变量字典");
  await expect(pane).not.toContainText(
    /不是|而非|并非|不能|不要|仍沿用同一绿色|不另起/,
  );
  await pane.screenshot({ path: "artifacts/inspector-prose-mhc.png" });
  const frame = await mix.boundingBox(),
    panel = await pane.boundingBox();
  expect(frame!.x + frame!.width).toBeLessThanOrEqual(panel!.x + 1);
  await page.screenshot({ path: "artifacts/module-inspector-desktop.png" });
  await page.getByRole("button", { name: "关闭模块解释" }).click();
  await focus.selectOption("q");
  const query = page.locator('.react-flow__node[data-id="q"]');
  await query
    .getByText("Layer 1 · Query · Prefill 整段投影", { exact: true })
    .click();
  await expect(pane).toHaveCount(0);
  await page.getByRole("button", { name: "显示解释", exact: true }).click();
  await expect(pane).toBeVisible();
  await expect(pane.getByRole("heading", { level: 2 })).toContainText("Query");
  await focus.selectOption("kv");
  await page
    .locator('.react-flow__node[data-id="kv"]')
    .getByText("Layer 1 · 本层独立 KV", { exact: true })
    .click();
  await expect(pane.getByRole("heading", { level: 2 })).toContainText(
    "本层独立 KV",
  );
  await pane.screenshot({ path: "artifacts/inspector-prose-kv.png" });
  const before = await page
    .locator(".react-flow__viewport")
    .getAttribute("style");
  const canvas = await page
    .locator(".diagram-interaction-surface")
    .boundingBox();
  await page.mouse.move(
    canvas!.x + canvas!.width / 2,
    canvas!.y + canvas!.height / 2,
  );
  await page.mouse.wheel(0, 180);
  await expect
    .poll(() => page.locator(".react-flow__viewport").getAttribute("style"))
    .not.toBe(before);
  const after = await page
    .locator(".react-flow__viewport")
    .getAttribute("style");
  await pane.locator(".inspector-scroll").hover();
  await page.mouse.wheel(0, 250);
  expect(
    await page.locator(".react-flow__viewport").getAttribute("style"),
  ).toBe(after);
  await page.setViewportSize({ width: 390, height: 844 });
  await pane.locator(".inspector-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  const narrowCanvas = await page
    .locator(".diagram-interaction-surface")
    .boundingBox();
  const narrowPanel = await pane.boundingBox();
  expect(narrowCanvas!.y + narrowCanvas!.height).toBeLessThanOrEqual(
    narrowPanel!.y + 1,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: "artifacts/module-inspector-mobile.png" });
  expect(await pane.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await expect(page.locator(".katex-error")).toHaveCount(0);
  const timings = await page.evaluate(
    () => (window as unknown as { inspectorTimes: number[] }).inspectorTimes,
  );
  console.log("面板点击到下一帧 (ms)", timings);
  await testInfo.attach("inspector-latency.json", {
    body: JSON.stringify(timings),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});
