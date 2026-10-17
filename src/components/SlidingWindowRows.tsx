import { MathFormula as M, COLORS } from "./diagram-primitives";

/** 展示逻辑时间顺序，不用物理环形槽位代替“哪行退出本次读取”。 */
export function SlidingWindowRows({ layer }: { layer: number }) {
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
