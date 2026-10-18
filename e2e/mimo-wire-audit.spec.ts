import { test, expect, type Page } from "@playwright/test";

/** 读取实际 SVG 子路径；M 是标签断口，不能补成假线再检查穿字。 */
async function auditWires(page: Page) {
  return page.evaluate(() => {
    type Point = { x: number; y: number };
    type Segment = { a: Point; b: Point };
    const problems: string[] = [];
    const boxes = [
      ...document.querySelectorAll(
        "[data-stage] [data-expanded-tensor], [data-stage] .data-box, [data-stage] .architecture-note [aria-label], [data-stage] .architecture-caption",
      ),
    ].map((el) => ({
      rect: el.getBoundingClientRect(),
      name: el.querySelector("[aria-label]")?.getAttribute("aria-label"),
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
    const records = [...document.querySelectorAll(".react-flow__edge")].map(
      (edge) => {
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
      },
    );
    const bypasses = records.filter((r) =>
      /input-residual-a|rope-attention|residual-a-residual-f/.test(r.id),
    );
    for (let i = 0; i < bypasses.length; i++)
      for (const other of bypasses.slice(i + 1)) {
        for (const a of bypasses[i].segments)
          for (const b of other.segments) {
            const av = Math.abs(a.a.x - a.b.x) < 0.1,
              bv = Math.abs(b.a.x - b.b.x) < 0.1;
            if (av === bv) continue;
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
  });
}

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
      if (index < 2)
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
