import { test, expect } from "@playwright/test";
import { models } from "../src/data/models";
test("主要机制可以切换，公式没有解析错误", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  for (const [model, chapter] of [
    ["v41", "overview"],
    ["v3", "mla"],
    ["v3", "moe"],
    ["v4-flash", "csa"],
    ["v4-pro", "mhc"],
    ["r1", "training"],
    ["v31", "training"],
    ["v41", "vision"],
    ["v41", "dspark"],
  ]) {
    await page.goto(`/#model=${model}&chapter=${chapter}`);
    await expect(
      page.locator("nav[aria-label='模型选择'] button[aria-current]"),
    ).toContainText(
      model === "v3"
        ? "DeepSeek V3"
        : model === "r1"
          ? "DeepSeek R1"
          : model === "v31"
            ? "DeepSeek V3.1"
            : model === "v4-pro"
              ? "DeepSeek V4 · Pro"
              : model === "v4-flash"
                ? "DeepSeek V4 · Flash"
                : "DeepSeek V4.1 Flash",
    );
    await expect(page.locator(".stage-card").first()).toBeVisible();
    await expect(page.locator(".katex-error")).toHaveCount(0);
    await page.screenshot({ path: `artifacts/${model}-${chapter}.png` });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    expect(overflow).toBe(false);
  }
  expect(errors).toEqual([]);
});
test("窄屏导航、定位与布局保存", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开导航" }).click();
  await page
    .getByRole("button", { name: "DeepSeek V3 MLA", exact: false })
    .click();
  await expect(page.locator("h1")).toContainText("输入");
  await expect(page.locator(".sidebar")).not.toHaveClass(/open/);
  await page.getByRole("button", { name: "保存布局", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.screenshot({ path: "artifacts/mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
test("完整 V4.1 图正常载入，可切换复杂层与 Decode", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#model=v41&chapter=layer");
  await expect(
    page.getByText("DeepSeek V4.1-Flash · Layer 1", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "15", exact: true }).click();
  await expect(
    page.getByText("DeepSeek V4.1-Flash · Layer 15", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Decode · 单步一行", exact: true })
    .click();
  await expect(page.locator(".katex-error")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/v41-layer15.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/v41-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  expect(errors).toEqual([]);
});
for (const scenario of ["mla", "full-experts"] as const)
  test(`画布平移反馈测量 · ${scenario}`, async ({ page }, testInfo) => {
    await page.goto(
      scenario === "mla"
        ? "/#model=v3&chapter=mla"
        : "/#model=v41&chapter=layer",
    );
    if (scenario === "mla")
      await expect(page.locator(".stage-card").first()).toBeVisible();
    else {
      await page.getByRole("button", { name: "15", exact: true }).click();
      await page
        .getByRole("combobox", { name: "定位模块" })
        .selectOption("experts");
      await expect(
        page.locator(".react-flow__node[data-id=experts]"),
      ).toBeVisible();
    }
    const pane = page.locator(".react-flow__pane");
    const rect = await pane.boundingBox();
    expect(rect).not.toBeNull();
    await page.evaluate(() => {
      const samples: number[] = [];
      (window as unknown as { panSamples: number[] }).panSamples = samples;
      const frameState = { frames: [] as number[], running: true, previous: 0 };
      (window as unknown as { frameState: typeof frameState }).frameState =
        frameState;
      const frame = (time: number) => {
        if (frameState.previous)
          frameState.frames.push(time - frameState.previous);
        frameState.previous = time;
        if (frameState.running) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      const viewport = document.querySelector(".react-flow__viewport")!;
      let last = viewport.getAttribute("style");
      window.addEventListener(
        "mousemove",
        (event) => {
          if (!(event.buttons & 1)) return;
          const start = performance.now();
          requestAnimationFrame(() => {
            const next = viewport.getAttribute("style");
            if (next !== last) samples.push(performance.now() - start);
            last = next;
          });
        },
        true,
      );
    });
    const point = await page.evaluate(() => {
      const pane = document
        .querySelector(".react-flow__pane")!
        .getBoundingClientRect();
      for (let y = pane.top + 80; y < pane.bottom - 20; y += 20)
        for (let x = pane.left + 20; x < pane.right - 20; x += 20) {
          const el = document.elementFromPoint(x, y);
          if (el?.classList.contains("react-flow__pane")) return { x, y };
        }
      throw new Error("没有可拖动的空白画布");
    });
    const { x, y } = point;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 60; i++) await page.mouse.move(x + i * 2, y + i);
    await page.mouse.up();
    const samples = await page.evaluate(
      () => (window as unknown as { panSamples: number[] }).panSamples,
    );
    const sorted = samples.toSorted((a, b) => a - b);
    const report = {
      samples: sorted.length,
      median: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      max: sorted.at(-1),
    };
    const frames = await page.evaluate(() => {
      const data = (
        window as unknown as {
          frameState: { frames: number[]; running: boolean };
        }
      ).frameState;
      data.running = false;
      return data.frames;
    });
    const frameSorted = frames.toSorted((a, b) => a - b);
    const frameReport = {
      p95: frameSorted[Math.floor(frameSorted.length * 0.95)],
      max: frameSorted.at(-1),
    };
    await testInfo.attach("pan-latency.json", {
      body: JSON.stringify(report),
      contentType: "application/json",
    });
    console.log(
      scenario,
      "Pan event→rAF (ms)",
      report,
      "frame intervals",
      frameReport,
    );
    if (scenario === "full-experts")
      await page.screenshot({ path: "artifacts/full-experts-detail.png" });
    await testInfo.attach("frame-intervals.json", {
      body: JSON.stringify(frameReport),
      contentType: "application/json",
    });
    expect(samples.length).toBeGreaterThan(10);
    expect(report.p95).toBeLessThan(30);
  });
test("各模型机制逐步定位，无矩阵内容溢出或公式转义残留", async ({ page }) => {
  test.setTimeout(180000);
  const problems: string[] = [];
  for (const model of models)
    for (const chapter of model.chapters.filter((c) => c !== "layer")) {
      await page.goto(`/#model=${model.id}&chapter=${chapter}`);
      await expect(page.locator("h1")).toContainText(
        (await import("../src/data/models")).chapterNames[chapter],
      );
      const steps = page.locator(".stage-nav button");
      for (let i = 0; i < (await steps.count()); i++) {
        await steps.nth(i).click();
        const found = await page.evaluate(() => {
          return [
            ...document.querySelectorAll<HTMLElement>(
              ".stage-card .tensor,.stage-card .scalar,.stage-card .data-box,.stage-card .stage-input,.stage-card .stage-output",
            ),
          ]
            .filter((el) => el.scrollWidth > el.clientWidth + 2)
            .map((el) => (el.textContent ?? "").slice(0, 100));
        });
        if (found.length)
          problems.push(
            `${model.id}/${chapter}/${i}: ${found.slice(0, 4).join(" | ")}`,
          );
        await expect(page.locator(".katex-error")).toHaveCount(0);
      }
    }
  expect(problems).toEqual([]);
});
