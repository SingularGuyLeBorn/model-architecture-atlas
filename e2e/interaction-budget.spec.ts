import { expect, test } from "@playwright/test";

for (const panelOpen of [false, true])
  test(`完整专家区连续操作延迟（解释面板${panelOpen ? "打开" : "关闭"}）`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 2200, height: 1500 });
    await page.goto("/#model=v41&chapter=layer");
    await page.getByRole("button", { name: "15", exact: true }).click();
    const focus = page.getByRole("combobox", { name: "定位模块" });
    await focus.selectOption("experts");
    const experts = page.locator('.react-flow__node[data-id="experts"]');
    await expect(experts.locator("[data-expert-activation]")).toHaveCount(4);
    if (panelOpen)
      await experts
        .getByText("Layer 15 · 专家层 · 得分为示意", { exact: true })
        .click();
    await page.evaluate(() => {
      const state = {
        mode: "",
        started: false,
        samples: [] as { mode: string; dom: number; nextFrame: number }[],
        frames: [] as { mode: string; interval: number }[],
        lastFrame: 0,
        running: true,
      };
      (
        window as unknown as { interactionProbe: typeof state }
      ).interactionProbe = state;
      const frame = (now: number) => {
        if (state.mode && state.started && state.lastFrame)
          state.frames.push({
            mode: state.mode,
            interval: now - state.lastFrame,
          });
        state.lastFrame = now;
        if (state.running) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      const record = () => {
        if (!state.mode) return;
        if (!state.started) {
          state.started = true;
          state.lastFrame = 0;
        }
        const mode = state.mode,
          start = performance.now();
        const target = document.querySelector(
          mode === "node"
            ? '.react-flow__node[data-id="experts"]'
            : ".react-flow__viewport",
        )!;
        const previous = target.getAttribute("style");
        const observer = new MutationObserver(() => {
          if (target.getAttribute("style") === previous) return;
          observer.disconnect();
          const dom = performance.now() - start;
          requestAnimationFrame(() =>
            state.samples.push({
              mode,
              dom,
              nextFrame: performance.now() - start,
            }),
          );
        });
        observer.observe(target, {
          attributes: true,
          attributeFilter: ["style"],
        });
        // 测量器仅跨两帧观察，不把没有发生变换的输入留到下一次操作。
        requestAnimationFrame(() =>
          requestAnimationFrame(() => observer.disconnect()),
        );
      };
      window.addEventListener(
        "mousemove",
        (event) => {
          if (event.buttons & 1) record();
        },
        true,
      );
      window.addEventListener("wheel", record, {
        capture: true,
        passive: true,
      });
    });
    const mode = async (value: string) =>
      page.evaluate((value) => {
        (
          window as unknown as {
            interactionProbe: {
              mode: string;
              started: boolean;
              lastFrame: number;
            };
          }
        ).interactionProbe.mode = value;
        const probe = (
          window as unknown as {
            interactionProbe: { started: boolean; lastFrame: number };
          }
        ).interactionProbe;
        probe.started = false;
        probe.lastFrame = 0;
      }, value);
    const blank = async () =>
      page.evaluate(() => {
        const r = document
          .querySelector(".react-flow__pane")!
          .getBoundingClientRect();
        for (let y = r.top + 90; y < r.bottom - 100; y += 20)
          for (let x = r.left + 25; x < r.right - 100; x += 20)
            if (
              document
                .elementFromPoint(x, y)
                ?.classList.contains("react-flow__pane")
            )
              return { x, y };
        throw new Error("没有可拖动的空白区域");
      });
    await mode("pan");
    const point = await blank();
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    for (let i = 1; i <= 50; i++)
      await page.mouse.move(point.x + i, point.y + i / 2);
    await page.mouse.up();
    await mode("wheel");
    const wheelPoint = await blank();
    await page.mouse.move(wheelPoint.x, wheelPoint.y);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, i % 2 ? -12 : 12);
    const scaleBefore = await page
      .locator(".react-flow__viewport")
      .getAttribute("style");
    await mode("zoom");
    await page.keyboard.down("Control");
    for (let i = 0; i < 25; i++) await page.mouse.wheel(0, i % 2 ? -4 : 4);
    await page.keyboard.up("Control");
    await expect
      .poll(() => page.locator(".react-flow__viewport").getAttribute("style"))
      .not.toBe(scaleBefore);
    await mode("");
    await focus.selectOption("experts");
    const title = await experts
      .getByText("Layer 15 · 专家层 · 得分为示意", { exact: true })
      .boundingBox();
    await mode("node");
    await page.mouse.move(title!.x + 80, title!.y + title!.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 40; i++)
      await page.mouse.move(
        title!.x + 80 + i,
        title!.y + title!.height / 2 + i / 3,
      );
    await page.mouse.up();
    await mode("");
    const report = await page.evaluate(() => {
      const state = (
        window as unknown as {
          interactionProbe: {
            running: boolean;
            samples: { mode: string; dom: number; nextFrame: number }[];
            frames: { mode: string; interval: number }[];
          };
        }
      ).interactionProbe;
      state.running = false;
      const p95 = (values: number[]) =>
        values.sort((a, b) => a - b)[Math.floor(values.length * 0.95)];
      return ["pan", "wheel", "zoom", "node"].map((mode) => {
        const samples = state.samples.filter((s) => s.mode === mode),
          frames = state.frames
            .filter((s) => s.mode === mode)
            .map((s) => s.interval);
        return {
          mode,
          samples: samples.length,
          domP95: p95(samples.map((s) => s.dom)),
          nextFrameP95: p95(samples.map((s) => s.nextFrame)),
          frameIntervalP95: p95(frames),
          maxFrameInterval: Math.max(...frames),
        };
      });
    });
    console.log(
      `连续交互 / 侧栏${panelOpen ? "打开" : "关闭"}`,
      JSON.stringify(report),
    );
    await info.attach("interaction-latency.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    for (const row of report) expect(row.samples, row.mode).toBeGreaterThan(10);
  });
