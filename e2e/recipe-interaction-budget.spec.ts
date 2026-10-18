import { test, expect } from "@playwright/test";

test.use({ trace: "off" });
for (const model of ["mimo25", "qwen38"]) {
  test(`${model} 完整逐层图连续平移缩放拖框反馈`, async ({ page }, info) => {
    await page.setViewportSize({ width: 2200, height: 1500 });
    await page.goto(`/#model=${model}&chapter=layer`);
    await page.getByRole("button", { name: "全图", exact: true }).click();
    await expect(page.locator(".react-flow__edge-path").first()).toBeAttached();
    await page.evaluate(() => {
      const state = {
        mode: "",
        inputs: 0,
        samples: [] as number[],
        observer: null as MutationObserver | null,
        target: "",
      };
      (window as unknown as { feedback: typeof state }).feedback = state;
      const record = () => {
        if (!state.mode) return;
        state.observer?.disconnect();
        const target = document.querySelector(state.target)!;
        const before = target.getAttribute("style"),
          started = performance.now();
        state.inputs++;
        state.observer = new MutationObserver(() => {
          if (before === target.getAttribute("style")) return;
          state.observer!.disconnect();
          requestAnimationFrame(() =>
            state.samples.push(performance.now() - started),
          );
        });
        state.observer.observe(target, {
          attributes: true,
          attributeFilter: ["style"],
        });
      };
      window.addEventListener(
        "pointermove",
        (e) => {
          if (e.buttons & 1) record();
        },
        true,
      );
      window.addEventListener("wheel", record, {
        capture: true,
        passive: true,
      });
    });
    const reports: object[] = [];
    for (const mode of ["pan", "wheel", "zoom", "node"]) {
      if (mode === "node")
        await page.locator(".stage-nav button").first().click();
      const point =
        mode === "node"
          ? await page
              .locator(".stage-title")
              .first()
              .boundingBox()
              .then((r) => ({ x: r!.x + 100, y: r!.y + r!.height / 2 }))
          : await page.evaluate(() => {
              const r = document
                .querySelector(".react-flow__pane")!
                .getBoundingClientRect();
              for (let y = r.top + 90; y < r.bottom - 90; y += 20)
                for (let x = r.left + 30; x < r.right - 90; x += 20)
                  if (
                    document
                      .elementFromPoint(x, y)
                      ?.classList.contains("react-flow__pane")
                  )
                    return { x, y };
              throw new Error("没有空白平移区域");
            });
      await page.evaluate((mode) => {
        const state = (
          window as unknown as {
            feedback: {
              mode: string;
              inputs: number;
              samples: number[];
              target: string;
            };
          }
        ).feedback;
        Object.assign(state, {
          mode,
          inputs: 0,
          samples: [],
          target:
            mode === "node"
              ? '.react-flow__node[data-id="input"]'
              : ".react-flow__viewport",
        });
      }, mode);
      await page.mouse.move(point.x, point.y);
      if (mode === "pan" || mode === "node") {
        await page.mouse.down();
        for (let i = 1; i <= 40; i++)
          await page.mouse.move(point.x + i * 2, point.y + i / 2);
        await page.mouse.up();
      } else {
        if (mode === "zoom") await page.keyboard.down("Control");
        for (let i = 0; i < 30; i++) await page.mouse.wheel(0, i % 2 ? -8 : 8);
        if (mode === "zoom") await page.keyboard.up("Control");
      }
      const report = await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        const state = (
          window as unknown as {
            feedback: {
              mode: string;
              inputs: number;
              samples: number[];
              observer: MutationObserver | null;
            };
          }
        ).feedback;
        state.observer?.disconnect();
        const samples = [...state.samples].sort((a, b) => a - b);
        const report = {
          mode: state.mode,
          inputs: state.inputs,
          samples: samples.length,
          first: state.samples[0],
          p95: samples[Math.floor(samples.length * 0.95)],
          max: Math.max(...samples),
        };
        state.mode = "";
        return report;
      });
      reports.push(report);
      console.log(model, report);
      expect(report.samples, mode).toBeGreaterThan(20);
      expect(report.inputs - report.samples, mode).toBeLessThanOrEqual(3);
      expect(report.max, mode).toBeLessThanOrEqual(30);
    }
    await info.attach("feedback.json", {
      body: JSON.stringify(reports),
      contentType: "application/json",
    });
    await page.screenshot({ path: info.outputPath("interaction.png") });
  });
}
