import { test, expect } from "@playwright/test";
import { auditContentBounds } from "./helpers/content-bounds";
import { auditRmsGeometry } from "./helpers/rms-geometry";
import { auditSiluGeometry } from "./helpers/silu-geometry";

for (const [id, layer, phase, chapter = "layer"] of [
  ["v3", 1, "prefill"],
  ["r1", 4, "decode"],
  ["v31", 61, "prefill"],
  ["v32", 4, "decode"],
  ["mimo25", 1, "prefill"],
  ["mimo25", 2, "decode"],
  ["mimo25", 48, "decode"],
  ["qwen38", 1, "prefill", "gdn"],
  ["qwen38", 47, "decode", "gdn"],
  ["qwen38", 4, "prefill", "qsa"],
  ["qwen38", 48, "decode", "qsa"],
  ["qwen38", 1, "prefill", "layer"],
  ["qwen38", 1, "decode", "layer"],
  ["qwen38", 48, "prefill", "layer"],
  ["qwen38", 48, "decode", "layer"],
  ["qwen38", 2, "prefill", "ple"],
  ["qwen38", 2, "decode", "layer"],
] as const) {
  test(`${id} ${chapter} Layer ${layer} ${phase} · 内容边界、端口与截图`, async ({
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
    await page.goto(`/#model=${id}&chapter=${chapter}`);
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
        await expect.poll(() => auditRmsGeometry(stage)).toEqual([]);
        await expect.poll(() => auditSiluGeometry(stage)).toEqual([]);
        if ((await stage.getAttribute("data-stage")) === "ple-lookup") {
          const crossings = await stage
            .locator(".object-connections > svg > g > path:first-child")
            .evaluateAll((paths) => {
              const segments = paths.flatMap((path, index) => {
                let x = 0,
                  y = 0;
                return (
                  path.getAttribute("d")!.match(/[MHV][^MHV]+/g) ?? []
                ).flatMap((command) => {
                  const values = command
                    .slice(1)
                    .trim()
                    .split(/\s+/)
                    .map(Number);
                  const nx = command[0] === "V" ? x : values[0],
                    ny = command[0] === "H" ? y : values.at(-1)!;
                  const result =
                    command[0] === "M" ? [] : [{ index, x, y, nx, ny }];
                  x = nx;
                  y = ny;
                  return result;
                });
              });
              return segments.flatMap((a, i) =>
                segments.slice(i + 1).flatMap((b) => {
                  if (a.index === b.index || (a.x === a.nx) === (b.x === b.nx))
                    return [];
                  const v = a.x === a.nx ? a : b,
                    h = a.x === a.nx ? b : a;
                  return v.x > Math.min(h.x, h.nx) + 0.5 &&
                    v.x < Math.max(h.x, h.nx) - 0.5 &&
                    h.y > Math.min(v.y, v.ny) + 0.5 &&
                    h.y < Math.max(v.y, v.ny) - 0.5
                    ? [[a.index, b.index]]
                    : [];
                }),
              );
            });
          expect(
            crossings,
            "PLE 地址、原行和读出结果的逐行通道不能交叉",
          ).toEqual([]);
        }
        const audit = await auditContentBounds(stage);
        expect(
          audit.issues,
          `${id}/${layer}: ${await stage.getAttribute("data-stage")}`,
        ).toEqual([]);
        for (const flow of await stage.locator(".object-connections").all()) {
          await expect(
            flow.locator(
              ":scope > .object-connections-lines [data-object-link]",
            ),
          ).toHaveCount(
            Number(await flow.getAttribute("data-object-link-count")),
          );
          const endpoints = await flow.evaluate((root) => {
            const bounds = root.getBoundingClientRect();
            const scale = bounds.width / (root as HTMLElement).offsetWidth;
            return [
              ...root.querySelectorAll(
                ":scope > .object-connections-lines [data-object-link]",
              ),
            ].flatMap((link) => {
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
              const direction = link.getAttribute("data-direction");
              if (direction === "join-left" || direction === "join-right")
                return [
                  Math.abs(
                    start.x - (a.left + a.width / 2 - bounds.left) / scale,
                  ),
                  Math.abs(start.y - (a.bottom - bounds.top) / scale),
                  Math.abs(
                    end.x -
                      ((direction === "join-left" ? b.left : b.right) -
                        bounds.left) /
                        scale,
                  ),
                  Math.abs(end.y - (b.top + b.height / 2 - bounds.top) / scale),
                ];
              if (direction === "down-left")
                return [
                  Math.abs(
                    start.x - (a.left + a.width / 2 - bounds.left) / scale,
                  ),
                  Math.abs(start.y - (a.bottom - bounds.top) / scale),
                  Math.abs(end.x - (b.right - bounds.left) / scale),
                  Math.abs(end.y - (b.top + b.height / 2 - bounds.top) / scale),
                ];
              if (direction === "right")
                return [
                  Math.abs(start.x - (a.right - bounds.left) / scale),
                  Math.abs(
                    start.y - (a.top + a.height / 2 - bounds.top) / scale,
                  ),
                  Math.abs(end.x - (b.left - bounds.left) / scale),
                  Math.abs(end.y - (b.top + b.height / 2 - bounds.top) / scale),
                ];
              return [
                Math.abs(
                  start.x - (a.left + a.width / 2 - bounds.left) / scale,
                ),
                Math.abs(start.y - (a.bottom - bounds.top) / scale),
                Math.abs(end.x - (b.left + b.width / 2 - bounds.left) / scale),
                Math.abs(end.y - (b.top - bounds.top) / scale),
              ];
            });
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
    const modules = await page.locator("[data-stage]").evaluateAll((nodes) =>
      nodes
        .map((node) => ({
          id: node.getAttribute("data-stage")!,
          ordinal: Number(
            node.querySelector(".stage-title > span")!.textContent,
          ),
          width: (node as HTMLElement).offsetWidth,
          height: (node as HTMLElement).offsetHeight,
        }))
        .sort((a, b) => a.ordinal - b.ordinal),
    );
    for (let i = 0; i < total; i++) {
      const size = modules[i];
      const stage = page.locator(`[data-stage="${size.id}"]`);
      // 完整模块按实际尺寸提供视口；正常宽度的交互检查已在上方完成。
      await page.setViewportSize({
        width: Math.max(2400, size.width + 700),
        height: Math.max(1800, size.height + 700),
      });
      await buttons.nth(i).click();
      const bounds = await stage.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height,
      );
      await stage.screenshot({ path: info.outputPath(`module-${i + 1}.png`) });
    }
    expect(errors).toEqual([]);
  });
}
