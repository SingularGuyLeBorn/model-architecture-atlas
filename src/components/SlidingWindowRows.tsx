import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MathFormula as M, COLORS } from "./diagram-primitives";

/** 展示逻辑时间顺序，不用物理环形槽位代替“哪行退出本次读取”。 */
export function SlidingWindowRows({
  layer,
  newKvPort,
}: {
  layer: number;
  newKvPort?: ReactNode;
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
      const lane = (x1 + x2) / 2;
      setAppendPath(
        `M ${x1} ${y1} H ${lane} V ${y2} H ${x2} M ${x2 - 6} ${y2 - 5} L ${x2} ${y2} L ${x2 - 6} ${y2 + 5}`,
      );
    };
    const observer = new ResizeObserver(measure);
    [layout, incoming, appended].forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [layer]);
  const row = (t: number, state: "old" | "keep" | "new") => (
    <div
      data-window-token={t}
      data-window-state={state}
      style={{
        display: "grid",
        gridTemplateColumns: "38px 210px 76px",
        alignItems: "center",
        gap: 9,
      }}
    >
      <span>{t}</span>
      <div
        style={{
          padding: "5px 9px",
          border: `1px solid ${state === "old" ? "#abb1ae" : state === "new" ? COLORS.amber : COLORS.green}`,
          borderRadius: 4,
          background:
            state === "old"
              ? "#e7e9e8"
              : state === "new"
                ? COLORS.amberSoft
                : COLORS.greenSoft,
          color: state === "old" ? "#777e7a" : COLORS.ink,
        }}
      >
        <M tex={`\\mathbf u_{${layer},${t}}\\quad 1\\times512`} />
      </div>
      <small>
        {state === "old"
          ? "不再读取"
          : state === "new"
            ? "本步新算"
            : "历史直接读"}
      </small>
    </div>
  );
  if (layer === 2)
    return (
      <section
        data-sliding-window-rows
        data-window-update="129"
        style={{ display: "grid", gap: 10, fontSize: 14 }}
      >
        <strong>token129 · 本层旧窗口 + 本步新 KV</strong>
        <div
          ref={layoutRef}
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) 58px minmax(0,1.1fr)",
            gap: 8,
            alignItems: "center",
          }}
        >
          <div
            data-window-before
            style={{
              border: `1px solid ${COLORS.line}`,
              borderRadius: 7,
              padding: 10,
              display: "grid",
              gap: 7,
            }}
          >
            <M tex="U_{2,128}\quad128\times512" />
            <span>更新前 · token 1–128</span>
            {[1, 2, 3, null, 128].map((t) =>
              t === null ? (
                <M key="dots" tex="\vdots" />
              ) : (
                <div
                  key={t}
                  data-previous-token={t}
                  style={{
                    border: `1px solid ${t === 1 ? "#abb1ae" : COLORS.green}`,
                    borderRadius: 4,
                    background: t === 1 ? "#e7e9e8" : COLORS.greenSoft,
                    color: t === 1 ? "#777e7a" : COLORS.ink,
                    padding: "5px 9px",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <M tex={`\\mathbf u_{2,${t}}`} />
                  <small>{t === 1 ? "淘汰" : "原样保留"}</small>
                </div>
              ),
            )}
          </div>
          <div style={{ textAlign: "center", color: COLORS.green }}>
            <small>
              保留
              <br />
              2–128
            </small>
            <M tex="\longrightarrow" />
          </div>
          <div
            data-selection-window
            style={{
              borderLeft: `2px solid ${COLORS.green}`,
              borderRight: `2px solid ${COLORS.green}`,
              padding: "8px 10px",
              display: "grid",
              gap: 7,
            }}
          >
            <M tex="U_{2,129}\quad128\times512" />
            <span data-window-bracket>更新后 · 128 行 · token 2–129</span>
            {[2, 3, null, 128, 129].map((t) =>
              t === null ? (
                <M key="dots" tex="\vdots" />
              ) : (
                <div
                  ref={t === 129 ? appendedRef : undefined}
                  key={t}
                  data-window-token={t}
                  data-window-state={t === 129 ? "new" : "keep"}
                  style={{
                    border: `1px solid ${t === 129 ? COLORS.amber : COLORS.green}`,
                    borderRadius: 4,
                    background: t === 129 ? COLORS.amberSoft : COLORS.greenSoft,
                    padding: "5px 9px",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <M tex={`\\mathbf u_{2,${t}}`} />
                  <small>{t === 129 ? "本步追加" : "历史直接读"}</small>
                </div>
              ),
            )}
          </div>
          <div
            ref={incomingRef}
            data-window-new-kv
            style={{
              position: "relative",
              border: `1px solid ${COLORS.amber}`,
              background: COLORS.amberSoft,
              borderRadius: 7,
              padding: 10,
              textAlign: "center",
            }}
          >
            {newKvPort}
            <M tex="\mathbf u_{2,129}\quad1\times512" />
            <div>来自上方：投影 → 归一化 → RoPE</div>
          </div>
          <small
            style={{
              color: COLORS.amber,
              alignSelf: "end",
              textAlign: "center",
            }}
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
              stroke={COLORS.amber}
              strokeWidth="1.5"
            />
          </svg>
        </div>
        <small data-window-evicted>
          灰色 token1 不进入当前及之后的本层局部 Attention；历史行不重新投影。
        </small>
      </section>
    );
  return (
    <section
      data-sliding-window-rows
      style={{
        display: "grid",
        gap: 8,
        fontSize: 14,
        justifyContent: "center",
        padding: "4px 0",
      }}
    >
      <strong>Decode · t = 129</strong>
      <div style={{ paddingLeft: 9 }}>{row(1, "old")}</div>
      <div style={{ display: "flex", alignItems: "stretch", gap: 12 }}>
        <div
          data-selection-window
          style={{
            display: "grid",
            gap: 5,
            borderLeft: `2px solid ${COLORS.green}`,
            borderRight: `2px solid ${COLORS.green}`,
            borderTop: `1px solid ${COLORS.green}`,
            borderBottom: `1px solid ${COLORS.green}`,
            padding: "5px 7px",
          }}
        >
          {row(2, "keep")}
          {row(3, "keep")}
          <div style={{ textAlign: "center" }}>
            <M tex="\vdots" />
          </div>
          {row(128, "keep")}
          <div
            style={{ borderTop: `1px dashed ${COLORS.amber}`, paddingTop: 5 }}
          >
            {row(129, "new")}
          </div>
        </div>
        <div
          data-window-bracket
          style={{
            borderLeft: `2px solid ${COLORS.green}`,
            borderTop: `2px solid ${COLORS.green}`,
            borderBottom: `2px solid ${COLORS.green}`,
            padding: "8px 10px",
            display: "grid",
            alignContent: "center",
            gap: 5,
          }}
        >
          <M tex={`U_{${layer},129}`} />
          <span>128 行</span>
          <span>token 2–129</span>
        </div>
      </div>
      <small>
        灰行仅为说明淘汰：不在有效缓存内，不进入本次及更晚的本层局部 Attention。
      </small>
    </section>
  );
}
