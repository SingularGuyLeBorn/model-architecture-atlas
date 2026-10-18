export function inspectIdentityContinuity(
  samples: { variable: string; fill: string; stage: string | null }[],
) {
  const identity = new Map<string, { fill: string; stage: string | null }>();
  const issues: { rule: string; variable: string; detail: string }[] = [];
  for (const object of samples) {
    const previous = identity.get(object.variable);
    if (previous && previous.fill !== object.fill)
      issues.push({
        rule: "object-identity",
        variable: object.variable,
        detail: `${previous.stage}:${previous.fill} → ${object.stage}:${object.fill}`,
      });
    else identity.set(object.variable, object);
  }
  return issues;
}

/** 读取实际渲染的三个操作数，而非相信组件 props 或测试专用形状元数据。 */
export function inspectProjectionContracts(scope: Element) {
  const issues: { rule: string; variable: string; detail: string }[] = [];
  let checked = 0;
  for (const equation of scope.querySelectorAll("[data-linear-projection]")) {
    checked++;
    const tensors = [...equation.children].flatMap((child) =>
      child.classList.contains("architecture-object")
        ? [...child.querySelectorAll("[data-expanded-tensor]")]
        : [],
    );
    const names = tensors.map(
      (tensor) =>
        tensor
          .querySelector("header [aria-label]")
          ?.getAttribute("aria-label") ?? "?",
    );
    const dimensions = tensors.map((tensor) => {
      const shape =
        tensor
          .querySelector("header small [aria-label]")
          ?.getAttribute("aria-label") ?? "";
      return shape.split("\\times").map((part) => Number(part.trim()));
    });
    if (
      tensors.length !== 3 ||
      dimensions.some(
        (shape) =>
          shape.length !== 2 ||
          shape.some((n) => !Number.isFinite(n) || n <= 0),
      )
    ) {
      issues.push({
        rule: "projection-shape",
        variable: names.join(" → "),
        detail: "投影缺少三个真实操作数及正整数二维形状",
      });
      continue;
    }
    const [input, weight, output] = dimensions;
    if (
      input[0] !== output[0] ||
      input[1] !== weight[0] ||
      weight[1] !== output[1]
    )
      issues.push({
        rule: "projection-dimensions",
        variable: names.join(" → "),
        detail: JSON.stringify(dimensions),
      });
    for (const [i, tensor] of tensors.entries()) {
      const rows = [...tensor.querySelectorAll(".tensor-row")];
      const realRows = dimensions[i][0];
      const realColumns = dimensions[i][1];
      if (
        rows.length < Math.min(3, realRows) ||
        rows.some(
          (row) =>
            row.querySelectorAll("[data-vector-cell]").length <
            Math.min(3, realColumns),
        )
      )
        issues.push({
          rule: "projection-representatives",
          variable: names[i],
          detail: "缺少首、次、末代表行或元素",
        });
    }
    const paint = (tensor: Element) => {
      const cell = tensor.querySelector("[data-vector-cell]");
      return cell ? getComputedStyle(cell) : null;
    };
    const before = paint(tensors[0]),
      after = paint(tensors[2]);
    if (
      names[0] !== names[2] &&
      before &&
      after &&
      before.backgroundColor === after.backgroundColor
    )
      issues.push({
        rule: "projection-colors",
        variable: names.join(" → "),
        detail: before.backgroundColor,
      });
  }
  const identities = [
    ...scope.querySelectorAll("[data-expanded-tensor]"),
  ].flatMap((tensor) => {
    const variable = tensor
      .querySelector("header [aria-label]")
      ?.getAttribute("aria-label");
    const colors = [...tensor.querySelectorAll("[data-vector-cell]")]
      .filter((cell) => !cell.closest(".picked"))
      .map((cell) => getComputedStyle(cell).backgroundColor);
    const unique = [...new Set(colors)];
    // 混合来源矩阵和数学选区另查，不把合法选中状态当成身份换色。
    return variable && unique.length === 1
      ? [{ variable, fill: unique[0] }]
      : [];
  });
  return { checked, issues, identities };
}
