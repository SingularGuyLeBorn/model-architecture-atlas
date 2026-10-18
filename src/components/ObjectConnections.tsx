import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Connection = {
  from: string;
  to: string;
  direction?:
    | "down"
    | "down-rows"
    | "right"
    | "right-down"
    | "left-down"
    | "down-left"
    | "join-left"
    | "join-right";
};
type Path = Connection & { d: string; tip: string };

/** 同一模块内的数据代理沿实际张量边界相连；方向由结构指定。 */
export function ObjectConnections({
  children,
  links,
}: {
  children: ReactNode;
  links: Connection[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<Path[]>([]);
  const definition = JSON.stringify(links);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const connections = JSON.parse(definition) as Connection[];
    const nodes = [
      ...root.querySelectorAll<HTMLElement>("[data-trace-object]"),
    ];
    const objects = new Map(
      nodes.map((node) => [node.dataset.traceObject!, node]),
    );
    const measure = () => {
      const outer = root.getBoundingClientRect();
      const scale = outer.width / root.offsetWidth;
      if (!scale) return;
      // 同一次布局内，每个对象/祖先只读取一次，所有读取先于 setState。
      const rects = new Map<Element, DOMRect>();
      const rect = (element: Element) => {
        let value = rects.get(element);
        if (!value) {
          value = element.getBoundingClientRect();
          rects.set(element, value);
        }
        return value;
      };
      const box = (id: string) => {
        const element = objects.get(id);
        if (!element) return null;
        const r = rect(element);
        const bounds = (selector: string) => {
          const parent = element.closest(selector);
          return parent ? rect(parent) : undefined;
        };
        const frame = bounds("[data-expanded-tensor], .architecture-fraction");
        const projection = bounds("[data-projection]");
        // 跨分组传递标量时，转弯通道按整个分组外沿计算，避开组内其余操作数。
        const routeElement = element.closest("[data-route-frame]");
        // 外层跨支路线绕过支路外沿；内部算子仍使用自己的局部通道。
        const routeFrame =
          routeElement && root.contains(routeElement)
            ? rect(routeElement)
            : undefined;
        return {
          x: (r.left + r.width / 2 - outer.left) / scale,
          top: (r.top - outer.top) / scale,
          bottom: (r.bottom - outer.top) / scale,
          left: (r.left - outer.left) / scale,
          right: (r.right - outer.left) / scale,
          y: (r.top + r.height / 2 - outer.top) / scale,
          corridorLeft:
            ((routeFrame?.left ?? frame?.left ?? r.left) - outer.left) / scale -
            8,
          corridorRight:
            ((routeFrame?.right ?? frame?.right ?? r.right) - outer.left) /
              scale +
            8,
          frameTop: ((frame?.top ?? r.top) - outer.top) / scale,
          // 输入落到矩阵内部元素时，横向转折留在矩阵上方，不能贴着外框顶边走。
          groupTop:
            ((projection?.top ?? frame?.top ?? r.top) - outer.top) / scale,
          groupBottom: ((projection?.bottom ?? r.bottom) - outer.top) / scale,
        };
      };
      const next = connections.flatMap((link, index) => {
        const from = box(link.from),
          to = box(link.to);
        if (!from || !to) return [];
        if (link.direction === "right-down" || link.direction === "left-down") {
          const peers = connections.filter(
            (item) => item.direction === link.direction,
          );
          const rank = peers.indexOf(link);
          // 矩阵内部取行先沿行轴离开表格，再在表下独立通道进入对应行代理。
          // [OM-FREEPLAY] 通道间距取 20px、箭头引入段至少 24px，与对应取行布局的留白配套。
          const left = link.direction === "left-down";
          const laneX = left
            ? from.corridorLeft - 20 * (rank + 1)
            : from.corridorRight + 20 * (rank + 1);
          const laneY = to.top - 24 - 20 * (peers.length - rank - 1);
          return [
            {
              ...link,
              d: `M${left ? from.left : from.right} ${from.y} H${laneX} V${laneY} H${to.x} V${to.top}`,
              tip: `M${to.x - 4} ${to.top - 6} L${to.x} ${to.top} L${to.x + 4} ${to.top - 6}`,
            },
          ];
        }
        if (link.direction === "join-left" || link.direction === "join-right") {
          // 先向下，再从目标左右侧接入；操作数与运算输出各用自己的通道。
          const left = link.direction === "join-left";
          const x = left ? to.left : to.right;
          const wing = left ? x - 6 : x + 6;
          return [
            {
              ...link,
              d: `M${from.x} ${from.bottom} V${to.y} H${x}`,
              tip: `M${wing} ${to.y - 4} L${x} ${to.y} L${wing} ${to.y + 4}`,
            },
          ];
        }
        if (link.direction === "down-left") {
          // 从结果下方出线，再从右侧进入分母；转弯留在两排之间，避开平方项和分子。
          const lane = to.corridorRight;
          const gapY = (from.bottom + to.frameTop) / 2;
          return [
            {
              ...link,
              d: `M${from.x} ${from.bottom} V${gapY} H${lane} V${to.y} H${to.right}`,
              tip: `M${to.right + 6} ${to.y - 4} L${to.right} ${to.y} L${to.right + 6} ${to.y + 4}`,
            },
          ];
        }
        if (link.direction === "right") {
          // [OM-FREEPLAY] 逐行转接使用独立通道，防止几条不同数据线叠成假汇合。
          // 上行接线从左向右排通道，下行反排；避免有序行之间出现可消除的交叉。
          const fraction = (index + 1) / (connections.length + 1);
          // 从真实行边界起线，转弯放在张量外的通道，不擦过同表的标题和其他行。
          const lane =
            from.corridorRight +
            (to.corridorLeft - from.corridorRight) *
              (from.y > to.y ? fraction : 1 - fraction);
          return [
            {
              ...link,
              d: `M${from.right} ${from.y} H${lane} V${to.y} H${to.left}`,
              tip: `M${to.left - 6} ${to.y - 4} L${to.left} ${to.y} L${to.left - 6} ${to.y + 4}`,
            },
          ];
        }
        // 投影输入/输出行比参数矩阵矮；转折要避开整组，不能擦过参数底边。
        let lane =
          from.groupBottom < to.groupTop
            ? (from.groupBottom + to.groupTop) / 2
            : (from.bottom + to.top) / 2;
        if (link.direction === "down-rows") {
          const peers = connections.filter(
            (item) => item.direction === "down-rows",
          );
          const fraction = (peers.indexOf(link) + 1) / (peers.length + 1);
          lane = from.groupBottom + (to.groupTop - from.groupBottom) * fraction;
        }
        return [
          {
            ...link,
            d: `M${from.x} ${from.bottom} V${lane} H${to.x} V${to.top}`,
            tip: `M${to.x - 4} ${to.top - 6} L${to.x} ${to.top} L${to.x + 4} ${to.top - 6}`,
          },
        ];
      });
      setPaths((current) =>
        current.length === next.length &&
        current.every(
          (path, i) =>
            path.from === next[i].from &&
            path.to === next[i].to &&
            path.direction === next[i].direction &&
            path.d === next[i].d &&
            path.tip === next[i].tip,
        )
          ? current
          : next,
      );
    };
    const observer = new ResizeObserver(measure);
    [root, ...nodes].forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [definition]);
  return (
    <div
      ref={rootRef}
      className="object-connections"
      data-object-link-count={links.length}
    >
      {children}
      <svg aria-hidden className="object-connections-lines">
        {paths.map((path, i) => (
          <g
            key={i}
            data-wire-connection
            data-object-link={`${path.from}:${path.to}`}
            data-direction={path.direction ?? "down"}
          >
            <path d={path.d} fill="none" stroke="#526a7a" strokeWidth="1.4" />
            <path d={path.tip} fill="none" stroke="#526a7a" strokeWidth="1.4" />
            <path
              d={path.d}
              fill="none"
              stroke="transparent"
              strokeWidth="12"
              data-wire-hit
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
