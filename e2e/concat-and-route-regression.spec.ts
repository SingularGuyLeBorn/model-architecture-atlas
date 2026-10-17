import { test, expect } from "@playwright/test";

test("MoE 结果框公式与说明增大两号且保持在框内", async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1400 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  for (const phase of ["Prefill · 整段矩阵", "Decode · 单步一行"]) {
    await page.getByRole("button", { name: phase, exact: true }).click();
    await page
      .getByRole("combobox", { name: "定位模块" })
      .selectOption("concat");
    await page
      .getByRole("combobox", { name: "定位模块" })
      .selectOption("moe-sum");
    const result = page.locator('.react-flow__node[data-id="moe-output"]');
    const formula = result.locator("span[aria-label]").first();
    const description = result.locator("span[aria-label]").nth(1).locator("..");
    await expect(formula).toHaveCSS("font-size", "16px");
    await expect(description).toHaveCSS("font-size", "13px");
    const overflow = await result.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return [...node.querySelectorAll("span[aria-label]")].some((element) => {
        const text = element.parentElement!.getBoundingClientRect();
        return (
          text.left < box.left - 1 ||
          text.right > box.right + 1 ||
          text.top < box.top - 1 ||
          text.bottom > box.bottom + 1
        );
      });
    });
    expect(overflow).toBe(false);
    const bounds = (await result.boundingBox())!;
    await page.mouse.move(1000, 700);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(
      2000 - bounds.x - bounds.width / 2,
      1400 - bounds.y - bounds.height / 2,
      { steps: 5 },
    );
    await page.mouse.up({ button: "middle" });
    await expect(result).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      clip: (await result.boundingBox())!,
      path: `artifacts/moe-output-${phase.startsWith("Prefill") ? "prefill" : "decode"}-larger.png`,
    });
  }
});

