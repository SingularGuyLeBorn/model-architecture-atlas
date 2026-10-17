import { useLayoutEffect, useRef, useState } from "react";
import { COLORS } from "./diagram-primitives";
import { EngramHash } from "./EngramHash";
import {
  ENGRAM_DEQUANT_ROW,
  ENGRAM_DEQUANT_BLOCKS,
} from "./EngramRowDequantization";
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
        direction: "left" | "right" | "down" | "up",
        color = COLORS.amber,
      ) => {
        // [OM-FREEPLAY] 箭翼沿用内部导线的 5×4px，方向由目标端口确定。
        const tip =
          direction === "down"
            ? `M${x - 4} ${y - 5} L${x} ${y} L${x + 4} ${y - 5}`
            : direction === "up"
              ? `M${x - 4} ${y + 5} L${x} ${y} L${x + 4} ${y + 5}`
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
      ["fp8", "scale"].forEach((table) => {
        const from = `[data-engram-row="${table}:${ENGRAM_DEQUANT_ROW}"] > [data-vector-elements]`;
        const to = `[data-dequant-${table === "fp8" ? "values" : "scales"}] [data-expanded-tensor]`;
        const a = rect(from),
          r = rect(to),
          left = table === "fp8";
        const frame = rect(
          left ? "[data-engram-table]" : "[data-engram-scale-table]",
        );
        const lane = left
          ? Math.min(frame.left, r.left) - 24
          : Math.max(frame.right, r.right) + 24;
        add(
          from,
          to,
          "read",
          `M${left ? a.left : a.right} ${a.y} H${lane} V${r.y} H${left ? r.left : r.right}`,
          left ? r.left : r.right,
          r.y,
          left ? "right" : "left",
          left ? COLORS.indigo : COLORS.ochre,
        );
      });
      const inputs = rect("[data-dequant-inputs]"),
        blocks = rect("[data-dequant-blocks]");
      const outputSelector = "[data-dequant-output] [data-expanded-tensor]",
        output = rect(outputSelector);
      ENGRAM_DEQUANT_BLOCKS.forEach((k, i) => {
        const fromValue = "[data-dequant-values] [data-expanded-tensor]";
        const valueTarget = `[data-dequant-value-block="${k}"] [data-expanded-tensor]`;
        const a = rect(fromValue),
          v = rect(valueTarget),
          lane = a.left - 20;
        add(
          fromValue,
          valueTarget,
          "split",
          `M${a.left} ${a.y} H${lane} V${v.y} H${v.left}`,
          v.left,
          v.y,
          "right",
          COLORS.indigo,
        );
        const fromScale = `[data-dequant-scales] [data-vector-cell]:nth-child(${i === 2 ? 4 : i + 1})`;
        const scaleTarget = `[data-dequant-scale-block="${k}"] > div`;
        const s = rect(fromScale),
          t = rect(scaleTarget);
        const sx = blocks.right + 40 + i * 20,
          sy = inputs.bottom + 12 + (2 - i) * 12;
        const ty = t.top - 10;
        add(
          fromScale,
          scaleTarget,
          "scale",
          `M${s.x} ${s.bottom} V${sy} H${sx} V${ty} H${t.x} V${t.top}`,
          t.x,
          t.top,
          "down",
          COLORS.ochre,
        );
        const result = `[data-dequant-result-block="${k}"] [data-expanded-tensor]`,
          q = rect(result);
        const ox = output.left + ((3 - i) * (output.right - output.left)) / 4;
        const oy = blocks.bottom + 12 + (2 - i) * 12;
        add(
          result,
          outputSelector,
          "assemble",
          `M${q.right} ${q.y} H${blocks.right + 18 - i * 6} V${oy} H${ox} V${output.top}`,
          ox,
          output.top,
          "down",
          COLORS.green,
        );
      });
      const resultTarget =
          "[data-engram-read-result] [data-vector-elements]:last-child [data-vector-cell]:last-child",
        target = rect(resultTarget);
      add(
        outputSelector,
        resultTarget,
        "result",
        `M${output.right} ${output.y} H${target.x} V${target.bottom}`,
        target.x,
        target.bottom,
        "up",
        COLORS.green,
      );
      setWires((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    const observer = new ResizeObserver(measure);
    [
      root,
      ...root.querySelectorAll<HTMLElement>(
        "[data-engram-address-vector], [data-engram-index], [data-engram-row], [data-engram-table-pair], [data-expanded-tensor], [data-dequant-block], [data-dequant-footer]",
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
