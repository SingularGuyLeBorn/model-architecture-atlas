export type VariableLocation = {
  layer: number;
  nodeId: string;
  title: string;
  tex: string;
};

// 保留大小写：单行 u 与窗口 U 是不同对象。兼容下标、普通输入和 LaTeX。
export function normalizeVariable(value: string): string {
  return value
    .normalize("NFKC")
    .replace(
      /\\(?:mathbf|mathrm|mathit|boldsymbol|operatorname|left|right)/g,
      "",
    )
    .replace(/\\(?:gets|leftarrow)/g, "←")
    .replace(/\\[ ,!;]/g, "")
    .replace(/[{}_$\s,()[\]\\]/g, "");
}

export function findVariables(entries: VariableLocation[], query: string) {
  const needle = normalizeVariable(query.trim());
  if (!needle) return [];
  const ranked = entries
    .map((entry) => ({ entry, key: normalizeVariable(entry.tex) }))
    .filter(
      ({ entry, key }) =>
        key.includes(needle) || entry.title.includes(query.trim()),
    )
    .sort(
      (a, b) =>
        Number(b.key === needle) - Number(a.key === needle) ||
        a.entry.layer - b.entry.layer,
    );
  const seen = new Set<string>();
  return ranked.flatMap(({ entry }) => {
    const id = `${entry.layer}:${entry.nodeId}:${normalizeVariable(entry.tex)}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [entry];
  });
}
