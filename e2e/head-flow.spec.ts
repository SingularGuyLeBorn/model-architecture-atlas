import { test, expect, type Locator } from "@playwright/test";

async function checkConnections(scope: Locator) {
  await expect
    .poll(() =>
      scope.evaluate((root) => {
        const errors: string[] = [];
        for (const group of root.querySelectorAll<SVGGElement>(
          "[data-object-link]",
        )) {
          const owner = group.closest(".object-connections")!;
          const [from, to] = group.dataset.objectLink!.split(":");
          const path = group.querySelector<SVGPathElement>("path")!;
          const matrix = path.getScreenCTM()!;
          const first = path.getPointAtLength(0).matrixTransform(matrix),
            last = path
              .getPointAtLength(path.getTotalLength())
              .matrixTransform(matrix);
          let cursor = { x: 0, y: 0 };
          const boxes = [
            ...root.querySelectorAll(
              "[data-expanded-tensor], .architecture-rope > .architecture-note [aria-label], .architecture-rope .architecture-caption > span",
            ),
          ].map((el) => el.getBoundingClientRect());
          for (const command of path
            .getAttribute("d")!
            .matchAll(/([MHV])\s*([-\d.]+)(?:\s+([-\d.]+))?/g)) {
            const next = {
              x: command[1] === "V" ? cursor.x : Number(command[2]),
              y:
                command[1] === "H"
                  ? cursor.y
                  : Number(command[command[1] === "M" ? 3 : 2]),
            };
            if (command[1] !== "M") {
              const a = new DOMPoint(cursor.x, cursor.y).matrixTransform(
                  matrix,
                ),
                b = new DOMPoint(next.x, next.y).matrixTransform(matrix);
              for (const r of boxes) {
                const contains = (p: DOMPoint) =>
                  p.x >= r.left - 1 &&
                  p.x <= r.right + 1 &&
                  p.y >= r.top - 1 &&
                  p.y <= r.bottom + 1;
                if (contains(first) || contains(last)) continue;
                const hit =
                  Math.abs(a.x - b.x) < 0.2
                    ? a.x > r.left + 1 &&
                      a.x < r.right - 1 &&
                      Math.max(a.y, b.y) > r.top + 1 &&
                      Math.min(a.y, b.y) < r.bottom - 1
                    : a.y > r.top + 1 &&
                      a.y < r.bottom - 1 &&
                      Math.max(a.x, b.x) > r.left + 1 &&
                      Math.min(a.x, b.x) < r.right - 1;
                if (hit) errors.push(`${from}:${to} 穿过其他张量框`);
              }
            }
            cursor = next;
          }
          for (const [id, at] of [
            [from, 0],
            [to, path.getTotalLength()],
          ] as const) {
            const el = owner.querySelector(`[data-trace-object="${id}"]`);
            if (!el) {
              errors.push(`缺失 ${id}`);
              continue;
            }
            const b = el.getBoundingClientRect();
            const p = path.getPointAtLength(at).matrixTransform(matrix);
            const distance = Math.min(
              Math.hypot(p.x - b.left, p.y - (b.top + b.height / 2)),
              Math.hypot(p.x - b.right, p.y - (b.top + b.height / 2)),
              Math.hypot(p.x - (b.left + b.width / 2), p.y - b.top),
              Math.hypot(p.x - (b.left + b.width / 2), p.y - b.bottom),
            );
            if (distance > 2)
              errors.push(`${from}:${to} 未接到变量框 ${distance}`);
          }
        }
        return errors;
      }),
    )
    .toEqual([]);
}

