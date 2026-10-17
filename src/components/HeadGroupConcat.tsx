import { COLORS, MathFormula as M } from "./diagram-primitives";

/** 先只拼接，仍使用来源 O/o；调用处下一步才命名为 C/c。 */
export function HeadGroupConcat({
  layer,
  group,
  count,
}: {
  layer: number;
  group: number;
  count: string;
}) {
  const rows = count === "1" ? ["t"] : ["1", "2", null, "N"];
  return (
    <section
      data-head-concat-sources={group}
      style={{ display: "grid", gap: 6, fontSize: 12 }}
    >
      <strong>① 只拼接 · 保留原 O / o</strong>
      <div
        data-head-concat-original
        style={{
          border: `1px solid ${COLORS.green}`,
          borderRadius: 6,
          padding: 6,
          display: "grid",
          gridTemplateColumns: "1fr 1fr max-content 1fr",
          gap: 5,
        }}
      >
        {[0, 1, 7].map((offset) => {
          const head = (group - 1) * 8 + offset + 1;
          return (
            <div
              key={head}
              data-original-head={head}
              style={{ display: "contents" }}
            >
              {offset === 7 && (
                <div style={{ alignSelf: "center" }}>
                  <M tex="\cdots" />
                </div>
              )}
              <div
                style={{
                  display: "grid",
                  gap: 5,
                  textAlign: "center",
                  border: `1px dashed ${COLORS.green}`,
                  borderRadius: 4,
                  padding: 4,
                }}
              >
                <M tex={`O_{${layer},${head}}`} />
                <small>
                  列 {offset * 512 + 1}–{(offset + 1) * 512}
                </small>
                {rows.map((row, i) =>
                  row === null ? (
                    <M key={i} tex="\vdots" />
                  ) : (
                    <div
                      key={row}
                      style={{
                        background: COLORS.greenSoft,
                        border: `1px solid ${COLORS.green}`,
                        borderRadius: 4,
                        padding: "4px 2px",
                      }}
                    >
                      <M tex={`\\mathbf o_{${layer},${head},${row}}`} />
                    </div>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: "center" }}>
        <M tex={`${count}\\times(8\\cdot512)=${count}\\times4096`} /> · token
        行不变
      </div>
      <strong>② 同一矩阵命名为 C · 数值不变</strong>
    </section>
  );
}
