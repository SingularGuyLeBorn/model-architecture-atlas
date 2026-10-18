import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

// 这是入口/全图 CPU 诊断，30ms 交互验收另见 recipe-interaction-budget.spec.ts。
test.use({ trace: "off" });

for (const model of ["mimo25", "qwen38"]) {
  test(`${model} 从导航进入逐层图并连续切换首层末层`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/#model=${model}&chapter=overview`);
    await page.getByRole("button", { name: /逐层交互/ }).click();
    const samples: object[] = [];
    for (const layer of [1, 2, 48, 1]) {
      const start = Date.now();
      await page
        .getByRole("combobox", { name: "层", exact: true })
        .selectOption(String(layer));
      await page
        .getByRole("button", {
          name: layer === 48 ? "Decode · 当前一行" : "Prefill · N 行",
          exact: true,
        })
        .click();
      await expect(
        page.locator(".react-flow__edge-path").first(),
      ).toBeAttached();
      await page.locator(".stage-nav button").last().click();
      await expect(page.locator(".stage-card").last()).toBeVisible();
      samples.push({
        layer,
        readyMs: Date.now() - start,
        edges: await page.locator(".react-flow__edge-path").count(),
      });
    }
    await info.attach("switches.json", {
      body: JSON.stringify(samples),
      contentType: "application/json",
    });
    console.log(model, "switches", samples);
    expect(errors).toEqual([]);
  });
}

for (const model of ["mimo25", "qwen38", "v41"]) {
  test(`${model} 逐层入口与全图性能`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
    await page.addInitScript(() => {
      const probe = { tasks: [] as number[], frames: [] as number[], last: 0 };
      (window as unknown as { perfProbe: typeof probe }).perfProbe = probe;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) probe.tasks.push(entry.duration);
      }).observe({ type: "longtask", buffered: true });
      const frame = (now: number) => {
        if (probe.last) probe.frames.push(now - probe.last);
        probe.last = now;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    const started = Date.now();
    await page.goto(`/#model=${model}&chapter=layer`);
    await expect(page.locator(".react-flow__edge-path").first()).toBeAttached();
    if (model === "v41")
      await page.locator(".react-flow__controls-fitview").click();
    else await page.getByRole("button", { name: "全图", exact: true }).click();
    await page.screenshot({ path: info.outputPath("full.png") });
    const result = await page.evaluate(() => ({
      ...(window as unknown as { perfProbe: object }).perfProbe,
      nodes: document.querySelectorAll(".react-flow__node").length,
      edges: document.querySelectorAll(".react-flow__edge").length,
    }));
    const { profile } = await cdp.send("Profiler.stop");
    await writeFile(info.outputPath("cpu.json"), JSON.stringify(profile));
    await info.attach("cpu", {
      body: JSON.stringify(profile),
      contentType: "application/json",
    });
    await info.attach("timings", {
      body: JSON.stringify({ ...result, readyMs: Date.now() - started }),
      contentType: "application/json",
    });
    console.log(
      model,
      JSON.stringify({ ...result, readyMs: Date.now() - started }),
    );
    expect(errors).toEqual([]);
  });
}
