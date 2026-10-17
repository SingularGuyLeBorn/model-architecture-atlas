import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Connection = { from: string; to: string; direction?: "down" | "right" };
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
        return {
          x: (r.left + r.width / 2 - outer.left) / scale,
          top: (r.top - outer.top) / scale,
          bottom: (r.bottom - outer.top) / scale,
          left: (r.left - outer.left) / scale,
          right: (r.right - outer.left) / scale,
          y: (r.top + r.height / 2 - outer.top) / scale,
        };
      };
      const next = connections.flatMap((link, index) => {
        const from = box(link.from),
          to = box(link.to);
        if (!from || !to) return [];
        if (link.direction === "right") {
          // [OM-FREEPLAY] 逐行转接使用独立通道，防止几条不同数据线叠成假汇合。
          const lane =
            from.right +
            (to.left - from.right) *
              (1 - (index + 1) / (connections.length + 1));
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
