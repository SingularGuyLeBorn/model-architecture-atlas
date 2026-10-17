import { useMemo, useState } from "react";
import { MathFormula } from "./diagram-primitives";
import { findVariables, type VariableLocation } from "./variable-search";

export function VariableSearch({
  getEntries,
  onSelect,
}: {
  getEntries: () => VariableLocation[];
  onSelect: (entry: VariableLocation) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const entries = useMemo(() => (open ? getEntries() : []), [open, getEntries]);
  const matches = useMemo(
    () => findVariables(entries, query),
    [entries, query],
  );
  return (
    <div style={{ position: "relative" }}>
      <input
        aria-label="按变量名查找"
        placeholder="查变量：U₁,t / KV₃,t…"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        style={{
          width: 200,
          padding: "7px 9px",
          border: "1px solid #b9b5ac",
          borderRadius: 6,
        }}
      />
      {open && query.trim() && (
        <div
          aria-label="变量查找结果"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            width: 380,
            maxWidth: "80vw",
            maxHeight: "55vh",
            overflowY: "auto",
            background: "white",
            border: "1px solid #b9b5ac",
            boxShadow: "0 4px 14px #0002",
            padding: 8,
            zIndex: 20,
          }}
        >
          <div style={{ fontSize: 12, marginBottom: 6 }}>
            跨 40 层查找 · 区分 u / U · {matches.length} 处{" "}
            <button type="button" onClick={() => setOpen(false)}>
              关闭
            </button>
          </div>
          {!matches.length && (
            <p>未找到。可试 U_1,t、KV_3,t、G_25 或模块名。</p>
          )}
          {matches.map((entry) => (
            <button
              type="button"
              key={`${entry.layer}:${entry.nodeId}:${entry.tex}`}
              data-variable-result
              data-variable-layer={entry.layer}
              data-variable-node={entry.nodeId}
              onClick={() => {
                onSelect(entry);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: 9,
                border: 0,
                borderBottom: "1px solid #eee",
                background: "white",
                cursor: "pointer",
              }}
            >
              <MathFormula tex={entry.tex} />
              <span style={{ display: "block", fontSize: 12, marginTop: 4 }}>
                第 {entry.layer} 层 · {entry.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
