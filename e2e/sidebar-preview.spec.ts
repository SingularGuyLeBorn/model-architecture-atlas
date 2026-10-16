import { test, expect } from "@playwright/test";

test("来源栏预览保留完整内容，窄屏分区不遮挡图", async ({ page }) => {
  await page.goto("/#model=v41&chapter=overview");
  const trigger = page.getByRole("button", {
    name: "固定展开来源栏",
    exact: true,
  });
  await trigger.hover();
  const drawer = page.locator(".source-drawer");
  await expect(drawer).toBeVisible();
  await drawer.hover();
  await expect(drawer.locator("a").first()).toBeVisible();
  await page.waitForTimeout(300);
  const gap = await page.evaluate(
    () =>
      document.querySelector(".source-rail")!.getBoundingClientRect().left -
      document.querySelector(".main")!.getBoundingClientRect().right,
  );
  expect(gap).toBeGreaterThanOrEqual(-1);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await trigger.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  const stacked = await page.evaluate(() => ({
    bottom: document.querySelector(".main")!.getBoundingClientRect().bottom,
    top: document.querySelector(".source-rail")!.getBoundingClientRect().top,
    width: document.documentElement.scrollWidth,
  }));
  expect(stacked.bottom).toBeLessThanOrEqual(stacked.top + 1);
  expect(stacked.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "artifacts/sources-slide-mobile.png" });
});

test("预览延迟可取消，滑动中占位连续且支持键盘与减少动态效果", async ({
  page,
}) => {
  await page.goto("/#model=v41&chapter=layer");
  await expect(page.getByRole("combobox", { name: "定位模块" })).toBeVisible();
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  await page.mouse.move(700, 150);
  await page.waitForTimeout(300);
  const rail = page.locator(".navigation-rail");
  const trigger = page.getByRole("button", {
    name: "固定展开左栏",
    exact: true,
  });
  await trigger.hover();
  await page.waitForTimeout(250);
  await expect(rail).toHaveAttribute("data-expanded", "false");
  await page.mouse.move(700, 150);
  await page.waitForTimeout(600);
  await expect(rail).toHaveAttribute("data-expanded", "false");
  await page.evaluate(() => {
    const samples: { width: number; gap: number; at: number }[] = [];
    const start = performance.now();
    (window as unknown as { railSamples: typeof samples }).railSamples =
      samples;
    const sample = () => {
      const rail = document
        .querySelector(".navigation-rail")!
        .getBoundingClientRect();
      const main = document.querySelector(".main")!.getBoundingClientRect();
      samples.push({
        width: rail.width,
        gap: main.left - rail.right,
        at: performance.now() - start,
      });
      if (performance.now() - start < 1300) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await trigger.hover();
  await expect(rail).toHaveAttribute("data-expanded", "true");
  await page.screenshot({ path: "artifacts/sidebar-slide-moving.png" });
  await page.waitForTimeout(400);
  const samples = await page.evaluate(
    () =>
      (
        window as unknown as {
          railSamples: { width: number; gap: number; at: number }[];
        }
      ).railSamples,
  );
  expect(samples.some((s) => s.width > 54 && s.width < 250)).toBe(true);
  expect(samples.every((s) => s.gap >= -1)).toBe(true);
  const frameTimes = samples
    .slice(1)
    .map((s, i) => s.at - samples[i].at)
    .sort((a, b) => a - b);
  console.log("侧栏采样帧间隔", {
    p95: frameTimes[Math.floor(frameTimes.length * 0.95)],
    max: Math.max(...frameTimes),
  });
  await page.locator(".chapter-nav button").first().focus();
  await page.keyboard.press("Escape");
  await expect(rail).toHaveAttribute("data-expanded", "false");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Tab");
  expect(
    await page
      .locator(".sidebar")
      .evaluate((el) => el.contains(document.activeElement)),
  ).toBe(false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await rail.evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  await trigger.click();
  await expect(rail).toHaveAttribute("data-expanded", "true");
  await page.screenshot({ path: "artifacts/sidebar-slide-open.png" });
});

test("左右栏悬停预览、导航收回、固定展开与扩展缩放", async ({ page }) => {
  await page.goto("/#model=v41&chapter=layer");
  await expect(page.getByRole("combobox", { name: "定位模块" })).toBeVisible();
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  const left = page.getByRole("button", { name: "固定展开左栏", exact: true });
  await page.mouse.move(700, 150);
  await expect(page.locator(".sidebar")).toBeHidden();
  await left.hover();
  await expect(page.locator(".sidebar")).toBeVisible();
  await page
    .getByRole("navigation", { name: "章节选择" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.locator(".sidebar")).toBeHidden();
  await left.hover();
  await left.click();
  await page.mouse.move(700, 150);
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "15", exact: true }).click();
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("hc-mix-f");
  const trigger = page.getByRole("button", {
    name: "固定展开右栏",
    exact: true,
  });
  await trigger.hover();
  await expect(page.locator("[data-module-inspector]")).toBeVisible();
  await page.locator("[data-module-inspector]").hover();
  await expect(page.locator("[data-module-inspector]")).toBeVisible();
  await page.screenshot({ path: "artifacts/sidebar-preview.png" });
  await page.mouse.move(700, 150);
  await expect(page.locator("[data-module-inspector]")).toBeHidden();
  await trigger.click();
  await page.mouse.move(700, 150);
  await expect(page.locator("[data-module-inspector]")).toBeVisible();
  await page.getByRole("button", { name: "关闭模块解释" }).click();
  const zoom = () =>
    page
      .locator(".react-flow__viewport")
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  for (
    let n = 0;
    n < 30 &&
    !(await page.locator(".react-flow__controls-zoomin").isDisabled());
    n++
  ) {
    await page.locator(".react-flow__controls-zoomin").click();
    await page.waitForTimeout(220);
  }
  await expect.poll(zoom).toBeCloseTo(8, 1);
  for (
    let n = 0;
    n < 45 &&
    !(await page.locator(".react-flow__controls-zoomout").isDisabled());
    n++
  ) {
    await page.locator(".react-flow__controls-zoomout").click();
    await page.waitForTimeout(220);
  }
  await expect.poll(zoom).toBeCloseTo(0.02, 2);
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("hc-mix-f");
  await page.setViewportSize({ width: 3000, height: 2600 });
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("hc-mix-f");
  await page
    .locator('[data-id="hc-mix-f"] [data-mhc-sinkhorn]')
    .screenshot({ path: "artifacts/sinkhorn-semantic-colors.png" });
  await expect(page.locator(".katex-error")).toHaveCount(0);
});