for (const [model, layer, stage] of [
  ["mimo25", 1, "rope"],
  ["mimo25", 2, "rope"],
  ["mimo25", 1, "weighted"],
  ["mimo25", 2, "weighted"],
  ["mimo25", 2, "attention"],
  ["qwen38", 4, "main-rope"],
  ...["v3", "r1", "v31", "v32"].map((model) => [model, 4, "values"] as const),
] as const)
  test(`${model} L${layer} ${stage} · Head 取行计算写回`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 3200, height: 2200 });
    await page.goto(`/#model=${model}&chapter=layer`);
    await page
      .getByRole("combobox", { name: "层", exact: true })
      .selectOption(String(layer));
    const rotary = stage.includes("rope");
    const index =
      stage === "main-rope"
        ? undefined
        : stage === "attention"
          ? 5
          : stage === "rope"
            ? 2
            : stage === "weighted"
              ? 6
              : model === "v32"
                ? undefined
                : 4;
    const buttons = page.locator(".stage-nav button");
    if (index !== undefined) await buttons.nth(index).click();
    else
      await buttons
        .filter({ hasText: stage === "main-rope" ? "主 Q/K" : "概率乘潜向量" })
        .click();
    const scope = page.locator(
      `[data-stage="${stage === "main-rope" ? "attention-main-rope" : stage}"]`,
    );
    for (const phase of ["Prefill · N 行", "Decode · 当前一行"]) {
      await page.getByRole("button", { name: phase, exact: true }).click();
      if (index !== undefined) await buttons.nth(index).click();
      else
        await buttons
          .filter({
            hasText: stage === "main-rope" ? "主 Q/K" : "概率乘潜向量",
          })
          .click();
      const panels = scope.locator("[data-head-branches]");
      await expect(panels).toHaveCount(rotary ? 2 : 1);
      for (const panel of await panels.all()) {
        await expect(panel.locator("[data-head-branch]")).toHaveCount(
          stage === "main-rope" &&
            (await panel.locator('[data-head-branch="24"]').count()) === 0
            ? 2
            : 3,
        );
        for (const branch of await panel.locator("[data-head-branch]").all()) {
          const h = await branch.getAttribute("data-head-branch");
          if (stage === "values") {
            const cells = (trace: string) =>
              branch
                .locator(`[data-trace-object="${trace}"] [data-vector-cell]`)
                .first();
            const paint = async (trace: string) =>
              cells(trace).evaluate((el) => {
                const style = getComputedStyle(el);
                return {
                  fill: style.backgroundColor,
                  border: style.borderColor,
                };
              });
            const produced = await paint("low-result");
            const consumed = await paint("low-project");
            const output = await paint(`o-output-${h}`);
            expect(produced).toEqual(consumed);
            expect(consumed.fill).not.toBe(output.fill);
            expect(consumed.border).not.toBe(output.border);
          }
          const kind = await panel.evaluate((el) =>
            el.closest("[data-rope-kind]")?.getAttribute("data-rope-kind"),
          );
          const stem = rotary
            ? kind!.toLowerCase()
            : stage === "attention"
              ? "a"
              : "o";
          const outputName = `${stem}_{${layer},${h},t}`;
          const outputPrefix = rotary
            ? "output"
            : stage === "attention"
              ? "a-output"
              : "o-output";
          await expect(
            branch.locator(
              `[data-trace-object="${outputPrefix}-${h}"] [aria-label="${outputName}"]`,
            ),
          ).toHaveCount(1);
          const rowPrefix = rotary
            ? "result"
            : stage === "attention"
              ? "a-result"
              : "o-result";
          const firstColumn = stage === "attention" ? "r" : "1";
          await expect(
            panel.locator(
              `[data-trace-object="${rowPrefix}-${h}"] [aria-label="${stem}_{${layer},${h},t,${firstColumn}}"]`,
            ),
          ).toHaveCount(1);
          await expect(
            panel.locator(
              `[data-object-link="${rotary ? "source" : stage === "attention" ? "q-source" : "a-source"}-${h}:${rotary ? "input" : stage === "attention" ? "q-input" : "a-input"}-${h}"]`,
            ),
          ).toHaveCount(1);
          await expect(
            panel.locator(
              `[data-object-link="${rotary ? "output" : stage === "attention" ? "a-output" : "o-output"}-${h}:${rotary ? "result" : stage === "attention" ? "a-result" : "o-result"}-${h}"]`,
            ),
          ).toHaveCount(1);
        }
      }
      if (rotary) {
        expect(await scope.locator('[aria-label^="w_"]').count()).toBe(0);
        await expect(scope.locator('[data-rope-kind="Q"]')).toHaveCount(1);
        await expect(scope.locator('[data-rope-kind="K"]')).toHaveCount(1);
      }
      await checkConnections(scope);
      await expect(scope.locator(".katex-error")).toHaveCount(0);
      const size = await scope.evaluate((el) => ({
        width: el.clientWidth,
        height: el.clientHeight,
      }));
      expect(
        await scope.evaluate((el) => el.scrollWidth - el.clientWidth),
        "模块横向溢出",
      ).toBeLessThanOrEqual(1);
      await page.setViewportSize({
        width: Math.max(3200, size.width + 600),
        height: Math.max(2200, size.height + 400),
      });
      if (index !== undefined) await buttons.nth(index).click();
      else
        await buttons
          .filter({
            hasText: stage === "main-rope" ? "主 Q/K" : "概率乘潜向量",
          })
          .click();
      await scope.screenshot({ path: info.outputPath(`${phase}-module.png`) });
      for (const [i, panel] of (await panels.all()).entries()) {
        await panel
          .locator("[data-head-branch]")
          .first()
          .screenshot({
            path: info.outputPath(`${phase}-panel${i}-head1.png`),
          });
      }
    }
  });
