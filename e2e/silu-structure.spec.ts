import { test, expect } from "@playwright/test";
import { auditSiluGeometry } from "./helpers/silu-geometry";

for (const [model, chapter, layer, title, id] of [
  ["v3", "layer", "1", "Dense SwiGLU", "dense"],
  ["mimo25", "layer", "1", "Dense SwiGLU", "dense"],
  ["qwen38", "layer", "1", "低秩 320 维", "attn-gr-read-gates"],
  ["qwen38", "gdn", "1", "四个相邻位置", "conv"],
  ["qwen38", "ple", "2", "深度卷积 · 每路每维", "ple-conv"],
] as const) {
  test(`${model}/${chapter}/${id} SiLU · 分支、穿框反例和局部截图`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 4600, height: 2600 });
    await page.goto(`/#model=${model}&chapter=${chapter}`);
    await page
      .getByRole("combobox", { name: "层", exact: true })
      .selectOption(layer);
    await page
      .getByRole("navigation", { name: "图中步骤" })
      .getByRole("button")
      .filter({ hasText: title })
      .first()
      .click();
    const stage = page.locator(`[data-stage="${id}"]`);
    await expect.poll(() => auditSiluGeometry(stage)).toEqual([]);
    const silu = stage.locator("[data-silu-row]").first();
    await expect(silu.locator("[data-object-link]")).toHaveCount(6);
    await silu.screenshot({ path: info.outputPath("silu-detail.png") });
    await stage.screenshot({ path: info.outputPath("silu-stage.png") });
    // 保留首尾合法连接，只改中段穿过 sigmoid，防止端点通过掩盖路径错误。
    const original = await silu.evaluate((root) => {
      const path = root.querySelector<SVGPathElement>(
        '[data-object-link="silu-identity:silu-multiply"] > path',
      )!;
      const d = path.getAttribute("d")!;
      const start = path.getPointAtLength(0),
        end = path.getPointAtLength(path.getTotalLength());
      const box = root
        .querySelector('[data-trace-object="silu-sigmoid"]')!
        .getBoundingClientRect();
      const middle = new DOMPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      ).matrixTransform(path.getScreenCTM()!.inverse());
      path.setAttribute(
        "d",
        `M${start.x} ${start.y} V${middle.y} H${middle.x} V${end.y} H${end.x}`,
      );
      return d;
    });
    expect(
      (await auditSiluGeometry(stage)).some((issue) =>
        issue.startsWith("silu-identity→silu-multiply 穿过"),
      ),
    ).toBe(true);
    await silu
      .locator('[data-object-link="silu-identity:silu-multiply"] > path')
      .first()
      .evaluate((path, d) => path.setAttribute("d", d), original);
    await expect.poll(() => auditSiluGeometry(stage)).toEqual([]);
    const outputPath = silu
      .locator('[data-object-link="silu-multiply:silu-element"] > path')
      .first();
    const outputD = await outputPath.getAttribute("d");
    const inputD = await silu
      .locator('[data-object-link="silu-sigmoid:silu-multiply"] > path')
      .first()
      .getAttribute("d");
    await outputPath.evaluate((path, d) => path.setAttribute("d", d!), inputD);
    expect(
      (await auditSiluGeometry(stage)).some((issue) =>
        issue.includes("错误共线"),
      ),
    ).toBe(true);
    await outputPath.evaluate((path, d) => path.setAttribute("d", d!), outputD);
    await expect.poll(() => auditSiluGeometry(stage)).toEqual([]);
  });
}
