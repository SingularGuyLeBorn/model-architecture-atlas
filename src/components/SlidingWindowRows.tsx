import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MathFormula as M, COLORS } from "./diagram-primitives";

/** 展示逻辑时间顺序，不用物理环形槽位代替“哪行退出本次读取”。 */
export function SlidingWindowRows({
  layer,
  newKvPort,
  outputPort,
}: {
  layer: number;
  newKvPort?: ReactNode;
  outputPort?: ReactNode;
}) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const incomingRef = useRef<HTMLDivElement>(null);
  const appendedRef = useRef<HTMLDivElement>(null);
  const [appendPath, setAppendPath] = useState("");
  useLayoutEffect(() => {
    const layout = layoutRef.current,
      incoming = incomingRef.current,
      appended = appendedRef.current;
    if (!layout || !incoming || !appended) return;
    const measure = () => {
      const root = layout.getBoundingClientRect(),
        from = incoming.getBoundingClientRect(),
        to = appended.getBoundingClientRect();
      if (!root.width) return;
      const scale = root.width / layout.offsetWidth;
      const x1 = (from.right - root.left) / scale,
        y1 = (from.top + from.height / 2 - root.top) / scale;
      const x2 = (to.left - root.left) / scale,
        y2 = (to.top + to.height / 2 - root.top) / scale;
      const previous = layout
        .querySelector("[data-window-before]")!
        .getBoundingClientRect();
      const lane = ((previous.right - root.left) / scale + x2) / 2;
      setAppendPath(
        `M ${x1} ${y1} H ${lane} V ${y2} H ${x2} M ${x2 - 6} ${y2 - 5} L ${x2} ${y2} L ${x2 - 6} ${y2 + 5}`,
      );
    };
    const observer = new ResizeObserver(measure);
    [layout, incoming, appended].forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [layer]);
  const cells = (position: string) =>
    ["1", "2", "\\cdots", "512"].map((d) =>
      d === "\\cdots" ? (
        <M key={d} tex={d} />
      ) : (
        <span
          key={d}
          data-window-element
          style={{
            border: "1px solid currentColor",
            borderRadius: 4,
            padding: "4px 5px",
            background: "var(--row-fill)",
          }}
        >
          <M tex={"u_{" + layer + "," + position + "," + d + "}"} />
        </span>
      ),
    );
  const columns =
    "max-content repeat(2,minmax(max-content,1fr)) 16px minmax(max-content,1fr)";
  const rowStyle = {
    display: "grid",
    gridTemplateColumns: "subgrid",
    gridColumn: "1 / -1",
    gap: 4,
    alignItems: "center",
    textAlign: "center" as const,
  };
  return (
    <section
      data-sliding-window-rows
      data-window-update="t"
      style={{ display: "grid", gap: 10, fontSize: 12, justifyItems: "center" }}
    >
      <strong>小写 u：一条 KV 行 · 大写 U：多条 KV 组成的窗口矩阵</strong>
      <div
        ref={layoutRef}
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "max-content 54px max-content",
          gap: 8,
          alignItems: "center",
        }}
      >
        <div
          data-window-before
          style={{
            border: "1px solid " + COLORS.line,
            borderRadius: 7,
            padding: 8,
            display: "grid",
            gap: 8,
          }}
        >
          <M tex={"U_{" + layer + ",t-1}\\quad128\\times512"} />
          <small>旧窗口 · 灰行淘汰，其余直接保留</small>
          <div
            style={{ display: "grid", gridTemplateColumns: columns, gap: 6 }}
          >
            {["t-128", "t-127", "t-126", null, "t-1"].map((t) =>
              t === null ? (
                <div key="dots" style={rowStyle}>
                  <span />
                  {["1", "2", "dots", "512"].map((d) => (
                    <M key={d} tex={d === "dots" ? "\\ddots" : "\\vdots"} />
                  ))}
                </div>
              ) : (
                <div
                  key={t}
                  data-previous-token={t}
                  aria-label={t === "t-128" ? "淘汰" : "保留"}
                  style={
                    {
                      ...rowStyle,
                      color: t === "t-128" ? "#777e7a" : COLORS.green,
                      "--row-fill":
                        t === "t-128" ? "#e7e9e8" : COLORS.greenSoft,
                    } as React.CSSProperties
                  }
                >
                  <M tex={"\\mathbf u_{" + layer + "," + t + "}"} />
                  {cells(t)}
                </div>
              ),
            )}
          </div>
        </div>
        <div style={{ textAlign: "center", color: COLORS.green }}>
          <small>
            保留
            <br />
            127 行
          </small>
          <M tex="\longrightarrow" />
        </div>
        <div
          data-selection-window
          style={{
            position: "relative",
            border: "1px solid " + COLORS.green,
            borderRadius: 7,
            padding: 8,
            display: "grid",
            gap: 8,
          }}
        >
          <M tex={"U_{" + layer + ",t}\\quad128\\times512"} />
          <small data-window-bracket>当前窗口 · t−127 到 t · 128 行</small>
          <div
            style={{ display: "grid", gridTemplateColumns: columns, gap: 6 }}
          >
            {["t-127", "t-126", null, "t-1", "t"].map((t) =>
              t === null ? (
                <div key="dots" style={rowStyle}>
                  <span />
                  {["1", "2", "dots", "512"].map((d) => (
                    <M key={d} tex={d === "dots" ? "\\ddots" : "\\vdots"} />
                  ))}
                </div>
              ) : (
                <div
                  ref={t === "t" ? appendedRef : undefined}
                  key={t}
                  data-window-token={t}
                  data-window-state={t === "t" ? "new" : "keep"}
                  style={
                    {
                      ...rowStyle,
                      color: COLORS.green,
                      borderTop:
                        t === "t" ? `1px dashed ${COLORS.green}` : undefined,
                      "--row-fill": COLORS.greenSoft,
                    } as React.CSSProperties
                  }
                >
                  <M tex={"\\mathbf u_{" + layer + "," + t + "}"} />
                  {cells(t)}
                </div>
              ),
            )}
          </div>
          {outputPort}
        </div>
        <div style={{ display: "grid", gap: 5, justifyItems: "start" }}>
          <small>本步新算 · 本层输入 × W → 归一化 → RoPE</small>
          <div
            ref={incomingRef}
            data-window-new-kv
            style={{
              position: "relative",
              border: "1px solid " + COLORS.green,
              borderRadius: 7,
              padding: 8,
              display: "grid",
              gap: 5,
            }}
          >
            {newKvPort}
            <M tex={"\\mathbf u_{" + layer + ",t}\\quad1\\times512"} />
            <div
              style={
                {
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(2,minmax(max-content,1fr)) 16px minmax(max-content,1fr)",
                  gap: 4,
                  color: COLORS.green,
                  "--row-fill": COLORS.greenSoft,
                } as React.CSSProperties
              }
            >
              {cells("t")}
            </div>
          </div>
        </div>
        <small
          style={{ color: COLORS.green, alignSelf: "end", textAlign: "center" }}
        >
          追加
        </small>
        <span />
        <svg
          data-window-append-connector
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <path
            d={appendPath}
            fill="none"
            stroke={COLORS.green}
            strokeWidth="1.5"
          />
        </svg>
      </div>
      <small data-window-evicted>
        灰行 t−128 退出；127 条历史行 + 当前新行 = 128 行。t≤128
        时只保留已有行。
      </small>
    </section>
  );
}
