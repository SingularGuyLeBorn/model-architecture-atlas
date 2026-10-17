import type { CSSProperties, ReactNode } from "react";
import { COLORS, MathFormula, TensorHeading } from "./diagram-primitives";
import { frameColor } from "./diagram-appearance";

/** 行拼接复用原始行符号；只改变行位置，不生成新的元素值。 */
export function KvRowConcat({
  layer,
  kvSource,
  indexSource,
  localPort,
  globalPort,
  outputPort,
}: {
  layer: number;
  kvSource: number;
  indexSource: number;
  localPort?: ReactNode;
  globalPort?: ReactNode;
  outputPort?: ReactNode;
}) {
  const k = `K_{${layer},t}`;
  const localRows = ["r", "r+1", null, "t"].map((r) =>
    r === null ? null : `\\mathbf u_{${layer},${r}}`,
  );
  const globalRows = ["1", "2", null, k].map((j) =>
    j === null ? null : `\\mathbf g_{${layer},i_{${layer},t,${j}}}`,
  );
  const frame: CSSProperties = {
    position: "relative",
    border: `1.5px solid ${frameColor(COLORS.green)}`,
    borderRadius: 8,
    padding: 12,
    minWidth: "max-content",
  };
  const rows = (
    values: (string | null)[],
    positions: string[],
    region: string,
  ) => {
    const color = region.startsWith("global") ? COLORS.blue : COLORS.green;
    const fill = region.startsWith("global")
      ? COLORS.blueSoft
      : COLORS.greenSoft;
    return (
      <div
        data-concat-rows={region}
        style={{
          display: "grid",
          gridTemplateColumns: "max-content max-content",
          justifyContent: "center",
          gap: 6,
          marginTop: 8,
        }}
      >
        {values.map((value, i) =>
          value === null ? (
            <div key="ellipsis" style={{ textAlign: "center", gridColumn: 2 }}>
              <MathFormula tex={"\\vdots"} />
            </div>
          ) : (
            <div
              key={value}
              data-concat-row={value}
              style={{
                display: "grid",
                gridTemplateColumns: "subgrid",
                gridColumn: "1 / -1",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                第 <MathFormula tex={positions[i]} /> 行
              </span>
              <div
                style={{
                  border: `1px solid ${frameColor(color)}`,
                  borderRadius: 5,
                  padding: "6px 10px",
                  textAlign: "center",
                  display: "grid",
                  gap: 5,
                }}
              >
                <MathFormula tex={value} />
                <div
                  data-concat-elements
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "minmax(max-content,1fr) minmax(max-content,1fr) 16px minmax(max-content,1fr)",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {["1", "2", "\\cdots", "512"].map((column) =>
                    column === "\\cdots" ? (
                      <MathFormula key={column} tex={column} />
                    ) : (
                      <span
                        key={column}
                        data-concat-element
                        style={{
                          padding: "3px 5px",
                          border: `1px solid ${frameColor(color)}`,
                          borderRadius: 4,
                          background: fill,
                        }}
                      >
                        <MathFormula
                          tex={value
                            .replace(/^\\mathbf\s+/, "")
                            .replace(/}$/, `,${column}}`)}
                        />
                      </span>
                    ),
                  )}
                </div>
              </div>
            </div>
          ),
        )}
      </div>
    );
  };
  const transfer = (label: string, color: string = COLORS.green) => (
    <div
      style={{
        alignSelf: "center",
        textAlign: "center",
        color,
        fontSize: 12,
      }}
    >
      <div>{label}</div>
      <svg width="100%" height="18" viewBox="0 0 88 18" aria-label={label}>
        <path
          d="M 0 9 H 86 M 80 4 L 86 9 L 80 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
  return (
    <section
      data-kv-row-concat
      data-kv-source={kvSource}
      data-id-source={indexSource}
      style={{ padding: 14, fontSize: 14, minWidth: "max-content" }}
    >
      <div style={{ marginBottom: 12 }}>
        固定当前查询位置 t：
        <MathFormula tex={"m_t=\\min(128,t),\\quad r=\\max(1,t-127)"} />。
        每个小框是一条完整的 512 维行向量。
        <div data-kv-source-legend style={{ marginTop: 5 }}>
          <span style={{ color: COLORS.green }}>绿色：本地 U</span>
          {" · "}
          <span style={{ color: COLORS.blue }}>蓝色：选中的全局 G 行</span>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(max-content,1fr) 64px minmax(max-content,1fr)",
          gap: "12px 0",
        }}
      >
        <div data-concat-local style={frame}>
          {localPort}
          <TensorHeading name={`U_{${layer},t}`} shape={"m_t\\times512"} />
          <div>本地窗口 · t−127 到 t（窗口已满）</div>
          {rows(localRows, ["1", "2", "", "m_t"], "local-input")}
        </div>
        {transfer("原样放入")}
        <div
          data-concat-output
          style={{
            ...frame,
            borderColor: COLORS.line,
            padding: 0,
            gridColumn: 3,
            gridRow: "1 / 3",
            display: "grid",
            gridTemplateRows: "subgrid",
            rowGap: 12,
          }}
        >
          <div data-concat-output-local style={{ padding: 12 }}>
            <TensorHeading
              name={`\\mathrm{KV}_{${layer},t}`}
              shape={`L_t\\times512`}
            />
            <div>
              上段 · 本地窗口的 <MathFormula tex="m_t" /> 行
            </div>
            {rows(localRows, ["1", "2", "", "m_t"], "local-output")}
          </div>
          <div
            data-concat-output-global
            style={{
              padding: 12,
              borderTop: `1.5px solid ${frameColor(COLORS.blue)}`,
            }}
          >
            <div style={{ fontWeight: 600 }}>下段 · 紧接选中的全局行</div>
            <div>保留原缓存行号与向量，按选中顺序接入</div>
            {rows(
              globalRows,
              ["m_t+1", "m_t+2", "", `m_t+${k}`],
              "global-output",
            )}
          </div>
          {outputPort}
        </div>
        <div
          data-concat-global
          style={{ ...frame, borderColor: frameColor(COLORS.blue) }}
        >
          {globalPort}
          <TensorHeading
            name={`G_{${layer},t}^{\\mathrm{selected}}`}
            shape={`${k}\\times512`}
          />
          <div>
            按已排序的选中行号 <MathFormula tex={`i_{${layer},t,j}`} /> 取出的行
          </div>
          {rows(globalRows, ["1", "2", "", k], "global-input")}
        </div>
        {transfer("接在下方", COLORS.blue)}
      </div>
      <div
        data-concat-mapping
        style={{ display: "grid", gap: 8, marginTop: 14 }}
      >
        <div>
          <MathFormula tex={`L_t=m_t+${k}`} />
          ；行数相加，列数保持 512。拼接只排列行，不相加、不投影。
        </div>
        <MathFormula
          tex={`(\\mathrm{KV}_{${layer},t})_{j,d}=u_{${layer},r+j-1,d},\\quad 1\\le j\\le m_t`}
        />
        <MathFormula
          tex={`(\\mathrm{KV}_{${layer},t})_{m_t+j,d}=g_{${layer},i_{${layer},t,j},d},\\quad 1\\le j\\le ${k},\\quad d=1,\\ldots,512`}
        />
        <div>
          两段内展示首、次、末行，中间行由省略号表示；实际行数不足时按实际数量排列。
        </div>
      </div>
    </section>
  );
}
