import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (args = []) =>
  spawnSync(
    process.execPath,
    ["scripts/audit-session-requirements.mjs", ...args],
    { encoding: "utf8" },
  );
const normal = run();
assert.equal(normal.status, 0, normal.stdout + normal.stderr);
for (const [fault, message] of [
  ["missing-check", "检查入口不存在"],
  ["missing-spec", "规范不存在"],
  ["missing-anchor", "规范锚点不存在"],
  ["duplicate-id", "编号重复"],
]) {
  const result = run([`--inject=${fault}`]);
  assert.equal(result.status, 1, `${fault} 没有导致追踪校验失败`);
  assert.ok(
    result.stdout.includes(message),
    `${fault} 没有检出对应错误：${result.stdout}`,
  );
  console.log(`${fault}: 检出 ${message}`);
}
console.log("4 类台账故障注入通过；不代表页面故障检出或行为验收通过。");
