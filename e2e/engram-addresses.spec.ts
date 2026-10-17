import { expect, test } from "@playwright/test";

test("24 个地址接入双表：同号双分支、真实行端点、无穿字穿框", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?revision=engram-addresses#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  for (const [layer, phase, width] of [
    [2, "Prefill", 2200],
    [2, "Decode", 900],
    [15, "Prefill", 900],
    [15, "Decode", 2200],
  ] as const) {
    await page.setViewportSize({ width, height: 2200 });
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: phase === "Decode" ? "Decode · 单步一行" : "Prefill · 整段矩阵",
        exact: true,
      })
      .click();
    await page
      .getByRole("combobox", { name: "定位模块" })
      .selectOption("engram-lookup");
    const flow = page.locator("[data-engram-address-flow]");
    await expect(flow.locator("[data-engram-address-link]")).toHaveCount(33);
    const failures = await flow.evaluate((root) => {
      const failures: string[] = [];
      for (const path of root.querySelectorAll<SVGPathElement>(
        "[data-engram-address-link]",
      )) {
        const source = root.querySelector(path.dataset.source!)!,
          target = root.querySelector(path.dataset.target!)!;
        const matrix = path.getScreenCTM()!,
          scale = Math.hypot(matrix.a, matrix.b);
        const start = path.getPointAtLength(0).matrixTransform(matrix),
          end = path
            .getPointAtLength(path.getTotalLength())
            .matrixTransform(matrix);
        const gap = (p: DOMPoint, el: Element) => {
          const r = el.getBoundingClientRect();
          return (
            Math.min(
              Math.hypot(
                p.x - Math.max(r.left, Math.min(p.x, r.right)),
                p.y - r.top,
              ),
              Math.hypot(
                p.x - Math.max(r.left, Math.min(p.x, r.right)),
                p.y - r.bottom,
              ),
              Math.hypot(
                p.x - r.left,
                p.y - Math.max(r.top, Math.min(p.y, r.bottom)),
              ),
              Math.hypot(
                p.x - r.right,
                p.y - Math.max(r.top, Math.min(p.y, r.bottom)),
              ),
            ) / scale
          );
        };
        if (gap(start, source) > 1 || gap(end, target) > 1)
          failures.push(
            `断线 ${path.dataset.source} → ${path.dataset.target}: ${gap(start, source)}/${gap(end, target)}`,
          );
        if (path.dataset.engramAddressLink === "select") {
          const index = (source as HTMLElement).dataset.engramIndex!;
          if (
            !target
              .parentElement!.getAttribute("data-engram-row")!
              .endsWith(index)
          )
            failures.push(`错行 ${index}`);
        }
        if (
          path.dataset.engramAddressLink === "read" &&
          !path.dataset.source!.includes("b_{4,8}")
        )
          failures.push("读出未从具体同号行起线");
        if (path.dataset.engramAddressLink === "scale") {
          const sourceTex = source
            .querySelector("[aria-label]")!
            .getAttribute("aria-label");
          const targetTex = target
            .querySelector("[aria-label]")!
            .getAttribute("aria-label");
          if (sourceTex !== targetTex)
            failures.push(`系数错配 ${sourceTex} → ${targetTex}`);
        }
        const obstacles = [
          ...root.querySelectorAll(
            "[data-vector-cell], [data-engram-index], [data-engram-address-vector], [data-hash-port], strong, small, [data-engram-dequantization] > [aria-label]",
          ),
        ].filter(
          (el) =>
            el !== source &&
            el !== target &&
            !source.contains(el) &&
            !target.contains(el) &&
            !el.contains(source) &&
            !el.contains(target),
        );
        for (let d = 3; d < path.getTotalLength() - 3; d += 3) {
          const p = path.getPointAtLength(d).matrixTransform(matrix);
          const hit = obstacles.find((el) => {
            const r = el.getBoundingClientRect();
            return (
              p.x > r.left + scale &&
              p.x < r.right - scale &&
              p.y > r.top + scale &&
              p.y < r.bottom - scale
            );
          });
          if (hit) {
            failures.push(
              `穿框/字 ${path.dataset.source} → ${path.dataset.target}: ${hit.outerHTML.slice(0, 180)}`,
            );
            break;
          }
        }
      }
      for (const el of root.querySelectorAll<HTMLElement>("div"))
        if (el.clientWidth && el.scrollWidth > el.clientWidth + 2)
          failures.push(`溢出 ${el.outerHTML.slice(0, 150)}`);
      return failures;
    });
    expect(failures).toEqual([]);
    await expect(flow.locator("[data-engram-address-link=concat]")).toHaveCount(
      3,
    );
    await expect(flow.locator("[data-engram-address-link=select]")).toHaveCount(
      18,
    );
    for (const kind of ["split", "scale", "assemble"])
      await expect(
        flow.locator(`[data-engram-address-link=${kind}]`),
      ).toHaveCount(3);
    await expect(flow.locator(".katex-error")).toHaveCount(0);
    // 宽截图保留可读文字；几何已在上面的宽/窄实际画布逐一验收。
    await page.setViewportSize({ width: 4000, height: 3400 });
    await page
      .getByRole("combobox", { name: "定位模块" })
      .selectOption("engram-lookup");
    await expect
      .poll(async () => {
        const r = await flow.boundingBox();
        return (
          !!r &&
          r.x >= 0 &&
          r.y >= 0 &&
          r.x + r.width <= 4000 &&
          r.y + r.height <= 3400
        );
      })
      .toBe(true);
    await flow.screenshot({
      path: `artifacts/engram-addresses-${layer}-${phase}.png`,
    });
    await flow.locator("[data-engram-dequantization]").screenshot({
      path: `artifacts/engram-dequantization-${layer}-${phase}.png`,
    });
  }
  expect(errors).toEqual([]);
});
