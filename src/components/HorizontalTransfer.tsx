import { useLayoutEffect, useRef, useState } from "react";
import { COLORS } from "./diagram-primitives";

/** 两个实际数据框之间的横向传递；按边界测量并在中间通道折转。 */
export function HorizontalTransfer({
  sourceSelector,
  targetSelector,
  leftSelector,
  rightSelector,
}: {
  sourceSelector: string;
  targetSelector: string;
  leftSelector?: string;
  rightSelector?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [path, setPath] = useState("");
  useLayoutEffect(() => {
    const svg = ref.current;
    const layout = svg?.parentElement;
    const source = layout?.querySelector(sourceSelector);
    const target = layout?.querySelector(targetSelector);
    const left = leftSelector ? layout?.querySelector(leftSelector) : source;
    const right = rightSelector ? layout?.querySelector(rightSelector) : target;
    if (!svg || !layout || !source || !target || !left || !right) return;
    const measure = () => {
      const root = svg.getBoundingClientRect(),
        from = source.getBoundingClientRect(),
        to = target.getBoundingClientRect();
      if (!root.width) return;
      const scale = root.width / svg.clientWidth;
      const x1 = (from.right - root.left) / scale,
        y1 = (from.top + from.height / 2 - root.top) / scale;
      const x2 = (to.left - root.left) / scale,
        y2 = (to.top + to.height / 2 - root.top) / scale;
      const lane =
        (left.getBoundingClientRect().right +
          right.getBoundingClientRect().left -
          2 * root.left) /
        (2 * scale);
      setPath(
        `M ${x1} ${y1} H ${lane} V ${y2} H ${x2} M ${x2 - 6} ${y2 - 5} L ${x2} ${y2} L ${x2 - 6} ${y2 + 5}`,
      );
    };
    const observer = new ResizeObserver(measure);
    [layout, source, target, left, right].forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sourceSelector, targetSelector, leftSelector, rightSelector]);
  return (
    <svg
      ref={ref}
      data-stage-transfer
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <path d={path} fill="none" stroke={COLORS.green} strokeWidth="1.5" />
    </svg>
  );
}
