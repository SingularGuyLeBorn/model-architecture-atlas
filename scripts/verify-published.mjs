// 发布后核对实际线上入口、产物版本、跨层查找及两种窗口，不以上传成功代替验收。
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const url = process.argv[2];
if (!url?.startsWith('https://')) throw new Error('传入本次发布的 HTTPS URL');
const output = resolve('artifacts/share-2026-10-17/online-check');
await mkdir(output, { recursive: true });
const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`线上 HTTP ${response.status}`);
const html = await response.text();
const local = await readFile('dist/index.html', 'utf8');
const bundle = local.match(/src="([^" ]+\.js)"/)?.[1];
if (!bundle || !html.includes(bundle)) throw new Error('线上入口与本次构建的脚本版本不一致');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 2400, height: 1800 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${url}/#model=v41&chapter=layer`, { timeout: 60000 });
  await page.getByRole('button', { name: '收起左栏', exact: true }).click();
  const input = page.getByRole('textbox', { name: '按变量名查找' });
  for (const [query, layer, phase, id, selector, count] of [
    ['U_1,t', 1, 'prefill', 'swa-window', '[data-swa-result] [data-window-matrix]', 1],
    ['KV_3,t', 3, 'prefill', 'kv-merge', '[data-concat-element]', 36],
    ['U_4,t', 4, 'decode', 'swa-window', '[data-window-token="t"] [data-window-element]', 3],
  ]) {
    await page.getByRole('button', { name: phase === 'prefill' ? 'Prefill · 整段矩阵' : 'Decode · 单步一行', exact: true }).click();
    await input.fill(query);
    await page.locator(`[data-variable-result][data-variable-layer="${layer}"][data-variable-node="${id}"]`).first().click();
    await expect(page.locator(selector)).toHaveCount(count);
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    let previous = '', stable = 0;
    await expect.poll(async () => {
      const key = JSON.stringify(await node.boundingBox());
      stable = key === previous ? stable + 1 : 0;
      previous = key;
      return stable;
    }, { intervals: [150, 200, 250] }).toBeGreaterThanOrEqual(3);
    await expect(node.locator('.katex-error')).toHaveCount(0);
    await page.screenshot({ path: resolve(output, `L${layer}-${phase}-${id}.png`), clip: await node.boundingBox() });
  }
  await input.fill('');
  await page.setViewportSize({ width: 4000, height: 3400 });
  for (const layer of [2, 15]) {
    await page.getByRole('button', { name: String(layer), exact: true }).click();
    for (const phase of ['Prefill', 'Decode']) {
      await page.getByRole('button', { name: phase === 'Prefill' ? 'Prefill · 整段矩阵' : 'Decode · 单步一行', exact: true }).click();
      await page.getByRole('combobox', { name: '定位模块' }).selectOption('engram-lookup');
      const flow = page.locator('[data-engram-address-flow]');
      await expect(flow.locator('[data-engram-address-link]')).toHaveCount(33);
      await expect(flow.locator('[data-engram-address-link=select]')).toHaveCount(18);
      await expect(flow.locator('[data-engram-address-link=read]')).toHaveCount(2);
      for (const kind of ['split', 'scale', 'assemble'])
        await expect(flow.locator(`[data-engram-address-link=${kind}]`)).toHaveCount(3);
      await expect(flow.locator('[data-engram-dequantization]')).toContainText('其余 23 行同样处理');
      await expect(flow.locator('.katex-error')).toHaveCount(0);
      await flow.screenshot({ path: resolve(output, `L${layer}-${phase}-engram.png`) });
    }
  }
  expect(errors).toEqual([]);
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ url, bundle, http: response.status, checkedAt: new Date().toISOString(), checks: ['跨层变量查找', 'Prefill 的 u 行组成 U', 'KV 拼接 36 个代表元素', 'Decode 新旧窗口与当前行', '第 2、15 层两模式 Engram：同号双表、分块反量化及结果连线'], errors }, null, 2));
  console.log(`线上检查通过：${url}，脚本 ${bundle}`);
} finally { await browser.close(); }
