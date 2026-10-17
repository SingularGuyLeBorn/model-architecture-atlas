import { test, expect } from "@playwright/test";
import { auditRmsGeometry } from "./helpers/rms-geometry";

for (const [model, step] of [
  ["v3", 0],
  ["mimo25", 0],
  ["qwen38", 2],
] as const)
  test(`${model} RMS · 实际端点、穿框反例与局部截图`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 4000, height: 2100 });
    await page.goto(`/#model=${model}&chapter=layer`);
    await page
      .getByRole("combobox", { name: "层", exact: true })
      .selectOption("1");
    await page
      .getByRole("navigation", { name: "图中步骤" })
      .getByRole("button")
      .nth(step)
      .click();
    const stage = page.locator(
      `[data-stage="${model === "qwen38" ? "attn-gr-norm" : "input"}"]`,
    );
    await expect.poll(() => auditRmsGeometry(stage)).toEqual([]);
    const rms = stage.locator(".architecture-rms").first();
    await expect(rms).toBeVisible();
    await rms.screenshot({ path: info.outputPath("rms-detail.png") });
    // 注入已知穿框反例，证明检查器确实能拒绝它；随后恢复原路径。
    const original = await rms.evaluate((root) => {
      const path = root.querySelector<SVGPathElement>(
        '[data-object-link="rms-root:rms-denominator"] > path',
      )!;
      const d = path.getAttribute("d")!;
      const box = root
        .querySelector(".architecture-fraction [data-expanded-tensor]")!
        .getBoundingClientRect();
      const matrix = path.getScreenCTM()!.inverse();
      const a = new DOMPoint(
        box.left - 10,
        box.top + box.height / 2,
      ).matrixTransform(matrix);
      const b = new DOMPoint(
        box.right + 10,
        box.top + box.height / 2,
      ).matrixTransform(matrix);
      path.setAttribute("d", `M${a.x} ${a.y} H${b.x}`);
      return d;
    });
    expect(
      (await auditRmsGeometry(stage)).some((issue) =>
        issue.startsWith("分母线穿过"),
      ),
    ).toBe(true);
    await rms
      .locator('[data-object-link="rms-root:rms-denominator"] > path')
      .first()
      .evaluate((path, d) => path.setAttribute("d", d), original);
    await expect.poll(() => auditRmsGeometry(stage)).toEqual([]);
  });
