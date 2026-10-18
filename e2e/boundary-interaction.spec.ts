import { expect, test } from "@playwright/test";
import { inspectBoundaryAttachment } from "./helpers/boundary-contracts";

test("固定起线点只在持续悬停后显示加号，未选中也能沿边缩放", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 2200, height: 1600 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("combobox", { name: "定位模块" }).selectOption("kv");
  const node = page.locator('.react-flow__node[data-id="kv"]');
  const port = node.getByLabel("在 left-40 边界位置新增连线", { exact: true });
  const plus = port.locator("span");
  await expect(plus).toHaveCSS("opacity", "0");
  await port.hover();
  await page.waitForTimeout(200); // 验证短暂经过不能提前显示，不能用最终可见代替延迟约束。
  await expect(plus).toHaveCSS("opacity", "0");
  await expect(plus).toHaveCSS("opacity", "1");
  await page.mouse.move(40, 40);
  await expect(plus).toHaveCSS("opacity", "0");
  await expect(node).not.toHaveClass(/selected/);
  const edge = node.locator(".architecture-resize-edge.right");
  const before = (await node.boundingBox())!;
  const r = (await edge.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 80, r.y + r.height * 0.3, {
    steps: 10,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await node.boundingBox())!.width)
    .toBeGreaterThan(before.width + 40);
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () =>
      Math.abs((await node.boundingBox())!.width - before.width),
    )
    .toBeLessThan(2);
  await page.screenshot({ path: info.outputPath("hover-resize.png") });
});

test("真实端点在边缘外松手可吸附、换边、撤销重做并保存恢复", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 2200, height: 1600 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("combobox", { name: "定位模块" }).selectOption("kv");
  const node = page.locator('.react-flow__node[data-id="kv"]');
  const wire = page.locator('.react-flow__edge[data-id="norm-kv"]');
  const endpoint = page.locator(
    '[data-edge-id="norm-kv"][data-endpoint="target"]',
  );
  await expect(endpoint).toBeAttached();
  const count = await page.locator(".react-flow__edge").count();
  const observations: object[] = [];
  const paths = new Set<string | null>();
  for (const side of ["left", "bottom", "right", "top"] as const) {
    const box = (await node.boundingBox())!;
    const from = (await endpoint.boundingBox())!;
    const point =
      side === "left"
        ? { x: box.x - 12, y: box.y + box.height / 2 }
        : side === "right"
          ? { x: box.x + box.width + 12, y: box.y + box.height / 2 }
          : side === "top"
            ? { x: box.x + box.width / 2, y: box.y - 12 }
            : { x: box.x + box.width / 2, y: box.y + box.height + 12 };
    expect(point.x).toBeGreaterThan(0);
    expect(point.y).toBeLessThan(1600);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(point.x, point.y, { steps: 10 });
    await page.mouse.up();
    await page.getByRole("button", { name: "保存到本机", exact: true }).click();
    const saved = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem(
          "model-atlas:deepseek-v41-layer-layout:v12:prefill:1",
        )!,
      ),
    );
    const edge = saved.edges.find(
      (item: { id: string }) => item.id === "norm-kv",
    );
    observations.push({ side, edge });
    expect(edge.target).toBe("kv");
    expect(edge.data.targetAnchor).toEqual({ side, offset: 0.5 });
    expect(
      await page.evaluate(inspectBoundaryAttachment, {
        nodeId: "kv",
        edgeId: "norm-kv",
        side,
      }),
    ).toEqual([]);
    paths.add(await wire.locator(".react-flow__edge-path").getAttribute("d"));
    await expect(page.locator(".react-flow__edge")).toHaveCount(count);
  }
  expect(paths.size).toBe(4);
  const finalPath = await wire
    .locator(".react-flow__edge-path")
    .getAttribute("d");
  await page.keyboard.press("Control+z");
  await expect(wire.locator(".react-flow__edge-path")).not.toHaveAttribute(
    "d",
    finalPath!,
  );
  await page.keyboard.press("Control+y");
  const after = await wire.locator(".react-flow__edge-path").getAttribute("d");
  expect(after).toBe(finalPath);
  await page.getByRole("button", { name: "保存到本机", exact: true }).click();
  await page.reload();
  await page.getByRole("combobox", { name: "定位模块" }).selectOption("kv");
  const restored = await endpoint.boundingBox();
  const target = (await node.boundingBox())!;
  expect(
    Math.abs(restored!.x + restored!.width / 2 - target.x - target.width / 2),
  ).toBeLessThan(2);
  expect(Math.abs(restored!.y + restored!.height / 2 - target.y)).toBeLessThan(
    2,
  );
  await info.attach("boundary-gestures.json", {
    body: JSON.stringify(observations, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({ path: info.outputPath("boundary-restored.png") });
});

test("端点检查器故障注入：脱框、反向入边、缺箭头分别检出", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 2200, height: 1600 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("combobox", { name: "定位模块" }).selectOption("kv");
  const probe = { nodeId: "kv", edgeId: "norm-kv", side: "top" as const };
  await expect
    .poll(() => page.evaluate(inspectBoundaryAttachment, probe))
    .toEqual([]);
  const mutations: object[] = [];
  for (const fault of [
    "boundary-endpoint",
    "boundary-direction",
    "boundary-arrow",
  ]) {
    const previous = await page.evaluate((fault) => {
      const wire = document.querySelector(
        '.react-flow__edge[data-id="norm-kv"] .react-flow__edge-path',
      ) as SVGPathElement;
      const arrow = document.querySelector('[data-edge-arrow="norm-kv"]')!;
      const before = {
        path: wire.getAttribute("d")!,
        marker: arrow.getAttribute("marker-end")!,
      };
      const end = wire.getPointAtLength(wire.getTotalLength());
      if (fault === "boundary-endpoint")
        wire.setAttribute("d", `${before.path} L ${end.x + 40} ${end.y}`);
      if (fault === "boundary-direction")
        wire.setAttribute(
          "d",
          `${before.path} M ${end.x} ${end.y + 40} L ${end.x} ${end.y}`,
        );
      if (fault === "boundary-arrow") arrow.removeAttribute("marker-end");
      return before;
    }, fault);
    const problems = await page.evaluate(inspectBoundaryAttachment, probe);
    mutations.push({ fault, problems });
    expect(problems).toContain(fault);
    await page.evaluate((previous) => {
      document
        .querySelector(
          '.react-flow__edge[data-id="norm-kv"] .react-flow__edge-path',
        )!
        .setAttribute("d", previous.path);
      document
        .querySelector('[data-edge-arrow="norm-kv"]')!
        .setAttribute("marker-end", previous.marker);
    }, previous);
    expect(await page.evaluate(inspectBoundaryAttachment, probe)).toEqual([]);
  }
  await info.attach("boundary-mutations.json", {
    body: JSON.stringify(mutations, null, 2),
    contentType: "application/json",
  });
});
