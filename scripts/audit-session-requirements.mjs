import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import ts from "typescript";
import {
  requirements as recordedRequirements,
  sessionFileName,
  dispositions,
} from "./session-requirements.mjs";

const args = process.argv.slice(2);
const requirements = structuredClone(recordedRequirements);
const injected = args.find((arg) => arg.startsWith("--inject="))?.slice(9);
if (injected === "missing-check")
  requirements[0].tests = ["e2e/nonexistent-requirement-check.spec.ts"];
if (injected === "missing-spec")
  requirements[0].spec = "nonexistent-contract.md#missing";
if (injected === "missing-anchor")
  requirements[0].spec = "structure-semantics.md#nonexistent-contract";
if (injected === "duplicate-id") requirements[1].id = requirements[0].id;
const session = args.find((arg) => arg.startsWith("--session="))?.slice(10);
const output = resolve(
  `artifacts/session-requirements${injected ? `-${injected}` : ""}`,
);
await mkdir(output, { recursive: true });
const files = new Map();
const errors = [];
for (const rule of requirements) {
  if (requirements.filter((other) => other.id === rule.id).length !== 1)
    errors.push(`${rule.id}: 编号重复`);
  const specPath = `.agents/skills/model-architecture-viz/references/${rule.spec.split("#")[0]}`;
  const contract = await readFile(specPath, "utf8").catch(() => {
    errors.push(`${rule.id}: 规范不存在 ${specPath}`);
    return "";
  });
  const anchor = rule.spec.split("#")[1];
  const headings = [...contract.matchAll(/^#+ (.+)$/gm)].map((match) =>
    match[1]
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s/g, "-"),
  );
  if (contract && anchor && !headings.includes(anchor))
    errors.push(`${rule.id}: 规范锚点不存在 ${rule.spec}`);
  for (const file of rule.tests) {
    if (files.has(file)) continue;
    const source = await readFile(file, "utf8").catch(() => {
      errors.push(`${rule.id}: 检查入口不存在 ${file}`);
      return "";
    });
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const assertions = [];
    function visit(node) {
      // 保留具体断言与行号供审阅；不把数量作为覆盖或通过证明。
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        /^(?:to[A-Z]|not$)/.test(node.expression.name.text)
      ) {
        const text = node.getText(ast);
        if (
          text.includes("expect") ||
          /(?:expect|assert)/.test(node.expression.expression.getText(ast))
        )
          assertions.push({
            line:
              ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
            text,
          });
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    files.set(file, {
      sha256: createHash("sha256").update(source).digest("hex"),
      assertions,
    });
  }
}
const history = [];
if (session) {
  if (basename(session) !== sessionFileName)
    throw new Error("不是台账记录的原始会话；需要显式迁移来源编号");
  let ordinal = 0;
  for await (const line of createInterface({
    input: createReadStream(session),
    crlfDelay: Infinity,
  })) {
    if (!line) continue;
    if (
      !/"type"\s*:\s*"response_item"/.test(line) ||
      !/"role"\s*:\s*"user"/.test(line)
    )
      continue;
    const entry = JSON.parse(line);
    if (
      entry.type !== "response_item" ||
      entry.payload?.type !== "message" ||
      entry.payload.role !== "user"
    )
      continue;
    ordinal++;
    if (ordinal > 335) continue; // 台账版本截止于首次要求阅读历史；后续任务单独追加。
    let text = entry.payload.content
      .filter((block) => block.type === "input_text")
      .map((block) => block.text)
      .join("\n");
    if (
      text.includes("<codex_internal_context") ||
      /^# AGENTS.md|^<environment_context>|^<external_codex_apps_open_page>/.test(
        text,
      )
    )
      continue;
    text = text
      .replace(/<in-app-browser-context[\s\S]*?<\/in-app-browser-context>/g, "")
      .replace(/<image [\s\S]*?<\/image>/g, "[附件]");
    text = text
      .replace(/# Files mentioned by the user:[\s\S]*?## My request:/, "")
      .replace(/^\s*## My request:/, "")
      .trim();
    const mapped = requirements
      .filter((rule) => rule.sources.includes(ordinal))
      .map((rule) => rule.id);
    history.push({
      ordinal,
      timestamp: entry.timestamp,
      sha256: createHash("sha256").update(text).digest("hex"),
      text,
      requirements: mapped,
      disposition: mapped.length
        ? "mapped-requires-assertion-review"
        : (dispositions[ordinal] ?? "unclassified-needs-review"),
    });
  }
  for (const rule of requirements)
    for (const source of rule.sources)
      if (!history.some((message) => message.ordinal === source))
        errors.push(`${rule.id}: 原始用户消息 ${source} 不存在或被过滤`);
}
const report = {
  source: sessionFileName,
  warning:
    "静态追踪清单，不是通过报告。每项仍需核对具体断言的语义范围、故障检出和真实运行。原始用户正文仅写入本地 artifacts，不提交。",
  requirements: requirements.map((rule) => ({
    ...rule,
    checks: rule.tests.map((file) => ({ file, ...files.get(file) })),
    status: "requires-scope-mutation-and-run-evidence",
  })),
  history,
  errors,
};
await writeFile(resolve(output, "audit.json"), JSON.stringify(report, null, 2));
await writeFile(
  resolve(output, "requirements.md"),
  [
    "# Session 要求与检测追踪",
    "",
    report.warning,
    "",
    "| ID | 历史消息 | 要求 | Skill 条目 | 实际检查入口 |",
    "|---|---|---|---|---|",
    ...requirements.map(
      (rule) =>
        `| ${rule.id} | ${rule.sources.join(", ")} | ${rule.requirement} | ${rule.spec} | ${rule.tests.join("、")} |`,
    ),
    "",
    "具体断言行号、源码哈希及尚未分类的历史消息见同目录 audit.json。不能据此宣称执行通过。",
  ].join("\n"),
);
console.log(
  JSON.stringify(
    {
      requirements: requirements.length,
      checkFiles: files.size,
      assertions: [...files.values()].reduce(
        (sum, file) => sum + file.assertions.length,
        0,
      ),
      historicalMessages: history.length,
      unclassified: history
        .filter(
          (message) => message.disposition === "unclassified-needs-review",
        )
        .map((message) => message.ordinal),
      errors,
      output,
    },
    null,
    2,
  ),
);
if (errors.length) process.exitCode = 1;
