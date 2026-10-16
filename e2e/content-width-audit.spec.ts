import { test, expect } from "@playwright/test";

test("整页内容宽度审查", async ({ page }, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 2800, height: 2200 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "15", exact: true }).click();
  const focus = page.getByRole("combobox", { name: "定位模块" });
  const ids = await focus
    .locator("option")
    .evaluateAll((items) =>
      items.map((n) => (n as HTMLOptionElement).value).filter(Boolean),
    );
  const reports = [];
  for (const id of ids) {
    await focus.selectOption(id);
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    await expect(node.locator("[data-detail-suspended]")).toHaveCount(0);
    const content =
      id === "q"
        ? page.locator(
            '.react-flow__node[data-id="q"], .react-flow__node[data-id^="q-"]',
          )
        : node;
    const wide = await content.locator("div,span").evaluateAll((elements) =>
      elements.flatMap((el) => {
        const n = el as HTMLElement;
        const style = getComputedStyle(n);
        if (
          parseFloat(style.borderTopWidth) === 0 ||
          n.offsetWidth < 100 ||
          n.querySelector(".react-flow__handle")
        )
          return [];
        const formulas = n.querySelectorAll<HTMLElement>("[aria-label] math");
        if (formulas.length !== 1) return [];
        const copy = n.cloneNode(true) as HTMLElement;
        copy
          .querySelectorAll("[aria-label]")
          .forEach((formula) => formula.remove());
        if (copy.textContent?.trim()) return [];
        const f = formulas[0];
        const zoom = n.getBoundingClientRect().width / n.offsetWidth;
        const content = f.getBoundingClientRect().width / zoom;
        if (n.offsetWidth - content < 48 || n.offsetWidth < content * 2)
          return [];
        return [
          {
            width: n.offsetWidth,
            content: Math.round(content),
            tex: f.closest("[aria-label]")?.getAttribute("aria-label"),
            owner: n.parentElement?.outerHTML.slice(0, 220),
          },
        ];
      }),
    );
    if (wide.length)
      reports.push({
        id,
        count: wide.length,
        widest: wide.sort((a, b) => b.width - a.width).slice(0, 12),
      });
  }
  console.log("元素宽度审查", JSON.stringify(reports));
  await info.attach("content-width-audit.json", {
    body: JSON.stringify(reports, null, 2),
    contentType: "application/json",
  });
  expect(reports).toEqual([]);
});