test("K/V 来源、特征省略、拼接代表块保留来源元素且无溢出", async ({ page }) => {
  await page.setViewportSize({ width: 4200, height: 1800 });
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [1, 15]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await focus.selectOption("concat");
    const projection = page.locator("[data-output-projection]");
    await expect(projection).toBeVisible();
    for (const group of [1, 2, 8]) {
      const product = projection.locator(
        `[data-output-group-product="${group}"]`,
      );
      const horizontal = await product.evaluate((el) => {
        const [c, w, b] = [
          ...el.querySelectorAll("[data-attention-tensor]"),
        ].map((tensor) => tensor.getBoundingClientRect());
        return (
          c.right < w.left &&
          w.right < b.left &&
          Math.abs(c.top + c.height / 2 - w.top - w.height / 2) < 1 &&
          Math.abs(w.top + w.height / 2 - b.top - b.height / 2) < 1
        );
      });
      expect(horizontal).toBe(true);
    }
    const geometry = await projection.evaluate((root) => {
      const groups = [...root.querySelectorAll("[data-output-group]")].map(
        (g) => g.getBoundingClientRect(),
      );
      const products = [
        ...root.querySelectorAll<HTMLElement>("[data-output-group-product]"),
      ];
      return {
        overflow: products.filter((p) => {
          const r = p.getBoundingClientRect(),
            parent = p.parentElement!.getBoundingClientRect();
          return (
            p.scrollWidth > p.clientWidth + 2 ||
            r.left < parent.left - 1 ||
            r.right > parent.right + 1
          );
        }).length,
        separated:
          groups[0].right < groups[1].left && groups[1].right < groups[2].left,
        ratio:
          root.getBoundingClientRect().width /
          root.getBoundingClientRect().height,
      };
    });
    expect(geometry.overflow).toBe(0);
    expect(geometry.separated).toBe(true);
    expect(geometry.ratio).toBeGreaterThan(2);
    await expect(
      projection.locator("[data-b-concat-blocks] [data-attention-tensor]"),
    ).toHaveCount(3);
    for (const group of [1, 2, 8]) {
      const block = projection.locator(
        `[data-b-concat-blocks] [data-attention-tensor="B_{${group}}"]`,
      );
      await expect(block.locator("[aria-label]").first()).toBeVisible();
      expect(
        await block
          .locator("[aria-label]")
          .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label"))),
      ).toContain(`b^{(${group})}_{1,1}`);
    }
    for (const group of [1, 2, 8])
      await expect(
        projection.locator(
          `[data-head-concat-sources="${group}"] [data-original-head]`,
        ),
      ).toHaveCount(3);
    const overflows = await projection.evaluate((root) =>
      [
        ...root.querySelectorAll<HTMLElement>(
          "[data-expanded-tensor], [data-b-concat-blocks], [data-head-concat-sources]",
        ),
      ]
        .filter((e) => e.scrollWidth > e.clientWidth + 2)
        .map((e) => ({
          tag: e.outerHTML.slice(0, 150),
          width: e.clientWidth,
          scroll: e.scrollWidth,
        })),
    );
    expect(overflows).toEqual([]);
    const clipped = await projection.evaluate((root) =>
      [
        ...root.querySelectorAll<HTMLElement>(
          "[data-b-concat-blocks] [data-attention-tensor], [data-head-concat-sources] > div",
        ),
      ].flatMap((el) => {
        const b = el.getBoundingClientRect();
        let ancestor = el.parentElement;
        while (ancestor && ancestor !== root) {
          const a = ancestor.getBoundingClientRect();
          if (
            getComputedStyle(ancestor).overflow === "hidden" &&
            (b.left < a.left - 1 ||
              b.right > a.right + 1 ||
              b.bottom > a.bottom + 1)
          )
            return [
              {
                text: el.textContent?.slice(0, 30),
                delta: b.right - a.right,
                parent: ancestor.clientWidth,
              },
            ];
          ancestor = ancestor.parentElement;
        }
        return [];
      }),
    );
    expect(clipped).toEqual([]);
    await projection.screenshot({
      path: `artifacts/concat-complete-layer-${layer}.png`,
    });
    await focus.selectOption("heads");
    const head = page.locator('[data-head-layout="1"]');
    expect(
      await head
        .locator("[data-attention-tensor]")
        .evaluateAll((els) =>
          els.map((el) => el.getAttribute("data-attention-tensor")),
        ),
    ).toContain(`K=\\mathrm{KV}_{${layer},t}`);
    await expect(head.locator("[data-dot-product-omission]")).toHaveCount(1);
    const tex = await head
      .locator("[aria-label]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!));
    expect(tex).toContain("d_k=512");
    expect(tex.some((t) => t.includes("\\div"))).toBe(false);
    await head
      .locator("[data-attention-dot-expansion]")
      .screenshot({ path: `artifacts/head-dot-layer-${layer}.png` });
    await head
      .locator("[data-attention-tensor]")
      .nth(1)
      .screenshot({ path: `artifacts/key-source-layer-${layer}.png` });
  }
  await focus.selectOption("add1");
  const broadcast = page.locator("[data-mhc-elementwise-broadcast]").first();
  await expect(
    broadcast.locator("[data-broadcast-omissions] [aria-label]"),
  ).toHaveCount(3);
  await broadcast.screenshot({
    path: "artifacts/broadcast-three-omissions.png",
  });
  expect(await page.locator(".katex-error").count()).toBe(0);
});

test("mHC 参数来源可见、迭代去装饰箭头，专家求和分用三侧入口", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2600, height: 4000 });
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const id of ["hc-mix-a", "hc-mix-f"]) {
    await focus.selectOption(id);
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    const origin = node.locator("[data-mhc-parameter-origin]");
    await expect(origin).toBeVisible();
    await expect(origin).toContainText("训练时学习");
    const tex = await node
      .locator("[aria-label]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!));
    expect(tex.some((t) => t.includes("\\div") || t.includes("÷"))).toBe(false);
    await origin.screenshot({ path: `artifacts/${id}-parameter-origin.png` });
    await node
      .locator("[data-mhc-sinkhorn-loop]")
      .screenshot({ path: `artifacts/${id}-iteration.png` });
  }
  await page.setViewportSize({ width: 2400, height: 1800 });
  await focus.selectOption("moe-sum");
  await page.mouse.move(1800, 850);
  await page.mouse.wheel(0, -300);
  const sum = page.locator("[data-moe-weighted-sum]");
  for (const [key, side] of [
    ["shared", "left"],
    ["7", "top"],
    ["31", "top"],
    ["351", "right"],
  ])
    await expect(sum.locator(`[data-handleid="term-${key}"]`)).toHaveClass(
      new RegExp(`react-flow__handle-${side}`),
    );
  await page.screenshot({ path: "artifacts/moe-sum-three-sides.png" });
});

