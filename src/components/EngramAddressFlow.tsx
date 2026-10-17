import { useLayoutEffect, useRef, useState } from "react";
import { COLORS } from "./diagram-primitives";
import { EngramHash } from "./EngramHash";
import {
  EngramDequantization,
  ENGRAM_ADDRESS_ROWS,
} from "./EngramDequantization";

type Wire = {
  from: string;
  to: string;
  kind: string;
  d: string;
  tip: string;
  color: string;
};

/** 三组地址沿行拼接；一个地址分支到两张表的同号行。端点随实际内容测量。 */
export function EngramAddressFlow({
  layer,
  rows,
}: {
  layer: number;
  rows: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const bounds = root.getBoundingClientRect(),
        scale = bounds.width / root.offsetWidth;
      if (!scale) return;
      const rect = (selector: string) => {
        const r = root.querySelector(selector)!.getBoundingClientRect();
        return {
          left: (r.left - bounds.left) / scale,
          right: (r.right - bounds.left) / scale,
          top: (r.top - bounds.top) / scale,
          bottom: (r.bottom - bounds.top) / scale,
          x: (r.left + r.width / 2 - bounds.left) / scale,
          y: (r.top + r.height / 2 - bounds.top) / scale,
        };
      };
      const next: Wire[] = [];
      const add = (
        from: string,
        to: string,
        kind: string,
        d: string,
        x: number,
        y: number,
        direction: "left" | "right" | "down",
        color = COLORS.amber,
      ) => {
        // [OM-FREEPLAY] 箭翼沿用内部导线的 5×4px，方向由目标端口确定。
        const tip =
          direction === "down"
            ? `M${x - 4} ${y - 5} L${x} ${y} L${x + 4} ${y - 5}`
            : direction === "left"
              ? `M${x + 5} ${y - 4} L${x} ${y} L${x + 5} ${y + 4}`
              : `M${x - 5} ${y - 4} L${x} ${y} L${x - 5} ${y + 4}`;
        next.push({ from, to, kind, d, tip, color });
      };
      const b = rect("[data-engram-addresses]"),
        hash = rect("[data-engram-hash]");
      [2, 3, 4].forEach((n, i) => {
        const from = `[data-engram-address-vector="${n}"]`,
          a = rect(from);
        const x = b.left + ((i + 1) * (b.right - b.left)) / 4;
        const y = hash.bottom + 16 + i * 12;
        add(
          from,
          "[data-engram-addresses]",
          "concat",
          `M${a.x} ${a.bottom} V${y} H${x} V${b.top}`,
          x,
          b.top,
          "down",
        );
      });
      ENGRAM_ADDRESS_ROWS.filter((index) => index.startsWith("b_")).forEach(
        (index) => {
          const from = `[data-engram-index="${index}"]`,
            a = rect(from);
          ["fp8", "scale"].forEach((table) => {
            const to = `[data-engram-row="${table}:${index}"] > [data-vector-elements]`,
              r = rect(to);
            const left = table === "fp8",
              x = left ? r.right : r.left;
            add(
              from,
              to,
              "select",
              `M${left ? a.left : a.right} ${a.y} H${x}`,
              x,
              r.y,
              left ? "left" : "right",
            );
          });
        },
      );
      [
        [
          "[data-engram-table]",
          "[data-dequant-values] [data-expanded-tensor]",
          COLORS.indigo,
        ],
        [
          "[data-engram-scale-table]",
          "[data-dequant-scales] [data-expanded-tensor]",
          COLORS.ochre,
        ],
      ].forEach(([from, to, color]) => {
        const a = rect(from),
          r = rect(to);
        const y =
          rect("[data-engram-table-pair]").bottom +
          (color === COLORS.indigo ? 22 : 40);
        add(
          from,
          to,
          "read",
          `M${a.x} ${a.bottom} V${y} H${r.x} V${r.top}`,
          r.x,
          r.top,
          "down",
          color,
        );
      });
      setWires((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    const observer = new ResizeObserver(measure);
    [
      root,
      ...root.querySelectorAll<HTMLElement>(
        "[data-engram-address-vector], [data-engram-index], [data-engram-row], [data-engram-table-pair], [data-expanded-tensor]",
      ),
    ].forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [layer, rows]);
  return (
    <div
      ref={ref}
      data-engram-address-flow
      style={{
        position: "relative",
        display: "grid",
        gap: 64,
        justifyItems: "center",
      }}
    >
      <EngramHash layer={layer} />
      <EngramDequantization layer={layer} rows={rows} />
      <svg
        aria-hidden
        data-engram-address-wires
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          overflow: "visible",
        }}
      >
        {wires.map((w, i) => (
          <g key={i} data-wire-path>
            <path
              data-engram-address-link={w.kind}
              data-source={w.from}
              data-target={w.to}
              d={w.d}
              fill="none"
              stroke={w.color}
              strokeWidth={1.5}
            />
            <path d={w.tip} fill="none" stroke={w.color} strokeWidth={1.5} />
            <path
              data-wire-hit
              d={w.d}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
