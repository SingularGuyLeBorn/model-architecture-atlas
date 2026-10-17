import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Connection = {
  from: string;
  to: string;
  direction?: "down" | "right" | "down-left";
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
    const measure = () => {
      const outer = root.getBoundingClientRect();
      const scale = outer.width / root.offsetWidth;
      if (!scale) return;
      const box = (id: string) => {
        const element = nodes.find((node) => node.dataset.traceObject === id);
        if (!element) return null;
        const r = element.getBoundingClientRect();
        const frame = element
          .closest("[data-expanded-tensor], .architecture-fraction")
          ?.getBoundingClientRect();
        return {
          x: (r.left + r.width / 2 - outer.left) / scale,
          top: (r.top - outer.top) / scale,
          bottom: (r.bottom - outer.top) / scale,
          left: (r.left - outer.left) / scale,
          right: (r.right - outer.left) / scale,
          y: (r.top + r.height / 2 - outer.top) / scale,
          corridorLeft: ((frame?.left ?? r.left) - outer.left) / scale - 8,
          corridorRight: ((frame?.right ?? r.right) - outer.left) / scale + 8,
          frameTop: ((frame?.top ?? r.top) - outer.top) / scale,
        };
      };
      const next = connections.flatMap((link, index) => {
        const from = box(link.from),
          to = box(link.to);
        if (!from || !to) return [];
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
        const lane = (from.bottom + to.top) / 2;
        return [
          {
            ...link,
            d: `M${from.x} ${from.bottom} V${lane} H${to.x} V${to.top}`,
            tip: `M${to.x - 4} ${to.top - 6} L${to.x} ${to.top} L${to.x + 4} ${to.top - 6}`,
          },
        ];
      });
      setPaths((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
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
            data-object-link={`${path.from}:${path.to}`}
            data-direction={path.direction ?? "down"}
          >
            <path d={path.d} fill="none" stroke="#526a7a" strokeWidth="1.4" />
            <path d={path.tip} fill="none" stroke="#526a7a" strokeWidth="1.4" />
          </g>
        ))}
      </svg>
    </div>
  );
}
