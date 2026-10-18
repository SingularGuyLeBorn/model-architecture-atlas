import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Project,
  Row,
  architectureTone,
} from "../src/templates/architecture-blocks";
import {
  inspectProjectionContracts,
  inspectIdentityContinuity,
} from "../e2e/helpers/projection-contracts";

const fixture = () => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <>
      <Project
        input="x_{4,t}"
        weight="W_{4}"
        output="o_{4,t}"
        from={512}
        to={128}
        inputTone="blue"
        tone="coral"
      />
      <Row name="o_{4,t}" size={128} tone="coral" />
    </>,
  );
  document.body.append(root);
  return root;
};

it("投影检查器读取真实 DOM，正常矩阵乘法及消费代理通过", () => {
  const root = fixture();
  try {
    const report = inspectProjectionContracts(root);
    expect(report.checked).toBe(1);
    expect(report.issues).toEqual([]);
    expect(
      inspectIdentityContinuity(
        report.identities.map((item) => ({ ...item, stage: "fixture" })),
      ),
    ).toEqual([]);
  } finally {
    root.remove();
  }
});

it.each([
  ["错误的内维", "projection-dimensions"],
  ["单列冒充整矩阵", "projection-dimensions"],
  ["只有首末项", "projection-representatives"],
  ["输入输出同色", "projection-colors"],
] as const)("故障注入 %s 必须由正常检查器检出 %s", (fault, rule) => {
  const root = fixture();
  try {
    const tensors = root.querySelectorAll("[data-expanded-tensor]");
    if (fault === "错误的内维" || fault === "单列冒充整矩阵")
      tensors[1]
        .querySelector("header small [aria-label]")!
        .setAttribute(
          "aria-label",
          fault === "错误的内维" ? "7\\times128" : "512\\times1",
        );
    else if (fault === "只有首末项")
      tensors[0].querySelectorAll("[data-vector-cell]")[1].remove();
    else
      (
        tensors[2].querySelector("[data-vector-cell]") as HTMLElement
      ).style.backgroundColor = getComputedStyle(
        tensors[0].querySelector("[data-vector-cell]")!,
      ).backgroundColor;
    expect(
      inspectProjectionContracts(root).issues.some(
        (issue) => issue.rule === rule,
      ),
    ).toBe(true);
  } finally {
    root.remove();
  }
});

it("故障注入：同一个 o 的消费代理换色会被身份连续性检查检出", () => {
  const root = fixture();
  try {
    const last = root.querySelectorAll("[data-expanded-tensor]")[3];
    for (const cell of last.querySelectorAll<HTMLElement>("[data-vector-cell]"))
      cell.style.backgroundColor = "rgb(1, 2, 3)";
    const report = inspectProjectionContracts(root);
    const issues = inspectIdentityContinuity(
      report.identities.map((item) => ({ ...item, stage: "fixture" })),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].variable).toBe("o_{4,t}");
    expect(issues[0].rule).toBe("object-identity");
  } finally {
    root.remove();
  }
});

it("低秩 Query 与输出投影的身份色由生成消费两端共用", () => {
  expect(architectureTone("x_{4,t}")).not.toBe(
    architectureTone("\\widehat q^{low}_{4,t}"),
  );
  expect(architectureTone("q^{low}_{4,t}")).not.toBe(
    architectureTone("\\widetilde q_{4,t}"),
  );
  expect(architectureTone("o^{cat}_{4,t}")).not.toBe(
    architectureTone("o^A_{4,t}"),
  );
  expect(architectureTone("o^A_{4,t}")).toBe(architectureTone("o^{A}_{4,t}"));
});
