// 验证反例册的引用、编号与原图资产；不把文档完整性当成架构图正确性。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const skill = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(skill, '../../..');
const refs = resolve(skill, 'references');
const casebook = readFileSync(resolve(refs, 'counterexamples.md'), 'utf8');
const guide = readFileSync(resolve(refs, 'inspection-playbook.md'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(refs, 'counterexample-assets.json'), 'utf8'));
const families = [...casebook.matchAll(/<a id="case-(\d+)"/g)].map(m => m[1]);
assert.deepEqual(families, Array.from({ length: 18 }, (_, i) => String(i + 1).padStart(2, '0')));
const patterns = [...casebook.matchAll(/^\| (\d{2}\.[a-z]) \|/gm)].map(m => m[1]);
assert.equal(new Set(patterns).size, patterns.length, '子案例编号重复');
for (const family of families) {
  assert(patterns.some(id => id.startsWith(`${family}.`)), `类别${family}没有子案例`);
}
for (const match of casebook.matchAll(/\]\(#case-(\d+)\)/g)) {
  assert(families.includes(match[1]), `不存在的类别索引${match[1]}`);
}

const images = new Set();
for (const [filename, content] of [['counterexamples.md', casebook], ['inspection-playbook.md', guide]]) {
  for (const match of content.matchAll(/(!?)\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[2].split('#')[0];
    if (!target || /^https?:/.test(target)) continue;
    const path = resolve(refs, decodeURIComponent(target));
    assert(existsSync(path), `${filename}引用不存在：${target}`);
    if (match[1]) images.add(target);
  }
  for (const match of content.matchAll(/`((?:e2e|tests)\/[^`]+\.(?:ts|tsx))`/g)) {
    assert(existsSync(resolve(repo, match[1])), `测试文件不存在：${match[1]}`);
  }
}

const ids = new Set();
const files = new Set();
const dimensions = [];
let totalBytes = 0;
for (const asset of manifest.assets) {
  assert(!ids.has(asset.id), `重复图片ID：${asset.id}`);
  assert(!files.has(asset.file), `重复图片文件：${asset.file}`);
  ids.add(asset.id);
  files.add(asset.file);
  assert(images.has(asset.file), `登记图片未用于正文：${asset.file}`);
  assert(asset.cases.length > 0 && asset.cases.every(id => families.includes(id)));
  assert(['negative', 'scoped-positive'].includes(asset.role));
  assert(['user-attachment', 'local-check'].includes(asset.sourceKind));
  assert(asset.source && !asset.source.includes('..'), '来源必须是附件名或仓库内已知产物路径');
  const path = resolve(refs, asset.file);
  assert(relative(resolve(refs, 'counterexamples'), path).match(/^[^./\\][^/\\]*\.png$/), '图片必须位于反例资产目录');
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `PNG签名错误：${asset.file}`);
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert(width > 0 && height > 0, `图片尺寸无效：${asset.file}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `原图字节变化：${asset.file}`);
  dimensions.push({ file: asset.file, width, height });
  totalBytes += bytes.length;
}
assert.deepEqual([...images].sort(), [...files].sort(), '正文图片与登记不一致');
const actual = readdirSync(resolve(refs, 'counterexamples')).map(name => `counterexamples/${name}`).sort();
assert.deepEqual(actual, [...files].sort(), '资产目录有漏登记或多余文件');
console.log(JSON.stringify({ status: '通过：仅案例库完整性', families: families.length, patterns: patterns.length, images: files.size, totalBytes, dimensions }, null, 2));
