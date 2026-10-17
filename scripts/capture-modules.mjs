// 用户要求逐模块保存原图；从实际页面截图，保留层号、模式与源码版本。
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const base = process.env.ATLAS_CAPTURE_URL || 'http://127.0.0.1:4173/';
const output = resolve(process.argv[2] || 'artifacts/share-2026-10-17/modules');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 2400, height: 1800 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`${base.split('#')[0]}#model=v41&chapter=layer`);
await page.getByRole('button', { name: '收起左栏', exact: true }).click();
const focus = page.getByRole('combobox', { name: '定位模块' });
const common = await focus.locator('option').evaluateAll(options => options.filter(o => o.value).map(o => o.value));
const plans = [
  [1, 'prefill', common],
  [2, 'prefill', ['engram-lookup', 'engram-inject']],
  [3, 'prefill', ['compressor', 'indexer', 'global-select', 'kv-merge', 'swa-window']],
  [4, 'prefill', ['compressor', 'indexer', 'global-select', 'kv-merge']],
  [21, 'prefill', ['compressor', 'indexer']],
  [25, 'prefill', ['compressor', 'indexer', 'global-select', 'kv-merge']],
  [40, 'prefill', ['output', 'next-inputs']],
  [1, 'decode', ['kv', 'swa-window', 'q', 'heads', 'concat']],
  [3, 'decode', ['compressor', 'indexer', 'swa-window']],
  [4, 'decode', ['compressor', 'indexer', 'swa-window']],
  [25, 'decode', ['indexer']],
];
const captures = [];
const mode = layer => layer <= 2 ? 'SWA-only' : [3, 9, 15, 21].includes(layer) ? 'Full' : [25, 29, 33, 37].includes(layer) ? 'Reindex' : 'Reuse';
async function settle(node) {
  let last = '', stable = 0;
  await expect.poll(async () => {
    const rect = await node.boundingBox();
    const key = JSON.stringify(rect);
    stable = key === last ? stable + 1 : 0;
    last = key;
    return stable;
  }, { timeout: 15000, intervals: [150, 200, 250] }).toBeGreaterThanOrEqual(3);
}
try {
  for (const [layer, phase, ids] of plans) {
    await page.getByRole('button', { name: String(layer), exact: true }).click();
    await page.getByRole('button', { name: phase === 'prefill' ? 'Prefill · 整段矩阵' : 'Decode · 单步一行', exact: true }).click();
    await expect(page.locator('.architecture-flow')).toHaveAttribute('data-render-layer', String(layer));
    await expect(page.locator('.architecture-flow')).toHaveAttribute('data-render-phase', phase);
    const available = await focus.locator('option').evaluateAll(options => options.map(o => o.value));
    for (const id of ids) {
      if (!available.includes(id)) throw new Error(`未找到模块：L${layer} ${phase} ${id}`);
      await focus.selectOption(id);
      const node = page.locator(`.react-flow__node[data-id="${id}"]`);
      await settle(node);
      let rect = await node.boundingBox();
      await page.setViewportSize({ width: Math.max(1600, Math.ceil(rect.width + 120)), height: Math.max(1200, Math.ceil(rect.height + 450)) });
      await focus.selectOption(id);
      await page.evaluate(() => document.fonts.ready);
      await settle(node);
      // 自动高度变化后再定位，按最终边界截取，不使用会滚动 React Flow 的 locator.screenshot。
      await focus.selectOption(id);
      await settle(node);
      rect = await node.boundingBox();
      const viewport = page.viewportSize();
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > viewport.width || rect.y + rect.height > viewport.height) throw new Error(`截图不完整：${id} ${JSON.stringify(rect)} ${JSON.stringify(viewport)}`);
      await expect(node.locator('.katex-error')).toHaveCount(0);
      await expect(node.locator('[data-detail-suspended]')).toHaveCount(0);
      const filename = `${String(captures.length + 1).padStart(2, '0')}-L${String(layer).padStart(2,'0')}-${phase}-${id}.png`;
      await page.mouse.move(0, 0);
      await page.screenshot({ path: resolve(output, filename), clip: rect, animations: 'disabled' });
      const title = await focus.locator(`option[value="${id}"]`).textContent();
      captures.push({ file: filename, title, layer, mode: mode(layer), phase, moduleId: id, width: Math.ceil(rect.width * 2), height: Math.ceil(rect.height * 2) });
      console.log(`已截图 ${filename}：${title}`);
    }
  }
  if (errors.length) throw new Error(`浏览器错误：${errors.join('\n')}`);
  const manifest = { model: 'DeepSeek V4.1-Flash', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), capturedAt: new Date().toISOString(), url: base, scope: '逐层主图全部模块与关键模式变体；同构层不重复截图', deviceScaleFactor: 2, captures };
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  await writeFile(resolve(output, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>架构图模块截图目录</title><style>body{font:16px system-ui;margin:30px;background:#f5f6f8}main{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}article{padding:14px;background:white;border:1px solid #ddd;border-radius:10px}img{width:100%;height:280px;object-fit:contain}a{color:#245c90}p{line-height:1.6}</style><h1>DeepSeek V4.1 · 模块截图</h1><p>${captures.length} 张双倍像素原图。点击图片打开原图；同构层不重复。层号、模式和模块名见每张标题。<br>小红书选图时优先使用紧凑模块；长图保留原图便于继续选取局部，不以缩小字号强塞一页。</p><main>${captures.map(c => `<article><h2>${escape(c.file.slice(0,2))} · ${escape(c.title)}</h2><p>第 ${c.layer} 层 · ${c.mode} · ${c.phase}<br>${escape(c.moduleId)}</p><a href="${c.file}"><img loading="lazy" src="${c.file}" alt="${escape(c.title)}"></a></article>`).join('')}</main></html>`);
  console.log(`完成：${captures.length} 张原图，目录 ${output}`);
} finally { await browser.close(); }
