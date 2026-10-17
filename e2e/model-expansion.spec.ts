import { test, expect } from "@playwright/test";
import { auditContentBounds } from "./helpers/content-bounds";

for (const [id, layer, phase] of [
  ["v3", 1, "prefill"],
  ["r1", 4, "decode"],
  ["v31", 61, "prefill"],
  ["v32", 4, "decode"],
] as const) {
  test(`${id} Layer ${layer} ${phase} · 内容边界、端口与截图`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" ||
        /Couldn't create edge|Handle: No node/.test(message.text())
      )
        errors.push(message.text());
    });
    await page.goto(`/#model=${id}&chapter=layer`);
    await page
      .getByRole("combobox", { name: "层", exact: true })
      .selectOption(String(layer));
    if (phase === "decode")
      await page
        .getByRole("button", { name: "Decode · 当前一行", exact: true })
        .click();
    await expect(page.locator("[data-stage=input]")).toBeVisible();
    const navigation = page.getByRole("navigation", { name: "图中步骤" });
    const buttons = navigation.getByRole("button");
    const total = await buttons.count();
    for (let i = 0; i < total; i++) {
      await buttons.nth(i).click();
      await expect(page.locator(".katex-error")).toHaveCount(0);
      const stages = page.locator("[data-stage]");
      for (const stage of await stages.all()) {
        const audit = await auditContentBounds(stage);
        expect(
          audit.issues,
          `${id}/${layer}: ${await stage.getAttribute("data-stage")}`,
        ).toEqual([]);
        for (const flow of await stage.locator(".object-connections").all()) {
          await expect(flow.locator("[data-object-link]")).toHaveCount(5);
          const endpoints = await flow.evaluate((root) => {
            const bounds = root.getBoundingClientRect();
            const scale = bounds.width / (root as HTMLElement).offsetWidth;
            return [...root.querySelectorAll("[data-object-link]")].flatMap(
              (link) => {
                const [from, to] = link
                  .getAttribute("data-object-link")!
                  .split(":");
                const path = link.querySelector("path")!;
                const start = path.getPointAtLength(0),
                  end = path.getPointAtLength(path.getTotalLength());
                const a = root
                  .querySelector(`[data-trace-object="${from}"]`)!
                  .getBoundingClientRect();
                const b = root
                  .querySelector(`[data-trace-object="${to}"]`)!
                  .getBoundingClientRect();
                return [
                  Math.abs(
                    start.x - (a.left + a.width / 2 - bounds.left) / scale,
                  ),
                  Math.abs(start.y - (a.bottom - bounds.top) / scale),
                  Math.abs(
                    end.x - (b.left + b.width / 2 - bounds.left) / scale,
                  ),
                  Math.abs(end.y - (b.top - bounds.top) / scale),
                ];
              },
            );
          });
          expect(Math.max(...endpoints)).toBeLessThan(1);
        }
      }
      await page.screenshot({ path: info.outputPath(`step-${i + 1}.png`) });
    }
    await page.getByRole("button", { name: "全图", exact: true }).click();
    await expect(page.locator("[data-stage]")).toHaveCount(total);
    const handles = await page
      .locator(".recipe-object-port .react-flow__handle")
      .count();
    const edges = await page.locator(".react-flow__edge").count();
    expect(handles).toBe(edges * 2);
    await page.screenshot({ path: info.outputPath("whole-layer.png") });
    // 正常宽度检查之后，另存完整模块，避免只看被画布视口截断的局部。
    await page.setViewportSize({ width: 2400, height: 1800 });
    for (let i = 0; i < total; i++) {
      await buttons.nth(i).click();
      await page.screenshot({ path: info.outputPath(`module-${i + 1}.png`) });
    }
    expect(errors).toEqual([]);
  });
}
