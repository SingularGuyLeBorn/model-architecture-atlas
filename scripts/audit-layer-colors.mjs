// 从实际逐层入口逐个挂载模块，记录配色；相同公式异色仅作为待核对线索。
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const output = resolve(process.argv[2] || "artifacts/color-audit");
const layers = (
  process.argv[3] || Array.from({ length: 40 }, (_, i) => i + 1).join(",")
)
  .split(",")
  .map(Number);
const requestedModules = process.argv[4]?.split(",");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 4000, height: 3400 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const reports = [],
  samples = new Map();
try {
  await page.goto("http://127.0.0.1:4173/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of layers)
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
      const allIds = await focus
        .locator("option")
        .evaluateAll((es) => es.map((e) => e.value).filter(Boolean));
      const ids = requestedModules
        ? allIds.filter((id) => requestedModules.includes(id))
        : allIds;
      const modules = [];
      for (const id of ids) {
        await focus.selectOption(id);
        const node = page.locator(`.react-flow__node[data-id="${id}"]`);
        await expect(node).toBeVisible();
        await expect(
          node.locator("[data-detail-suspended],.katex-error"),
        ).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        const data = await node.evaluate((root) => {
          const formulas = [];
          // 包含投影等嵌套 React Flow 子节点，而非只读父框标题。
          const roots = [
            root,
            ...document.querySelectorAll(
              `.react-flow__node[data-id^="${root.getAttribute("data-id")}-"]`,
            ),
          ];
          for (const r of roots)
            for (const f of r.querySelectorAll("[aria-label]")) {
              if (
                !f.querySelector(".katex") ||
                f.closest("[data-mhc-affine-legend]")
              )
                continue;
              let el = f,
                fill = null,
                border = null;
              while (el && el !== r) {
                const s = getComputedStyle(el);
                if (
                  s.backgroundColor !== "rgba(0, 0, 0, 0)" &&
                  s.backgroundColor !== "transparent"
                ) {
                  fill = s.backgroundColor;
                  border = s.borderColor;
                  break;
                }
                el = el.parentElement;
              }
              if (fill)
                formulas.push({
                  tex: f.getAttribute("aria-label"),
                  fill,
                  border,
                  tone:
                    el?.closest("[data-tone]")?.getAttribute("data-tone") ||
                    null,
                });
            }
          return {
            formulas,
            errors: root.querySelectorAll(".katex-error").length,
          };
        });
        const normalized = data.formulas.map((f) => ({
          ...f,
          tex: f.tex
            .replaceAll(`_{${layer},`, "_{L,")
            .replaceAll(`_{${layer}}`, "_{L}")
            .replaceAll(`_${layer}`, "_L"),
        }));
        const hash = createHash("sha256")
          .update(JSON.stringify([id, phase, normalized]))
          .digest("hex");
        let screenshot = samples.get(hash);
        if (!screenshot) {
          let previous = "",
            stable = 0;
          await expect
            .poll(
              async () => {
                const next = JSON.stringify(await node.boundingBox());
                stable = next === previous ? stable + 1 : 0;
                previous = next;
                return stable;
              },
              { intervals: [100, 150, 200], timeout: 15000 },
            )
            .toBeGreaterThanOrEqual(2);
          await focus.selectOption(id);
          const rect = await node.boundingBox();
          if (
            rect &&
            rect.x >= 0 &&
            rect.y >= 0 &&
            rect.x + rect.width <= 4000 &&
            rect.y + rect.height <= 3400
          ) {
            screenshot = `L${String(layer).padStart(2, "0")}-${phase}-${id}.png`;
            await page.mouse.move(0, 0);
            await page.screenshot({
              path: resolve(output, screenshot),
              clip: rect,
              animations: "disabled",
            });
            samples.set(hash, screenshot);
          }
        }
        modules.push({
          id,
          ...data,
          signature: hash,
          screenshot: screenshot || null,
        });
      }
      const byTex = new Map();
      for (const m of modules)
        for (const f of m.formulas) {
          if (!byTex.has(f.tex)) byTex.set(f.tex, []);
          const a = byTex.get(f.tex);
          if (!a.some((x) => x.module === m.id && x.fill === f.fill))
            a.push({ module: m.id, fill: f.fill });
        }
      const candidates = [...byTex]
        .filter(([, a]) => new Set(a.map((x) => x.fill)).size > 1)
        .map(([tex, uses]) => ({ tex, uses }));
      const report = { layer, phase, modules, candidates };
      reports.push(report);
      await writeFile(
        resolve(output, `L${layer}-${phase}.json`),
        JSON.stringify(report, null, 2),
      );
      await writeFile(
        resolve(output, "summary.json"),
        JSON.stringify(
          {
            url: page.url(),
            reports: reports.map(({ layer, phase, modules, candidates }) => ({
              layer,
              phase,
              moduleCount: modules.length,
              formulaCount: modules.reduce((n, m) => n + m.formulas.length, 0),
              candidates,
              screenshots: modules.map((m) => ({
                id: m.id,
                file: m.screenshot,
              })),
            })),
            errors,
          },
          null,
          2,
        ),
      );
      console.log(
        `L${layer} ${phase}: ${modules.length} 模块，${candidates.length} 条异色线索，${samples.size} 个截图变体`,
      );
    }
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await browser.close();
}
