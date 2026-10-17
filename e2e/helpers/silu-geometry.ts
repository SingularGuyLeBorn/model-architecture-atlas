import type { Locator } from "@playwright/test";

/** 验证激活两支路、外部投影转接的全路径，而非只验证箭头端点。 */
export async function auditSiluGeometry(root: Locator) {
  return root.evaluate((scope) => {
    const issues: string[] = [];
    const flows = new Set<Element>();
    for (const silu of scope.querySelectorAll<HTMLElement>("[data-silu-row]")) {
      if (silu.querySelectorAll("[data-object-link]").length !== 6)
        issues.push("SiLU 的六条连接尚未完整生成");
      const scale = silu.getBoundingClientRect().width / silu.offsetWidth;
      const box = (id: string) =>
        silu
          .querySelector(`[data-trace-object="${id}"]`)!
          .getBoundingClientRect();
      const left = box("silu-identity"),
        right = box("silu-sigmoid"),
        join = box("silu-multiply");
      if (
        left.left + left.width / 2 >= join.left ||
        right.left + right.width / 2 <= join.right ||
        Math.abs(left.top + left.height / 2 - right.top - right.height / 2) /
          scale >
          1.5 ||
        join.top <= Math.max(left.bottom, right.bottom)
      )
        issues.push("SiLU 两操作数应并行，并从左右进入下方的乘号");
      flows.add(silu.querySelector(".object-connections")!);
      // 除同源分发外，不能把不同数据线重叠成假汇合，尤其是乘号输入与输出。
      const segments = [
        ...silu.querySelectorAll<SVGPathElement>(
          "[data-object-link] > path:first-child",
        ),
      ].flatMap((path) => {
        const id = path.parentElement!.getAttribute("data-object-link")!;
        let x = 0,
          y = 0;
        return (path.getAttribute("d")!.match(/[MHV][^MHV]+/g) ?? []).flatMap(
          (command) => {
            const values = command.slice(1).trim().split(/\s+/).map(Number);
            const nx = command[0] === "V" ? x : values[0];
            const ny = command[0] === "H" ? y : values.at(-1)!;
            const segment = command[0] === "M" ? [] : [{ id, x, y, nx, ny }];
            x = nx;
            y = ny;
            return segment;
          },
        );
      });
      for (const [i, a] of segments.entries()) {
        for (const b of segments.slice(i + 1)) {
          if (a.id.split(":")[0] === b.id.split(":")[0]) continue;
          const horizontal =
            a.y === a.ny && b.y === b.ny && Math.abs(a.y - b.y) < 0.5;
          const vertical =
            a.x === a.nx && b.x === b.nx && Math.abs(a.x - b.x) < 0.5;
          const overlap = horizontal
            ? Math.min(Math.max(a.x, a.nx), Math.max(b.x, b.nx)) -
              Math.max(Math.min(a.x, a.nx), Math.min(b.x, b.nx))
            : vertical
              ? Math.min(Math.max(a.y, a.ny), Math.max(b.y, b.ny)) -
                Math.max(Math.min(a.y, a.ny), Math.min(b.y, b.ny))
              : 0;
          if (overlap > 1) issues.push(`${a.id} 与 ${b.id} 错误共线`);
        }
      }
      let outer = silu.parentElement?.closest(".object-connections");
      while (outer && scope.contains(outer)) {
        flows.add(outer);
        outer = outer.parentElement?.closest(".object-connections");
      }
    }
    for (const flow of flows) {
      const scale =
        flow.getBoundingClientRect().width / (flow as HTMLElement).offsetWidth;
      for (const link of flow.querySelectorAll(
        ":scope > svg > [data-object-link]",
      )) {
        const ids = link.getAttribute("data-object-link")!.split(":");
        const objects = ids.map(
          (id) => flow.querySelector(`[data-trace-object="${id}"]`)!,
        );
        const path = link.querySelector<SVGPathElement>("path")!;
        const obstacles = [
          ...flow.querySelectorAll(
            "[data-expanded-tensor], .data-box, .architecture-note, .architecture-caption, .architecture-operator",
          ),
        ]
          .filter(
            (el) =>
              !objects.some((obj) => obj.contains(el) || el.contains(obj)),
          )
          .map((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return {
              rect: el.matches(".architecture-note, .architecture-caption")
                ? range.getBoundingClientRect()
                : el.getBoundingClientRect(),
              name: el.textContent?.slice(0, 45),
            };
          });
        for (let d = 1; d < path.getTotalLength(); d += 1) {
          const p = path
            .getPointAtLength(d)
            .matrixTransform(path.getScreenCTM()!);
          const hit = obstacles.find(
            ({ rect: r }) =>
              p.x > r.left + scale &&
              p.x < r.right - scale &&
              p.y > r.top + scale &&
              p.y < r.bottom - scale,
          );
          if (hit) {
            issues.push(`${ids.join("→")} 穿过 ${hit.name}`);
            break;
          }
        }
      }
    }
    return issues;
  });
}
