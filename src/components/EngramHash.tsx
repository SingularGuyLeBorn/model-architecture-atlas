import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { Box, COLORS, MathFormula as M, Operator } from "./diagram-primitives";
import { frameColor } from "./diagram-appearance";

type Link = { from: string; to: string; line: string; tip: string };

/** 固定本层、当前位置：乘积逐项异或，再让同一哈希值进入各头的地址计算。 */
// https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/5254448103b6254fc646dacbca1cbbf20e9216c1/inference/engram.py
function HashBranch({ layer, n }: { layer: number; n: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [links, setLinks] = useState<Link[]>([]);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const nodes = [...root.querySelectorAll<HTMLElement>("[data-hash-port]")];
    const measure = () => {
      const bounds = root.getBoundingClientRect();
      const scale = bounds.width / root.offsetWidth;
      if (!scale) return;
      const rect = (id: string) => {
        const r = root
          .querySelector(`[data-hash-port="${id}"]`)!
          .getBoundingClientRect();
        return {
          left: (r.left - bounds.left) / scale,
          right: (r.right - bounds.left) / scale,
          top: (r.top - bounds.top) / scale,
          bottom: (r.bottom - bounds.top) / scale,
          x: (r.left + r.width / 2 - bounds.left) / scale,
          y: (r.top + r.height / 2 - bounds.top) / scale,
        };
      };
      const next: Link[] = [];
      const add = (
        from: string,
        to: string,
        line: string,
        x: number,
        y: number,
        direction: "right" | "down" | "up",
      ) => {
        // [OM-FREEPLAY] 箭翼 5×4px，与现有内部导线同级；不随框宽拉伸。
        const tip =
          direction === "right"
            ? `M${x - 5} ${y - 4} L${x} ${y} L${x - 5} ${y + 4}`
            : direction === "down"
              ? `M${x - 4} ${y - 5} L${x} ${y} L${x + 4} ${y - 5}`
              : `M${x - 4} ${y + 5} L${x} ${y} L${x + 4} ${y + 5}`;
        next.push({ from, to, line, tip });
      };
      const xor = rect("xor"),
        u = rect("u");
      for (let j = 0; j < n; j++) {
        const p = rect(`product-${j}`);
        const top = n > 2 && j === 0,
          bottom = n > 2 && j === n - 1;
        const y = top
          ? xor.top
          : bottom
            ? xor.bottom
            : n === 3
              ? xor.y
              : xor.y + (j === (n === 2 ? 0 : 1) ? -7 : 7);
        const x = top || bottom ? xor.x : xor.left;
        const lane = (p.right + xor.left) / 2;
        add(
          `product-${j}`,
          "xor",
          top || bottom
            ? `M${p.right} ${p.y} H${x} V${y}`
            : `M${p.right} ${p.y} H${lane} V${y} H${x}`,
          x,
          y,
          top ? "down" : bottom ? "up" : "right",
        );
      }
      add(
        "xor",
        "u",
        `M${xor.right} ${xor.y} H${u.left}`,
        u.left,
        u.y,
        "right",
      );
      const first = rect("head-1");
      const laneY =
        (Math.max(
          ...Array.from({ length: n }, (_, j) => rect(`product-${j}`).bottom),
          u.bottom,
        ) +
          first.top) /
        2;
      const laneX = first.left - 18;
      // 一个 u 的广播共用主干；三条支线分别进入取模运算，不连接分组框。
      [1, 2, 8].forEach((h) => {
        const head = rect(`head-${h}`);
        add(
          "u",
          `head-${h}`,
          `M${u.x} ${u.bottom} V${laneY} H${laneX} V${head.y} H${head.left}`,
          head.left,
          head.y,
          "right",
        );
      });
      setLinks((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    const observer = new ResizeObserver(measure);
    [root, ...nodes].forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [n]);
  return (
    <div
      data-ngram={n}
      style={{
        border: `1px solid ${frameColor(COLORS.blue)}`,
        borderRadius: 8,
        padding: 10,
        display: "grid",
        gap: 8,
        alignSelf: "start",
      }}
    >
      <strong>{n}-gram · 结束于 t · ⊕ 按位异或</strong>
      <div
        ref={ref}
        data-hash-chain
        style={{
          position: "relative",
          display: "grid",
          gap: 36,
          width: "max-content",
          justifySelf: "center",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "max-content 60px 56px 24px max-content",
            alignItems: "center",
            minHeight: 184,
          }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            {Array.from({ length: n }, (_, j) => (
              <div
                key={j}
                data-hash-port={`product-${j}`}
                data-hash-product={j}
                style={{
                  display: "flex",
                  gap: 5,
                  alignItems: "center",
                  justifyContent: "flex-end",
                }}
              >
                <Box tone="blue">
                  <M tex={`c_{${j ? `t-${j}` : "t"}}`} />
                </Box>
                <Operator tex="\times" />
                <Box tone="indigo">
                  <M tex={`a_{${layer},${j}}`} />
                </Box>
              </div>
            ))}
          </div>
          <div />
          <div style={{ position: "relative" }}>
            <div
              data-hash-port="xor"
              style={{
                width: 48,
                height: 48,
                marginInline: "auto",
                boxSizing: "border-box",
                border: `2px solid ${COLORS.ink}`,
                display: "grid",
                placeItems: "center",
                fontSize: 22,
              }}
            >
              <M tex="\oplus" />
            </div>
          </div>
          <div />
          <div data-hash-port="u">
            <Box tone="cyan">
              <M tex={`u_${n}`} />
            </Box>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "max-content max-content",
            gridTemplateRows: "24px repeat(2,32px) 20px 32px",
            gap: 6,
            paddingLeft: 28,
            justifySelf: "center",
          }}
        >
          {[1, 2, 8].map((h, i) => (
            <div
              key={h}
              data-hash-head={h}
              style={{
                gridColumn: 1,
                gridRow: i === 2 ? 5 : i + 2,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span data-hash-port={`head-${h}`}>
                <M tex="\bmod" />
              </span>
              <Box tone="indigo">
                <M tex={`p_{${n},${h}}`} />
              </Box>
              <Operator tex="+" />
              <Box tone="indigo">
                <M tex={`o_{${n},${h}}`} />
              </Box>
              <Operator tex="=" />
            </div>
          ))}
          <div
            data-engram-address-vector={n}
            style={{
              gridColumn: 2,
              gridRow: "1 / 6",
              display: "grid",
              gridTemplateRows: "subgrid",
              paddingInline: 7,
              border: `1px solid ${frameColor(COLORS.amber)}`,
              borderRadius: 6,
              justifyItems: "center",
              alignItems: "center",
            }}
          >
            <M tex={`\\mathbf b_${n}\\quad 8\\times1`} />
            {[1, 2, 8].map((h) => (
              <Fragment key={h}>
                {h === 8 && <M tex="\vdots" />}
                <Box tone="amber">
                  <M tex={`b_{${n},${h}}`} />
                </Box>
              </Fragment>
            ))}
          </div>
        </div>
        <svg
          aria-hidden
          data-hash-wires
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          {links.map((link, i) => (
            <g key={i} data-wire-path>
              <path
                data-hash-link
                data-from={link.from}
                data-to={link.to}
                d={link.line}
                fill="none"
                stroke={COLORS.cyan}
                strokeWidth={1.5}
              />
              <path
                d={link.tip}
                fill="none"
                stroke={COLORS.cyan}
                strokeWidth={1.5}
              />
              <path
                data-wire-hit
                d={link.line}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export function EngramHash({ layer }: { layer: number }) {
  return (
    <div
      data-engram-hash
      style={{
        display: "grid",
        gap: 8,
        width: "max-content",
        justifySelf: "center",
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <strong>① ID × 固定乘数 → 按位异或 → ② 各头取模 + 桶偏移</strong>
        <span>蓝：ID · 紫：固定规则 · 青：哈希值 · 琥珀：行号</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,max-content)",
          gap: 12,
          justifyContent: "center",
          alignItems: "start",
        }}
      >
        {[2, 3, 4].map((n) => (
          <HashBranch key={n} layer={layer} n={n} />
        ))}
      </div>
    </div>
  );
}
