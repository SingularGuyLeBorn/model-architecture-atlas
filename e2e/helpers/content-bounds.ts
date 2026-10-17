import type { Locator } from "@playwright/test";

/** 在实际模块内检查数据/公式到每一级边框及裁切祖先，不把画布视口当数据容器。 */
export async function auditContentBounds(root: Locator) {
  return root.evaluate((scope) => {
    const issues: { content: string; ancestor: string; sides: string[] }[] = [];
    const scale =
      scope.getBoundingClientRect().width / (scope as HTMLElement).offsetWidth;
    const describe = (el: Element) =>
      el.getAttribute("aria-label") ??
      [...el.attributes]
        .filter((a) => a.name.startsWith("data-"))
        .map((a) => `${a.name}=${a.value}`)
        .join(" ") ??
      el.tagName;
    const targets = scope.querySelectorAll<HTMLElement>(
      "[data-vector-cell], [data-vector-selected], [data-expanded-tensor], math",
    );
    for (const target of targets) {
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = getComputedStyle(target);
      const outline =
        style.outlineStyle === "none"
          ? 0
          : Math.max(
              0,
              parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth),
            ) * scale;
      for (
        let ancestor = target.parentElement;
        ancestor;
        ancestor = ancestor.parentElement
      ) {
        const css = getComputedStyle(ancestor);
        const framed = parseFloat(css.borderLeftWidth) > 0;
        const clipX = /hidden|clip|auto|scroll/.test(css.overflowX);
        const clipY = /hidden|clip|auto|scroll/.test(css.overflowY);
        // KaTeX 内部的行高并非数据边界；只检查真实容器，不检查公式内部排版盒。
        if (
          !ancestor.closest(".katex") &&
          (framed || clipX || clipY || ancestor === scope)
        ) {
          const box = ancestor.getBoundingClientRect();
          const tolerance = 1 * scale; // 浏览器布局单位及边框舍入容差，不按屏幕缩放放宽。
          const sides: string[] = [];
          if (framed || clipX || ancestor === scope) {
            if (
              rect.left - outline <
              box.left + parseFloat(css.borderLeftWidth) * scale - tolerance
            )
              sides.push("left");
            if (
              rect.right + outline >
              box.right - parseFloat(css.borderRightWidth) * scale + tolerance
            )
              sides.push("right");
          }
          if (framed || clipY || ancestor === scope) {
            if (
              rect.top - outline <
              box.top + parseFloat(css.borderTopWidth) * scale - tolerance
            )
              sides.push("top");
            if (
              rect.bottom + outline >
              box.bottom - parseFloat(css.borderBottomWidth) * scale + tolerance
            )
              sides.push("bottom");
          }
          if (sides.length)
            issues.push({
              content: describe(target.closest("[aria-label]") ?? target),
              ancestor: describe(ancestor),
              sides,
            });
        }
        if (ancestor === scope) break;
      }
    }
    return { checked: targets.length, issues };
  });
}
