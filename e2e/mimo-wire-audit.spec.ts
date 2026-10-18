import { test, expect, type Page } from "@playwright/test";
test.use({ screenshot: "only-on-failure" });

for (const first of [1, 13, 25, 37])
  test(`MiMo ${first}–${first + 11} 层 · 两种模式完整路网`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 2800, height: 2000 });
    await page.goto("/#model=mimo25&chapter=layer");
    const reports = [];
    for (let layer = first; layer < first + 12; layer++) {
      await page
        .getByRole("combobox", { name: "层", exact: true })
        .selectOption(String(layer));
      for (const phase of ["Prefill · N 行", "Decode · 当前一行"]) {
        await page.getByRole("button", { name: phase, exact: true }).click();
        await page.getByRole("button", { name: "全图", exact: true }).click();
        await expect(page.locator("[data-stage]")).toHaveCount(
          layer === 1 ? 11 : 12,
        );
        await expect(page.locator(".react-flow__edge-path")).toHaveCount(
          layer === 1 ? 16 : 19,
        );
        await expect
          .poll(async () => (await auditWires(page)).problems, {
            message: `${layer} / ${phase}`,
          })
          .toEqual([]);
        reports.push({ layer, phase, ...(await auditWires(page)) });
      }
    }
    await info.attach("all-layer-routes", {
      body: JSON.stringify(reports),
      contentType: "application/json",
    });
  });

/** 读取实际 SVG 子路径；M 是标签断口，不能补成假线再检查穿字。 */
async function auditWires(page: Page, residualOnly = false) {
  return page.evaluate((residualOnly) => {
    type Point = { x: number; y: number };
    type Segment = { a: Point; b: Point };
    const problems: string[] = [];
    const boxes = [
      ...document.querySelectorAll(
        "[data-stage], [data-stage] [data-expanded-tensor], [data-stage] .data-box, [data-stage] .architecture-note [aria-label], [data-stage] .architecture-caption",
      ),
    ].map((el) => ({
      rect: el.getBoundingClientRect(),
      name:
        el.getAttribute("data-stage") ??
        el.querySelector("[aria-label]")?.getAttribute("aria-label"),
    }));
    for (const note of document.querySelectorAll(
      "[data-stage] .architecture-note",
    )) {
      const walker = document.createTreeWalker(note, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (
          !text.textContent?.trim() ||
          text.parentElement?.closest("[aria-label]")
        )
          continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        for (const rect of range.getClientRects())
          boxes.push({ rect, name: text.textContent.trim() });
      }
    }
    const records = [...document.querySelectorAll(".react-flow__edge")]
      .filter(
        (edge) =>
          !residualOnly ||
          /^(input-residual-a|residual-a-residual-f)-/.test(
            edge.getAttribute("data-id") ?? "",
          ),
      )
      .map((edge) => {
        const path = edge.querySelector(
          ".react-flow__edge-path",
        ) as SVGPathElement;
        const d = path.getAttribute("d")!;
        const points: Point[] = [];
        const segments: Segment[] = [];
        let last: Point | undefined;
        for (const match of d.matchAll(
          /([ML])\s*([-\d.e]+)[ ,]+([-\d.e]+)/gi,
        )) {
          const p = { x: Number(match[2]), y: Number(match[3]) };
          if (last && match[1] === "L") segments.push({ a: last, b: p });
          if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.01)
            points.push(p);
          last = p;
        }
        const id = edge.getAttribute("data-id")!;
        if (edge.querySelectorAll(`[data-edge-arrow]`).length !== 1)
          problems.push(`${id}: 终点箭头不唯一`);
        const simplify: Point[] = [];
        for (const p of points) {
          const b = simplify.at(-1),
            a = simplify.at(-2);
          if (
            a &&
            b &&
            Math.abs((b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x)) <
              0.01
          ) {
            if ((b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y) < -0.01)
              problems.push(`${id}: 原路折返`);
            else simplify.pop();
          }
          simplify.push(p);
        }
        for (let i = 0; i + 3 < simplify.length; i++) {
          const [a, b, c, d] = simplify.slice(i, i + 4);
          const reverse =
            (b.x - a.x) * (d.x - c.x) + (b.y - a.y) * (d.y - c.y) < 0;
          if (reverse && Math.hypot(c.x - b.x, c.y - b.y) < 43)
            problems.push(`${id}: 窄 U 形折返`);
        }
        const matrix = path.getScreenCTM()!;
        const screen = (p: Point) =>
          new DOMPoint(p.x, p.y).matrixTransform(matrix);
        const start = screen(points[0]),
          end = screen(points.at(-1)!);
        const handles = [
          ...document.querySelectorAll(
            ".recipe-object-port .react-flow__handle",
          ),
        ].map((h) => h.getBoundingClientRect());
        // 虚拟化的屏外框尚未挂载；逐模块定位后检查该端点的真实 DOM。
        const canvas = document
          .querySelector(".atlas-flow")!
          .getBoundingClientRect();
        for (const p of [start, end])
          if (
            p.x > canvas.left &&
            p.x < canvas.right &&
            p.y > canvas.top &&
            p.y < canvas.bottom &&
            !handles.some(
              (h) =>
                Math.hypot(
                  p.x - h.left - h.width / 2,
                  p.y - h.top - h.height / 2,
                ) < 1.5,
            )
          )
            problems.push(`${id}: 未贴合真实变量端口`);
        if (/^qkv-rope-/.test(id) && simplify.length > 4)
          problems.push(`${id}: 相邻 Q/K 通道超过必要的两折`);
        const contains = (r: DOMRect, p: Point) =>
          p.x >= r.left - 2 &&
          p.x <= r.right + 2 &&
          p.y >= r.top - 2 &&
          p.y <= r.bottom + 2;
        for (const box of boxes) {
          if (contains(box.rect, start) || contains(box.rect, end)) continue;
          for (const seg of segments) {
            const a = screen(seg.a),
              b = screen(seg.b),
              r = box.rect;
            const crosses =
              Math.abs(a.x - b.x) < 0.1
                ? a.x > r.left + 1 &&
                  a.x < r.right - 1 &&
                  Math.max(a.y, b.y) > r.top + 1 &&
                  Math.min(a.y, b.y) < r.bottom - 1
                : a.y > r.top + 1 &&
                  a.y < r.bottom - 1 &&
                  Math.max(a.x, b.x) > r.left + 1 &&
                  Math.min(a.x, b.x) < r.right - 1;
            if (crosses) {
              problems.push(`${id}: 穿过 ${box.name}`);
              break;
            }
          }
        }
        return { id, points: simplify, segments };
      });
    const bypasses = records;
    for (let i = 0; i < bypasses.length; i++)
      for (const other of bypasses.slice(i + 1)) {
        for (const a of bypasses[i].segments)
          for (const b of other.segments) {
            const av = Math.abs(a.a.x - a.b.x) < 0.1,
              bv = Math.abs(b.a.x - b.b.x) < 0.1;
            if (av === bv) {
              const distance = av
                ? Math.abs(a.a.x - b.a.x)
                : Math.abs(a.a.y - b.a.y);
              const overlap = av
                ? Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y)) -
                  Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y))
                : Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x)) -
                  Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x));
              if (distance < 1 && overlap > 2)
                problems.push(`${bypasses[i].id} 重叠 ${other.id}`);
              continue;
            }
            const v = av ? a : b,
              h = av ? b : a;
            if (
              v.a.x > Math.min(h.a.x, h.b.x) + 1 &&
              v.a.x < Math.max(h.a.x, h.b.x) - 1 &&
              h.a.y > Math.min(v.a.y, v.b.y) + 1 &&
              h.a.y < Math.max(v.a.y, v.b.y) - 1
            )
              problems.push(`${bypasses[i].id} × ${other.id}`);
          }
      }
    return {
      problems: [...new Set(problems)],
      routes: records.map(({ id, points }) => ({ id, points })),
    };
  }, residualOnly);
}

