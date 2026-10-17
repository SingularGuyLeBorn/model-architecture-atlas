import { expect, type Locator, type Page } from "@playwright/test";

// 用真实平移手势定位画布对象；DOM 的 scrollIntoView 无法移动 React Flow 相机。
export async function centerCanvasTarget(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  let previous = "";
  await expect
    .poll(async () => {
      const current = JSON.stringify(await target.boundingBox());
      const stable = current === previous;
      previous = current;
      return stable;
    })
    .toBe(true);
  const canvas = (await page.locator(".react-flow").boundingBox())!;
  const destination = {
    x: canvas.x + canvas.width / 2,
    y: canvas.y + canvas.height / 2,
  };
  // 滚轮速度由画布设置控制；每次重新量取实际结果，不假设一像素输入等于一像素平移。
  for (let attempt = 0; attempt < 6; attempt++) {
    const box = (await target.boundingBox())!;
    const dx = box.x + box.width / 2 - destination.x;
    const dy = box.y + box.height / 2 - destination.y;
    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) break;
    const before = await page
      .locator(".react-flow__viewport")
      .getAttribute("style");
    await page.mouse.move(destination.x, destination.y);
    await page.mouse.wheel(dx * 2, dy * 2);
    await expect
      .poll(() => page.locator(".react-flow__viewport").getAttribute("style"))
      .not.toBe(before);
  }
  await expect(target).toBeInViewport();
}
