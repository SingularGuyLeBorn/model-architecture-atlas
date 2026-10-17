import { test, expect, type Locator } from "@playwright/test";
import { auditContentBounds } from "./helpers/content-bounds";

async function indexRoutes(stage: Locator) {
  return stage.evaluate((root) =>
    [
      ...root.querySelectorAll<SVGPathElement>(
        ".object-connections-lines [data-object-link] > path:first-child",
      ),
    ].flatMap((path) => {
      const link = path.parentElement!,
        scope = link.closest(".object-connections")!;
      const [from, to] = link.getAttribute("data-object-link")!.split(":");
      const a = scope.querySelector(`[data-trace-object="${from}"]`)!,
        b = scope.querySelector(`[data-trace-object="${to}"]`)!;
      const length = path.getTotalLength(),
        matrix = path.getScreenCTM()!,
        end = path.getPointAtLength(length).matrixTransform(matrix),
        box = b.getBoundingClientRect();
      const issues: string[] = [];
      if (
        end.x < box.left - 1 ||
        end.x > box.right + 1 ||
        end.y < box.top - 1 ||
        end.y > box.bottom + 1
      )
        issues.push(`${from}:${to} 落点错位`);
      for (const cell of scope.querySelectorAll(
        ".scalar,.data-box,.architecture-caption",
      )) {
        if (
          a.contains(cell) ||
          b.contains(cell) ||
          cell.contains(a) ||
          cell.contains(b)
        )
          continue;
        const r = cell.getBoundingClientRect();
        for (let d = 1; d < length; d += 2) {
          const p = path.getPointAtLength(d).matrixTransform(matrix);
          if (
            p.x > r.left + 1 &&
            p.x < r.right - 1 &&
            p.y > r.top + 1 &&
            p.y < r.bottom - 1
          ) {
            issues.push(`${from}:${to} 穿过 ${cell.textContent}`);
            break;
          }
        }
      }
      return issues;
    }),
  );
}

for (const phase of ["prefill", "decode"] as const)
  for (const layer of [4, 61])
    test(`DSA index Layer ${layer} ${phase} · 量化与双缓存实际连线`, async ({
      page,
    }, info) => {
      test.setTimeout(180000);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error" || /Couldn't create edge/.test(m.text()))
          errors.push(m.text());
      });
      await page.goto("/#model=v32&chapter=layer");
      await page
        .getByRole("combobox", { name: "层", exact: true })
        .selectOption(String(layer));
      if (phase === "decode")
        await page
          .getByRole("button", { name: "Decode · 当前一行", exact: true })
          .click();
      const titles = [
        ["index-query", "独立 Query 升维"],
        ["index-key", "每个 token 一条索引 Key"],
        ["index-rotate-q", "DSA Query · 半段配对 RoPE"],
        ["index-rotate-k", "DSA Key · 半段配对 RoPE"],
        ["index-quant", "每条 128 维行对应"],
        ["index-cache", "索引值与系数同号写入"],
        ["index-weights", "输入生成 Head 权重"],
        ["index", "FP8 点积"],
      ];
      for (const [id, title] of titles) {
        const button = page
          .getByRole("navigation", { name: "图中步骤" })
          .getByRole("button")
          .filter({ hasText: title });
        await button.click();
        const stage = page.locator(`[data-stage="${id}"]`);
        await expect(stage).toBeVisible();
        await page.setViewportSize({ width: 3600, height: 2100 });
        await button.click();
        await stage.screenshot({ path: info.outputPath(`${id}-full.png`) });
        await expect
          .poll(async () => (await auditContentBounds(stage)).issues)
          .toEqual([]);
        await expect.poll(() => indexRoutes(stage)).toEqual([]);
        if (id === "index-cache") {
          // 反例：仍落在数值缓存中，但把当前 t 行接到第一行；必须报错。
          const path = stage
            .locator('[data-object-link="new-0:row-0"] > path')
            .first();
          const original = await path.getAttribute("d");
          await path.evaluate((node) => {
            const p = node as SVGPathElement,
              scope = p.closest(".object-connections")!;
            const row = scope
              .querySelector(".tensor-row.picked")!
              .parentElement!.querySelector(".tensor-row")!;
            const r = row.getBoundingClientRect(),
              inv = p.getScreenCTM()!.inverse();
            const wrong = new DOMPoint(
                r.left,
                r.top + r.height / 2,
              ).matrixTransform(inv),
              start = p.getPointAtLength(0);
            p.setAttribute(
              "d",
              `M${start.x} ${start.y} H${wrong.x} V${wrong.y}`,
            );
          });
          expect(
            (await indexRoutes(stage)).some(
              (x) => x === "new-0:row-0 落点错位",
            ),
          ).toBe(true);
          await path.evaluate(
            (node, d) => node.setAttribute("d", d!),
            original,
          );
          await expect.poll(() => indexRoutes(stage)).toEqual([]);
        }
        await expect(stage.locator(".katex-error")).toHaveCount(0);
        for (const flow of await stage.locator(".object-connections").all())
          await expect(
            flow.locator(":scope > svg [data-object-link]"),
          ).toHaveCount(
            Number(await flow.getAttribute("data-object-link-count")),
          );
        await page.setViewportSize({ width: 1600, height: 1000 });
        await button.click();
        await expect
          .poll(async () => (await auditContentBounds(stage)).issues)
          .toEqual([]);
        await page.screenshot({ path: info.outputPath(`${id}-viewport.png`) });
      }
      expect(errors).toEqual([]);
    });
