import { test, expect, type Locator } from "@playwright/test";
import {
  COLORS,
  tonePalette,
  selectionPalette,
  type DiagramTone,
} from "../src/components/diagram-primitives";
import { frameColor } from "../src/components/diagram-appearance";

const palette = Object.fromEntries(
  [
    "neutral",
    ...Object.keys(COLORS)
      .filter((key) => key.endsWith("Soft"))
      .map((key) => key.slice(0, -4)),
  ].map((tone) => [
    tone,
    Object.fromEntries(
      ["normal", "deepen", "amber"].map((mode) => {
        const p =
          mode === "normal"
            ? tonePalette(tone as DiagramTone)
            : selectionPalette(tone as DiagramTone, mode as "deepen" | "amber");
        return [mode, { fill: p.background, border: frameColor(p.color) }];
      }),
    ),
  ]),
);

async function audit(node: Locator) {
  return node.evaluate((root, colors) => {
    const issues: string[] = [];
    const gaps: number[] = [];
    const rgb = (color: string) => {
      const probe = document.createElement("span");
      probe.style.color = color;
      return probe.style.color;
    };
    const rows = [
      ...root.querySelectorAll<HTMLElement>("[data-vector-elements]"),
    ];
    const scale =
      root.getBoundingClientRect().width / (root as HTMLElement).offsetWidth;
    // 测虚线内沿到内容外沿；轮廓在边框外侧，计入 offset，不能用 CSS padding 代替实测。
    const checkFrame = (
      frame: HTMLElement,
      targets: Element[],
      label: string,
    ) => {
      const rect = frame.getBoundingClientRect(),
        style = getComputedStyle(frame);
      const outline = style.outlineStyle === "dashed";
      const inset = outline
        ? -parseFloat(style.outlineOffset)
        : parseFloat(style.borderTopWidth);
      const edge = {
        left: rect.left + inset * scale,
        right: rect.right - inset * scale,
        top: rect.top + inset * scale,
        bottom: rect.bottom - inset * scale,
      };
      for (const el of targets) {
        const b = el.getBoundingClientRect();
        const clearance = [
          b.left - edge.left,
          edge.right - b.right,
          b.top - edge.top,
          edge.bottom - b.bottom,
        ].map((v) => v / scale);
        gaps.push(Math.min(...clearance));
        // [OM-FREEPLAY] 实测至少 3px，允许缩放和亚像素舍入；默认组件留 5px。
        if (Math.min(...clearance) < 3 - 0.15)
          issues.push(
            `${label}: 虚线净空 ${clearance.map((v) => v.toFixed(2))}`,
          );
      }
      const outside = outline
        ? (parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset)) *
          scale
        : 0;
      for (
        let parent = frame.parentElement;
        parent && parent !== root;
        parent = parent.parentElement
      ) {
        const css = getComputedStyle(parent),
          box = parent.getBoundingClientRect();
        if (
          /(hidden|clip|auto|scroll)/.test(css.overflowX) &&
          (rect.left - outside < box.left - 0.5 ||
            rect.right + outside > box.right + 0.5)
        )
          issues.push(`${label}: 横向裁切`);
        if (
          /(hidden|clip|auto|scroll)/.test(css.overflowY) &&
          (rect.top - outside < box.top - 0.5 ||
            rect.bottom + outside > box.bottom + 0.5)
        )
          issues.push(`${label}: 纵向裁切`);
      }
      for (const other of rows) {
        if (other === frame || targets.some((target) => other.contains(target)))
          continue;
        for (const cell of other.querySelectorAll("[data-vector-cell]")) {
          const b = cell.getBoundingClientRect();
          if (
            b.right > rect.left - outside &&
            b.left < rect.right + outside &&
            b.bottom > rect.top - outside &&
            b.top < rect.bottom + outside
          )
            issues.push(`${label}: 碰到其他行元素`);
        }
      }
    };
    const content = (row: Element) => [
      ...row.querySelectorAll(
        "[data-vector-cell], :scope > div:first-child, :scope > div:last-child > span",
      ),
    ];
    for (const row of rows) {
      const mode = row.dataset.vectorSelected
        ? row.dataset.selectionStyle!
        : "normal";
      const expected = colors[row.dataset.tone!]?.[mode];
      if (!expected) {
        issues.push(`未登记色系 ${row.dataset.tone}/${mode}`);
        continue;
      }
      for (const cell of row.querySelectorAll("[data-vector-cell]")) {
        const css = getComputedStyle(cell);
        if (
          css.backgroundColor !== rgb(expected.fill) ||
          [
            css.borderTopColor,
            css.borderRightColor,
            css.borderBottomColor,
            css.borderLeftColor,
          ].some((c) => c !== rgb(expected.border))
        )
          issues.push(`${row.textContent}: 填充/边框不配套`);
      }
      if (getComputedStyle(row).outlineStyle === "dashed")
        checkFrame(row, content(row), row.textContent!.slice(0, 35));
    }
    for (const frame of root.querySelectorAll<HTMLElement>(
      "[data-selection-window][aria-hidden]",
    )) {
      const selected = [
        ...frame.parentElement!.querySelectorAll("[data-vector-selected]"),
      ];
      checkFrame(frame, selected.flatMap(content), "SWA 连续选区");
    }
    for (const row of root.querySelectorAll<HTMLElement>(
      '[data-window-state="new"]',
    )) {
      const box = row.getBoundingClientRect(),
        css = getComputedStyle(row);
      for (const cell of row.querySelectorAll("[data-window-element]")) {
        const gap =
          (cell.getBoundingClientRect().top - box.top) / scale -
          parseFloat(css.borderTopWidth);
        gaps.push(gap);
        if (gap < 3 - 0.15) issues.push(`SWA 新行分隔净空 ${gap}`);
      }
    }
    return {
      issues,
      rows: rows.length,
      minGap: gaps.length ? Math.min(...gaps) : null,
    };
  }, palette);
}