for (const model of ["v3", "r1", "v31", "v32"])
  test(`DeepSeek ${model} · 两条残差旁路不穿归一化和投影框`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 2800, height: 2000 });
    await page.goto(`/#model=${model}&chapter=layer`);
    for (const layer of [1, 4, 61]) {
      await page
        .getByRole("combobox", { name: "层", exact: true })
        .selectOption(String(layer));
      for (const phase of ["Prefill · N 行", "Decode · 当前一行"]) {
        await page.getByRole("button", { name: phase, exact: true }).click();
        await page.getByRole("button", { name: "全图", exact: true }).click();
        await expect
          .poll(async () => (await auditWires(page, true)).routes.length)
          .toBe(2);
        await expect
          .poll(async () => (await auditWires(page, true)).problems, {
            message: `${model} L${layer} ${phase}`,
          })
          .toEqual([]);
        const report = await auditWires(page, true);
        for (const { points } of report.routes) {
          expect(points[1].x).toBeLessThan(points[0].x);
          expect(points.at(-2)!.x).toBeLessThan(points.at(-1)!.x);
        }
        await info.attach(`L${layer}-${phase}`, {
          body: JSON.stringify(report),
          contentType: "application/json",
        });
      }
    }
    await page
      .getByRole("combobox", { name: "层", exact: true })
      .selectOption("1");
    await page
      .getByRole("button", { name: "Prefill · N 行", exact: true })
      .click();
    for (const id of ["input", "residual-a", "residual-f"]) {
      await page
        .locator(".stage-nav button")
        .filter({
          hasText:
            id === "input"
              ? "行归一化与残差旁路"
              : id === "residual-a"
                ? "Head 拼接"
                : "FFN 汇合",
        })
        .click();
      await expect
        .poll(async () => (await auditWires(page, true)).problems)
        .toEqual([]);
      await page.screenshot({ path: info.outputPath(`${id}.png`) });
    }
  });

