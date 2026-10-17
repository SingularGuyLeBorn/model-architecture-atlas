import { test, expect, type Locator } from "@playwright/test";
import { auditContentBounds } from "./helpers/content-bounds";

async function auditSelectionPaths(stage: Locator) {
  return stage.evaluate((root) =>
    [...root.querySelectorAll<SVGGElement>("[data-object-link]")].flatMap(
      (link) => {
        const [from, to] = link.dataset.objectLink!.split(":");
        const a = root.querySelector(`[data-trace-object="${from}"]`)!,
          b = root.querySelector(`[data-trace-object="${to}"]`)!;
        const path = link.querySelector<SVGPathElement>("path")!,
          length = path.getTotalLength(),
          matrix = path.getScreenCTM()!;
        const end = path.getPointAtLength(length).matrixTransform(matrix),
          box = b.getBoundingClientRect();
        const issues: string[] = [];
        if (
          end.x < box.left - 1 ||
          end.x > box.right + 1 ||
          end.y < box.top - 1 ||
          end.y > box.bottom + 1
        )
          issues.push(`${from}:${to} 落点错误`);
        for (const cell of root.querySelectorAll(
          ".scalar, .architecture-caption",
        )) {
          if (a.contains(cell) || b.contains(cell)) continue;
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
      },
    ),
  );
}

for (const phase of ["prefill", "decode"] as const)
  for (const layer of [4, 61])
    test(`DSA Layer ${layer} ${phase} · 两表同行与掩码几何`, async ({
      page,
    }, info) => {
      await page.goto("/#model=v32&chapter=layer");
      await page
        .getByRole("combobox", { name: "层", exact: true })
        .selectOption(String(layer));
      if (phase === "decode")
        await page
          .getByRole("button", { name: "Decode · 当前一行", exact: true })
          .click();
      for (const [id, title] of [
        ["index-select", "因果分数 →"],
        ["index-read", "同一选区对应"],
        ["attention", "MLA · 内容得分"],
      ]) {
        await page
          .getByRole("navigation", { name: "图中步骤" })
          .getByRole("button")
          .filter({ hasText: title })
          .click();
        const stage = page.locator(`[data-stage="${id}"]`);
        await expect
          .poll(async () => (await auditContentBounds(stage)).issues)
          .toEqual([]);
        await expect(stage.locator(".katex-error")).toHaveCount(0);
        await expect(stage.locator("[data-object-link]")).toHaveCount(
          id === "index-read" ? 8 : id === "index-select" ? 3 : 1,
        );
        await expect.poll(() => auditSelectionPaths(stage)).toEqual([]);
        await page.screenshot({ path: info.outputPath(`${id}-viewport.png`) });
        await page.setViewportSize({ width: 3000, height: 1800 });
        await page
          .getByRole("navigation", { name: "图中步骤" })
          .getByRole("button")
          .filter({ hasText: title })
          .click();
        await stage.screenshot({ path: info.outputPath(`${id}-full.png`) });
        if (id === "index-read") {
          // 注入落到相邻 token 的反例；即使仍在同一张缓存内，也必须拒绝。
          const path = stage
            .locator('[data-object-link="mask-0-j_a:cache-0-j_a"] > path')
            .first();
          const original = await path.getAttribute("d");
          const wrong = await stage
            .locator('[data-object-link="mask-0-j_b:cache-0-j_b"] > path')
            .first()
            .getAttribute("d");
          await path.evaluate((el, d) => el.setAttribute("d", d!), wrong);
          expect(
            (await auditSelectionPaths(stage)).some(
              (issue) => issue === "mask-0-j_a:cache-0-j_a 落点错误",
            ),
          ).toBe(true);
          await path.evaluate((el, d) => el.setAttribute("d", d!), original);
          await expect.poll(() => auditSelectionPaths(stage)).toEqual([]);
        }
        await page.setViewportSize({ width: 1600, height: 1000 });
      }
    });