test("长折线偏心抓取只平移目标线段，连续帧不出现斜线", async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1400 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("combobox", { name: "定位模块" }).selectOption("state1");
  const wire = page.locator(
    '.react-flow__edge[data-id="add1-state"] .react-flow__edge-path',
  );
  await expect(wire).toBeAttached();
  const grab = await wire.evaluate((el) => {
    const path = el as SVGPathElement,
      matrix = path.getScreenCTM()!;
    const matches = [
      ...path.getAttribute("d")!.matchAll(/([ML])\s*([-\d.]+)\s+([-\d.]+)/g),
    ];
    const candidates = matches.slice(1).flatMap((p, i) => {
      if (p[1] !== "L") return [];
      const a = new DOMPoint(+matches[i][2], +matches[i][3]).matrixTransform(
        matrix,
      );
      const b = new DOMPoint(+p[2], +p[3]).matrixTransform(matrix);
      const horizontal = Math.abs(a.y - b.y) < 0.01,
        x = (a.x + b.x) / 2,
        y = (a.y + b.y) / 2;
      const gx = x + (horizontal ? 0 : 3),
        gy = y + (horizontal ? 3 : 0);
      if (
        Math.hypot(a.x - b.x, a.y - b.y) < 60 ||
        gx < 30 ||
        gx > innerWidth - 30 ||
        gy < 240 ||
        gy > innerHeight - 30
      )
        return [];
      if (
        document
          .elementFromPoint(gx, gy)
          ?.closest(".react-flow__edge")
          ?.getAttribute("data-id") !== "add1-state"
      )
        return [];
      return [
        { x, y, gx, gy, horizontal, length: Math.hypot(a.x - b.x, a.y - b.y) },
      ];
    });
    candidates.sort((a, b) => b.length - a.length);
    if (!candidates[0]) throw new Error("未找到可抓取的长线段");
    return candidates[0];
  });
  const original = await wire.getAttribute("d");
  await page.mouse.move(grab.gx, grab.gy);
  await page.mouse.down();
  for (const delta of [6, 18, 35, 12, 0]) {
    await page.mouse.move(
      grab.gx + (grab.horizontal ? 0 : delta),
      grab.gy + (grab.horizontal ? delta : 0),
    );
    await expect
      .poll(() =>
        wire.evaluate(
          (el, args) => {
            const path = el as SVGPathElement,
              matrix = path.getScreenCTM()!;
            const matches = [
              ...path
                .getAttribute("d")!
                .matchAll(/([ML])\s*([-\d.]+)\s+([-\d.]+)/g),
            ];
            let found = false;
            for (let i = 1; i < matches.length; i++) {
              if (matches[i][1] !== "L") continue;
              const a = new DOMPoint(
                +matches[i - 1][2],
                +matches[i - 1][3],
              ).matrixTransform(matrix);
              const b = new DOMPoint(
                +matches[i][2],
                +matches[i][3],
              ).matrixTransform(matrix);
              if (Math.abs(a.x - b.x) > 0.1 && Math.abs(a.y - b.y) > 0.1)
                return false;
              if (
                args.grab.horizontal
                  ? Math.abs(a.y - (args.grab.y + args.delta)) < 0.2 &&
                    Math.abs(b.y - a.y) < 0.1 &&
                    Math.min(a.x, b.x) <= args.grab.x &&
                    Math.max(a.x, b.x) >= args.grab.x
                  : Math.abs(a.x - (args.grab.x + args.delta)) < 0.2 &&
                    Math.abs(b.x - a.x) < 0.1 &&
                    Math.min(a.y, b.y) <= args.grab.y &&
                    Math.max(a.y, b.y) >= args.grab.y
              )
                found = true;
            }
            return found;
          },
          { grab, delta },
        ),
      )
      .toBe(true);
  }
  await page.mouse.up();
  await page.screenshot({ path: "artifacts/long-route-stable.png" });
  await page.keyboard.press("Control+z");
  await expect(wire).toHaveAttribute("d", original!);
});