for (const [layer, phase] of [
  [1, "prefill"],
  [2, "decode"],
  [5, "prefill"],
  [48, "decode"],
] as const) {
  test(`MiMo L${layer} ${phase} · 全模块实际连线、嵌套点击及截图`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 2800, height: 2000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/#model=mimo25&chapter=layer");
    await page
      .getByRole("combobox", { name: "层", exact: true })
      .selectOption(String(layer));
    if (phase === "decode")
      await page
        .getByRole("button", { name: "Decode · 当前一行", exact: true })
        .click();
    const navigation = page.locator(".stage-nav button");
    await expect(navigation.first()).toBeVisible();
    const count = await navigation.count();
    const reports = [];
    for (let index = 0; index < count; index++) {
      await navigation.nth(index).click();
      const stage = page.locator("[data-stage]").filter({
        has: page.locator(".stage-title > span", {
          hasText: new RegExp(`^${String(index + 1).padStart(2, "0")}$`),
        }),
      });
      await expect(stage).toBeVisible();
      await expect
        .poll(async () => (await auditWires(page)).problems)
        .toEqual([]);
      reports.push(await auditWires(page));
      const cell = stage.locator("[data-vector-cell]").first();
      await cell.click();
      await expect(cell).toHaveAttribute("data-internal-selected", "true");
      await expect(cell).toHaveCSS("border-top-color", "rgb(21, 101, 216)");
      await expect
        .poll(() =>
          cell.evaluate((el) =>
            el.closest(".react-flow__node")?.classList.contains("selected"),
          ),
        )
        .toBe(false);
      const tensor = stage.locator("[data-expanded-tensor]").first();
      await tensor.locator("header > [aria-label]").first().click();
      await expect(tensor).toHaveAttribute("data-internal-selected", "true");
      await expect(cell).not.toHaveAttribute("data-internal-selected");
      const size = await stage.evaluate((el) => ({
        w: (el as HTMLElement).offsetWidth,
        h: (el as HTMLElement).offsetHeight,
      }));
      await page.setViewportSize({
        width: Math.max(2800, size.w + 700),
        height: Math.max(2000, size.h + 700),
      });
      await navigation.nth(index).click();
      await page
        .locator(".react-flow__pane")
        .click({ position: { x: 5, y: 60 } });
      await stage.screenshot({
        path: info.outputPath(
          `${String(index + 1).padStart(2, "0")}-${await stage.getAttribute("data-stage")}.png`,
        ),
      });
      await page.screenshot({
        path: info.outputPath(`context-${index + 1}.png`),
      });
    }
    await info.attach("routes", {
      body: JSON.stringify(reports, null, 2),
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
  });
}

test("连线检查器必须抓住穿框、重叠、交叉、折返和错端口", async ({ page }) => {
  await page.setViewportSize({ width: 2800, height: 2000 });
  await page.goto("/#model=mimo25&chapter=layer");
  await page.getByRole("button", { name: "全图", exact: true }).click();
  await expect(page.locator("[data-stage]")).toHaveCount(11);
  await expect.poll(async () => (await auditWires(page)).problems).toEqual([]);
  const paths = await page
    .locator(".react-flow__edge-path")
    .evaluateAll((elements) => elements.map((e) => e.getAttribute("d")!));
  for (const fault of ["穿框", "重叠", "交叉", "折返", "错端口"] as const) {
    await page.evaluate(
      ({ fault, paths }) => {
        const elements = [
          ...document.querySelectorAll<SVGPathElement>(
            ".react-flow__edge-path",
          ),
        ];
        elements.forEach((e, i) => e.setAttribute("d", paths[i]));
        const path = elements[0];
        const rect = document
          .querySelector('[data-stage="rope"]')!
          .getBoundingClientRect();
        const inverse = path.getScreenCTM()!.inverse();
        const a = new DOMPoint(
          rect.left - 20,
          rect.top + rect.height / 2,
        ).matrixTransform(inverse);
        const b = new DOMPoint(
          rect.right + 20,
          rect.top + rect.height / 2,
        ).matrixTransform(inverse);
        if (fault === "穿框")
          path.setAttribute("d", `M ${a.x},${a.y} L ${b.x},${b.y}`);
        if (fault === "重叠") elements[1].setAttribute("d", paths[0]);
        if (fault === "交叉") {
          path.setAttribute("d", "M -100,-200 L 100,-200");
          elements[1].setAttribute("d", "M 0,-300 L 0,-100");
        }
        if (fault === "折返")
          path.setAttribute("d", "M 0,0 L 0,100 L 0,50 L 150,50");
        if (fault === "错端口")
          path.setAttribute("d", `M ${a.x + 60},${a.y} L ${b.x},${b.y}`);
      },
      { fault, paths },
    );
    const report = await auditWires(page);
    const marker = {
      穿框: "穿过 rope",
      重叠: "重叠",
      交叉: " × ",
      折返: "原路折返",
      错端口: "未贴合真实变量端口",
    }[fault];
    expect(
      report.problems.some((p) => p.includes(marker)),
      fault,
    ).toBe(true);
  }
  await page
    .locator(".react-flow__edge-path")
    .evaluateAll(
      (elements, paths) =>
        elements.forEach((e, i) => e.setAttribute("d", paths[i])),
      paths,
    );
  expect((await auditWires(page)).problems).toEqual([]);
});
