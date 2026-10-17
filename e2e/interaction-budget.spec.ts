import { expect, test } from "@playwright/test";

// 性能测量不同时抓取整页 DOM 快照：Playwright 的 visitNode 遍历会阻塞下一帧，
// 把录制器开销算成应用延迟。保留下方的真实输入、30ms 断言、JSON 采样和截图。
test.use({ trace: "off" });

for (const panelOpen of [false, true])
  test(`完整专家区连续操作延迟（解释面板${panelOpen ? "打开" : "关闭"}）`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
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
    await expect(page.locator(".inspector-rail")).toHaveAttribute(
      "data-expanded",
      String(panelOpen),
    );
    await page.evaluate(() => {
      let pending: MutationObserver | undefined;
      const state = {
        mode: "",
        started: false,
        samples: [] as { mode: string; dom: number; nextFrame: number }[],
        inputs: {} as Record<string, number>,
        frames: [] as { mode: string; interval: number }[],
        lastFrame: 0,
        running: true,
        finishInput: () => pending?.disconnect(),
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
        // 一次变化只归给对应的最新输入；抓取阈值内的旧输入不能偷算后续变化。
        pending?.disconnect();
        if (!state.mode) return;
        if (!state.started) {
          state.started = true;
          state.lastFrame = 0;
        }
        const mode = state.mode,
          start = performance.now();
        state.inputs[mode] = (state.inputs[mode] ?? 0) + 1;
        const target = document.querySelector(
          mode === "node"
            ? '.react-flow__node[data-id="experts"]'
            : mode === "edge"
              ? '.react-flow__edge[data-id="q-low-rank-indexer"] .react-flow__edge-path'
              : ".react-flow__viewport",
        )!;
        const attribute = mode === "edge" ? "d" : "style";
        const previous = target.getAttribute(attribute);
        const observer = new MutationObserver(() => {
          if (target.getAttribute(attribute) === previous) return;
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
        pending = observer;
        observer.observe(target, {
          attributes: true,
          attributeFilter: [attribute],
        });
        // 不在 30ms 附近截掉慢样本；未反馈输入也计数，不能靠漏测通过预算。
        let remaining = 8;
        const expire = () => {
          if (--remaining) requestAnimationFrame(expire);
          else observer.disconnect();
        };
        requestAnimationFrame(expire);
      };
      window.addEventListener(
        "pointermove",
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
        const probe = (
          window as unknown as {
            interactionProbe: {
              mode: string;
              started: boolean;
              lastFrame: number;
              finishInput: () => void;
            };
          }
        ).interactionProbe;
        // 松手后切模式时停止未匹配输入，后面的撤销和定位不是拖动反馈。
        probe.finishInput();
        probe.mode = value;
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
    const originalNodeStyle = await experts.getAttribute("style");
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
    const movedNodeStyle = await experts.getAttribute("style");
    expect(movedNodeStyle).not.toBe(originalNodeStyle);
    await focus.focus();
    await page.keyboard.press("Control+z");
    await expect(experts).toHaveAttribute("style", originalNodeStyle!);
    await page.keyboard.press("Control+y");
    await expect(experts).toHaveAttribute("style", movedNodeStyle!);
    await page.screenshot({
      path: `artifacts/interaction-node-${panelOpen}.png`,
    });
    await focus.selectOption("indexer");
    const wire = page.locator(
      '.react-flow__edge[data-id="q-low-rank-indexer"] .react-flow__edge-path',
    );
    const end = await wire.evaluate((el) => {
      const path = el as SVGPathElement;
      const p = path.getPointAtLength(path.getTotalLength());
      const screen = new DOMPoint(p.x, p.y).matrixTransform(
        path.getScreenCTM()!,
      );
      return { x: screen.x, y: screen.y };
    });
    await page.mouse.move(1000, 700);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(2000 - end.x, 1500 - end.y, { steps: 5 });
    await page.mouse.up({ button: "middle" });
    const grab = await wire.evaluate((el) => {
      const path = el as SVGPathElement;
      const points = [
        ...path.getAttribute("d")!.matchAll(/([ML])\s*([-\d.]+)\s+([-\d.]+)/g),
      ];
      for (let i = points.length - 1; i > 0; i--) {
        if (points[i][1] !== "L") continue;
        const a = new DOMPoint(
          +points[i - 1][2],
          +points[i - 1][3],
        ).matrixTransform(path.getScreenCTM()!);
        const b = new DOMPoint(+points[i][2], +points[i][3]).matrixTransform(
          path.getScreenCTM()!,
        );
        if (Math.abs(a.x - b.x) > 0.1) continue;
        for (
          let y = Math.min(Math.max(a.y, b.y) - 30, innerHeight - 50);
          y > Math.max(Math.min(a.y, b.y) + 30, 260);
          y -= 20
        ) {
          if (a.x < 30 || a.x > innerWidth - 150) continue;
          if (
            document
              .elementFromPoint(a.x, y)
              ?.closest(".react-flow__edge")
              ?.getAttribute("data-id") === "q-low-rank-indexer"
          )
            return { x: a.x, y };
        }
      }
      throw new Error("没有可拖动的 Indexer 入线");
    });
    const edgeCount = await page.locator(".react-flow__edge").count();
    const original = await wire.getAttribute("d");
    await mode("edge");
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    for (let i = 1; i <= 40; i++) await page.mouse.move(grab.x + i * 2, grab.y);
    await page.mouse.up();
    await mode("");
    await expect(wire).not.toHaveAttribute("d", original!);
    await expect(page.locator(".react-flow__edge")).toHaveCount(edgeCount);
    await page.screenshot({
      path: `artifacts/interaction-edge-${panelOpen}.png`,
    });
    const report = await page.evaluate(() => {
      const state = (
        window as unknown as {
          interactionProbe: {
            running: boolean;
            samples: { mode: string; dom: number; nextFrame: number }[];
            inputs: Record<string, number>;
            frames: { mode: string; interval: number }[];
          };
        }
      ).interactionProbe;
      state.running = false;
      const p95 = (values: number[]) =>
        values.sort((a, b) => a - b)[Math.floor(values.length * 0.95)];
      return ["pan", "wheel", "zoom", "node", "edge"].map((mode) => {
        const samples = state.samples.filter((s) => s.mode === mode),
          frames = state.frames
            .filter((s) => s.mode === mode)
            .map((s) => s.interval);
        return {
          mode,
          inputs: state.inputs[mode],
          samples: samples.length,
          firstFeedback: samples[0]?.nextFrame,
          domP95: p95(samples.map((s) => s.dom)),
          nextFrameP95: p95(samples.map((s) => s.nextFrame)),
          maxFeedback: Math.max(...samples.map((s) => s.nextFrame)),
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
    for (const row of report) {
      expect(row.samples, row.mode).toBeGreaterThan(20);
      // 拖动最初几个像素属于既定的抓取阈值，其余输入必须产生反馈。
      expect(
        row.inputs - row.samples,
        `${row.mode} 未反馈输入`,
      ).toBeLessThanOrEqual(3);
      expect(
        row.nextFrameP95,
        `${row.mode} P95 可绘制反馈`,
      ).toBeLessThanOrEqual(30);
      expect(row.maxFeedback, `${row.mode} 最大可绘制反馈`).toBeLessThanOrEqual(
        30,
      );
    }
    expect(errors).toEqual([]);
  });
