// 全层实际 DOM 清单：fitView 使虚拟化模块全部挂载，颜色检查不依赖缩略图可读性。
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const output = resolve(process.argv[2] || "artifacts/all-layer-colors");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 4000, height: 3400 } });
const reports = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:4173/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  for (let layer = 1; layer <= 40; layer++)
    for (const phase of ["prefill", "decode"]) {
      await page
        .getByRole("button", { name: String(layer), exact: true })
        .click();
      await page
        .getByRole("button", {
          name:
            phase === "prefill" ? "Prefill · 整段矩阵" : "Decode · 单步一行",
          exact: true,
        })
        .click();
      await expect(page.locator(".architecture-flow")).toHaveAttribute(
        "data-render-layer",
        String(layer),
      );
      await expect(page.locator(".architecture-flow")).toHaveAttribute(
        "data-render-phase",
        phase,
      );
      await page.locator(".react-flow__controls-fitview").click();
      await expect(page.locator("[data-detail-suspended]")).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      const modules = await page
        .locator(".react-flow__node")
        .evaluateAll((nodes) =>
          nodes.map((root) => {
            const formulas = [];
            for (const f of root.querySelectorAll("[aria-label]")) {
              if (
                !f.querySelector(".katex") ||
                f.closest("[data-mhc-affine-legend]")
              )
                continue;
              let el = f;
              while (el && el !== root) {
                const s = getComputedStyle(el);
                if (
                  s.backgroundColor !== "rgba(0, 0, 0, 0)" &&
                  s.backgroundColor !== "transparent"
                ) {
                  formulas.push({
                    tex: f.getAttribute("aria-label"),
                    fill: s.backgroundColor,
                    tone:
                      el.closest("[data-tone]")?.getAttribute("data-tone") ||
                      null,
                  });
                  break;
                }
                el = el.parentElement;
              }
            }
            return {
              id: root.getAttribute("data-id"),
              formulas,
              errors: root.querySelectorAll(".katex-error").length,
            };
          }),
        );
      const report = {
        layer,
        phase,
        nodeCount: modules.length,
        formulaCount: modules.reduce((n, m) => n + m.formulas.length, 0),
        modules,
      };
      await writeFile(
        resolve(output, `L${layer}-${phase}.json`),
        JSON.stringify(report, null, 2),
      );
      reports.push({
        layer,
        phase,
        nodeCount: report.nodeCount,
        formulaCount: report.formulaCount,
      });
      await writeFile(
        resolve(output, "coverage.json"),
        JSON.stringify({ url: page.url(), reports, errors }, null, 2),
      );
      console.log(
        `L${layer} ${phase}: ${report.nodeCount} 节点 / ${report.formulaCount} 公式`,
      );
    }
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await browser.close();
}
