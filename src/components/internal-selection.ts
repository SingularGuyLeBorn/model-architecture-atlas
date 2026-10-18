export type InternalSelection = {
  kind: "box" | "wire";
  tex?: string;
  description: string;
};

/** 一条连接可以跨多个 SVG；按所属运算与连接标识同步选中，不能只染命中的线段。 */
export function setInternalSelected(
  element: Element | null,
  selected: boolean,
) {
  if (!element) return;
  const key = element.getAttribute("data-wire-key");
  const scope = element.closest("[data-wire-scope]");
  const parts =
    key && scope
      ? [...scope.querySelectorAll("[data-wire-key]")].filter(
          (part) =>
            part.getAttribute("data-wire-key") === key &&
            part.closest("[data-wire-scope]") === scope,
        )
      : [element];
  for (const part of parts) {
    if (selected) part.setAttribute("data-internal-selected", "true");
    else part.removeAttribute("data-internal-selected");
  }
}

/** KaTeX 的变量框可含多层上下标；按配对花括号读取，不能用扁平正则截断。 */
function boxedVariables(tex: string) {
  const values: string[] = [];
  for (let cursor = 0; cursor < tex.length; ) {
    const start = tex.indexOf("\\boxed{", cursor);
    if (start < 0) break;
    let end = start + 7,
      depth = 1;
    for (; end < tex.length && depth; end++) {
      if (tex[end] === "{" && tex[end - 1] !== "\\") depth++;
      if (tex[end] === "}" && tex[end - 1] !== "\\") depth--;
    }
    if (!depth) values.push(tex.slice(start + 7, end - 1));
    cursor = end;
  }
  return values;
}

/** 按点击位置选择最内层对象；父框只提供解释上下文。 */
export function inspectInternalTarget(
  target: EventTarget | null,
  root: Element,
): { element: Element; detail: InternalSelection } | undefined {
  if (
    !(target instanceof Element) ||
    target.closest(".react-flow__handle, button, input")
  )
    return;
  const variable = target.closest("menclose[notation='box']");
  if (variable && root.contains(variable)) {
    const formula = variable.closest("[aria-label]");
    const index = [
      ...(formula?.querySelectorAll("menclose[notation='box']") ?? []),
    ].indexOf(variable);
    return {
      element: variable,
      detail: {
        kind: "box",
        tex: boxedVariables(formula?.getAttribute("aria-label") ?? "")[index],
        description:
          "这个小框表示运算中的输入变量；外侧的底数、分式和运算符说明如何使用它。变量的来源与所属模块见下文。",
      },
    };
  }
  const wire = target.closest("path, line, polyline");
  if (wire && root.contains(wire) && !wire.closest("defs")) {
    const input =
      wire.getAttribute("data-sum-input") ??
      wire.getAttribute("data-wire-input") ??
      wire
        .closest("[data-wire-connection]")
        ?.querySelector("[data-sum-input]")
        ?.getAttribute("data-sum-input") ??
      null;
    const sum = wire.closest("[data-stacked-sum], [data-sum-junction]");
    const operand =
      input !== null
        ? sum?.querySelector(`[data-sum-operand="${input}"]`)
        : null;
    const tex =
      operand?.querySelector("[aria-label]")?.getAttribute("aria-label") ??
      undefined;
    return {
      element:
        wire.closest("[data-wire-connection]") ??
        (wire.hasAttribute("data-wire-hit")
          ? (wire.parentElement?.querySelector("path:not([data-wire-hit])") ??
            wire)
          : wire),
      detail: {
        kind: "wire",
        tex,
        description:
          input !== null
            ? sum?.getAttribute("data-operator") === "xor"
              ? `第 ${Number(input) + 1} 路整数操作数沿箭头进入按位异或，结果从独立出口送往下方哈希中间值。`
              : `第 ${Number(input) + 1} 路输入沿箭头进入累加器，参与逐元素求和；结果从独立出口送往下方结果框。`
            : "这条连线按箭头方向传递相邻数据框的值。输入端给出来源，箭头端给出接收该值的运算或结果框。",
      },
    };
  }
  let current: Element | null = target;
  while (current && current !== root) {
    // 顶层模块外框仍交给原有模块选择；此处只识别内部对象。
    if (current.parentElement?.hasAttribute("data-boundary-connectable"))
      return;
    if (
      current instanceof HTMLElement &&
      (current.style.border ||
        current.matches(
          "[data-sum-node], [data-expanded-tensor], [data-vector-cell], .scalar, .data-box",
        ))
    ) {
      const tex =
        current.querySelector("span[aria-label]")?.getAttribute("aria-label") ??
        undefined;
      return {
        element: current,
        detail: {
          kind: "box",
          tex,
          description: current.hasAttribute("data-sum-node")
            ? current.getAttribute("data-operator") === "xor"
              ? "此处将各入口传入的整数逐位异或，生成哈希中间值；每条输入线对应一个乘数与 token ID 的乘积。"
              : "此处将各入口传入的操作数逐元素相加，结果沿出口传给后续数据框。每条输入线对应一项操作数。"
            : current.hasAttribute("data-expanded-tensor")
              ? "这个数据框展示该对象的行列组成；角落标注整体形状，内部小格给出代表元素及其索引。它在所属模块中的来源与用途见下文。"
              : "所选小框表示公式中的这一项。上下标对应图中的层、路、行或列索引；它参与的运算与所属模块的变量定义见下文。",
        },
      };
    }
    current = current.parentElement;
  }
}
