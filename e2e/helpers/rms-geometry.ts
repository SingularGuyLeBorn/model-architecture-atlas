import type { Locator } from "@playwright/test";

/** 检查 RMS 的真实求和端点，以及分母线的全路径，不只检查两端。 */
export async function auditRmsGeometry(root: Locator) {
  return root.evaluate((scope) => {
    const issues: string[] = [];
    for (const rms of scope.querySelectorAll<HTMLElement>(
      ".architecture-rms",
    )) {
      const scale = rms.getBoundingClientRect().width / rms.offsetWidth;
      const point = (path: SVGPathElement, distance: number) =>
        path.getPointAtLength(distance).matrixTransform(path.getScreenCTM()!);
      const sum = rms.querySelector("[data-stacked-sum]")!;
      for (const path of sum.querySelectorAll<SVGPathElement>(
        "[data-sum-input]",
      )) {
        const index = path.getAttribute("data-sum-input");
        const operand = sum
          .querySelector(`[data-sum-operand="${index}"] > .data-box`)!
          .getBoundingClientRect();
        const start = point(path, 0);
        if (
          Math.hypot(
            start.x - operand.right,
            start.y - operand.top - operand.height / 2,
          ) /
            scale >
          1.5
        )
          issues.push(`平方项 ${index} 的输入线没有贴合真实边框`);
        const end = point(path, path.getTotalLength());
        const sigma = sum
          .querySelector("[data-sum-node]")!
          .getBoundingClientRect();
        const atEdge = Math.min(
          Math.abs(end.x - sigma.left),
          Math.abs(end.x - sigma.right),
          Math.abs(end.y - sigma.top),
          Math.abs(end.y - sigma.bottom),
        );
        if (
          atEdge / scale > 1.5 ||
          end.x < sigma.left - scale ||
          end.x > sigma.right + scale ||
          end.y < sigma.top - scale ||
          end.y > sigma.bottom + scale
        )
          issues.push(`平方项 ${index} 未接入 Σ 边界`);
      }
      const output = sum.querySelector<SVGPathElement>("[data-sum-output]")!;
      const end = point(output, output.getTotalLength());
      const result = rms
        .querySelector("[data-rms-square-sum] > .data-box")!
        .getBoundingClientRect();
      if (
        Math.hypot(
          end.x - result.left,
          end.y - result.top - result.height / 2,
        ) /
          scale >
        1.5
      )
        issues.push("Σ 输出未接到平方和 s");
      const wire = rms.querySelector<SVGPathElement>(
        '[data-object-link="rms-root:rms-denominator"] > path',
      );
      if (!wire) {
        issues.push("缺少分母连接线");
        continue;
      }
      const obstacles = [
        ...rms.querySelectorAll(
          ".data-box, [data-expanded-tensor], .architecture-note, .architecture-caption",
        ),
      ]
        .filter(
          (el) =>
            !el.closest(
              '[data-trace-object="rms-root"], [data-trace-object="rms-denominator"]',
            ),
        )
        .map((el) => ({
          rect: el.getBoundingClientRect(),
          name: el.textContent?.slice(0, 35),
        }));
      for (let distance = 0; distance <= wire.getTotalLength(); distance += 1) {
        const p = point(wire, distance);
        const hit = obstacles.find(
          ({ rect: r }) =>
            p.x > r.left + scale &&
            p.x < r.right - scale &&
            p.y > r.top + scale &&
            p.y < r.bottom - scale,
        );
        if (hit) {
          issues.push(`分母线穿过 ${hit.name}`);
          break;
        }
      }
    }
    return issues;
  });
}