test("选区配色成套、虚线四侧净空、邻行与裁切实测", async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 3200, height: 2600 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  const reports = [];
  for (const [layer, phase, id] of [
    [2, "Prefill", "engram-lookup"],
    [3, "Prefill", "global-select"],
    [29, "Decode", "global-select"],
    [2, "Prefill", "swa-window"],
    [4, "Decode", "swa-window"],
    [3, "Prefill", "add1"],
  ] as const) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: `${phase} · ${phase === "Prefill" ? "整段矩阵" : "单步一行"}`,
        exact: true,
      })
      .click();
    await page.getByRole("combobox", { name: "定位模块" }).selectOption(id);
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    await expect(node).toBeVisible();
    await expect(
      node.locator("[data-detail-suspended],.katex-error"),
    ).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(async () => (await audit(node)).issues).toEqual([]);
    const result = await audit(node);
    expect(result.minGap).not.toBeNull();
    reports.push({ layer, phase, id, ...result });
    if (id === "engram-lookup") {
      // 反向验证检查器：临时重现异色边框与零净空，必须分别检出，然后恢复 DOM。
      const row = node.locator("[data-vector-selected]").first();
      const cell = row.locator("[data-vector-cell]").first();
      const old = await cell.getAttribute("style");
      await cell.evaluate((el) => {
        el.style.borderColor = "blue";
      });
      expect(
        (await audit(node)).issues.some((s) => s.includes("填充/边框")),
      ).toBe(true);
      await cell.evaluate((el, value) => el.setAttribute("style", value!), old);
      const oldRow = await row.getAttribute("style");
      await row.evaluate((el) => {
        el.style.padding = "0";
      });
      expect(
        (await audit(node)).issues.some((s) => s.includes("虚线净空")),
      ).toBe(true);
      await row.evaluate(
        (el, value) => el.setAttribute("style", value!),
        oldRow,
      );
      expect((await audit(node)).issues).toEqual([]);
    }
    // 核对实际四边，避免 IntersectionObserver 的 0.99999988 舍入误报。
    let previous = "",
      stable = 0;
    await expect
      .poll(async () => {
        const current = JSON.stringify(await node.boundingBox());
        stable = current === previous ? stable + 1 : 0;
        previous = current;
        return stable;
      })
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(async () => {
        const b = (await node.boundingBox())!;
        return (
          b.x >= 0 &&
          b.y >= 0 &&
          b.x + b.width <= 3200 &&
          b.y + b.height <= 2600
        );
      })
      .toBe(true);
    await page.screenshot({
      path: `artifacts/selection-style/L${layer}-${phase}-${id}.png`,
      clip: (await node.boundingBox())!,
    });
    if (id === "engram-lookup") {
      await page.screenshot({
        path: `artifacts/selection-style/L${layer}-${phase}-engram-table-detail.png`,
        clip: (await node.locator("[data-engram-table]").boundingBox())!,
      });
    }
  }
  await testInfo.attach("选区实测", {
    body: JSON.stringify(reports, null, 2),
    contentType: "application/json",
  });
});
