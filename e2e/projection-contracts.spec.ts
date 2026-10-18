import { expect, test } from "@playwright/test";
import {
  inspectProjectionContracts,
  inspectIdentityContinuity,
} from "./helpers/projection-contracts";

for (const model of ["v3", "r1", "v31", "v32", "mimo25", "qwen38"]) {
  test(`${model} 逐层投影的真实形状、代表项和输入输出身份色`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 2400, height: 1600 });
    await page.goto(`/#model=${model}&chapter=layer`);
    await page
      .getByRole("combobox", { name: "层", exact: true })
      .selectOption("4");
    const evidence: object[] = [];
    for (const phase of ["Prefill · N 行", "Decode · 当前一行"]) {
      await page.getByRole("button", { name: phase, exact: true }).click();
      const navigation = page.locator(".stage-nav button");
      let total = 0;
      const identity: {
        variable: string;
        fill: string;
        stage: string | null;
      }[] = [];
      for (let i = 0; i < (await navigation.count()); i++) {
        await navigation.nth(i).click();
        const stage = page.locator(".stage-card").filter({
          has: page.locator(".stage-title > span", {
            hasText: String(i + 1).padStart(2, "0"),
          }),
        });
        const stageId = await stage.getAttribute("data-stage");
        await expect(stage.locator("[data-detail-suspended]")).toHaveCount(0);
        const result = await stage.evaluate(inspectProjectionContracts);
        evidence.push({ model, phase, stageId, ...result });
        identity.push(
          ...result.identities.map((object) => ({ ...object, stage: stageId })),
        );
        total += result.checked;
        if (
          phase.startsWith("Decode") &&
          ["v3", "mimo25", "qwen38"].includes(model) &&
          /query$|residual-a$|qkv$|qz-split$/.test(stageId ?? "")
        ) {
          const size = await stage.evaluate((el) => ({
            width: (el as HTMLElement).offsetWidth,
            height: (el as HTMLElement).offsetHeight,
          }));
          await page.setViewportSize({
            width: Math.max(2400, size.width + 600),
            height: Math.max(1600, size.height + 400),
          });
          await navigation.nth(i).click();
          await stage.screenshot({
            path: info.outputPath(`${stageId}-module.png`),
          });
          if (await stage.locator("[data-linear-projection]").count())
            await stage
              .locator("[data-linear-projection]")
              .first()
              .screenshot({
                path: info.outputPath(`${stageId}-projection.png`),
              });
          await page.setViewportSize({ width: 2400, height: 1600 });
        }
      }
      expect(total, "不能用未挂载、零投影冒充检查通过").toBeGreaterThan(0);
      evidence.push({
        model,
        phase,
        issues: inspectIdentityContinuity(identity),
      });
    }
    await info.attach("projection-contracts.json", {
      body: JSON.stringify(evidence, null, 2),
      contentType: "application/json",
    });
    expect(
      evidence.flatMap((item) => (item as { issues: unknown[] }).issues),
    ).toEqual([]);
  });
}

test("故障注入：错误维度、单列冒充矩阵、缺代表项和同色投影均被检出", async ({
  page,
}, info) => {
  await page.goto("/#model=v3&chapter=layer");
  await page.locator(".stage-nav button").nth(1).click();
  const equation = page.locator("[data-linear-projection]").first();
  await expect(equation).toBeVisible();
  const original = await equation.innerHTML();
  const cases: [string, string][] = [
    ["wrong-shape", "projection-dimensions"],
    ["one-column", "projection-dimensions"],
    ["missing-item", "projection-representatives"],
    ["same-color", "projection-colors"],
  ];
  const mutations: object[] = [];
  for (const [kind, expected] of cases) {
    await equation.evaluate(
      (el, { original, kind }) => {
        el.innerHTML = original;
        const tensors = el.querySelectorAll("[data-expanded-tensor]");
        if (kind === "wrong-shape" || kind === "one-column") {
          tensors[1]
            .querySelector("header small [aria-label]")!
            .setAttribute(
              "aria-label",
              kind === "one-column" ? "7168\\times1" : "7\\times13",
            );
        } else if (kind === "missing-item") {
          tensors[0].querySelectorAll("[data-vector-cell]")[1].remove();
        } else {
          const color = getComputedStyle(
            tensors[0].querySelector("[data-vector-cell]")!,
          ).backgroundColor;
          (
            tensors[2].querySelector("[data-vector-cell]") as HTMLElement
          ).style.backgroundColor = color;
        }
      },
      { original, kind },
    );
    // evaluate 的根节点也包含目标投影；正常扫描与注入使用同一个检查函数。
    const report = await equation
      .locator("..")
      .evaluate(inspectProjectionContracts);
    mutations.push({ kind, report });
    expect(
      report.issues.some((issue) => issue.rule === expected),
      kind,
    ).toBe(true);
  }
  await equation.evaluate((el, html) => {
    el.innerHTML = html;
  }, original);
  await info.attach("mutations.json", {
    body: JSON.stringify(mutations, null, 2),
    contentType: "application/json",
  });
});
