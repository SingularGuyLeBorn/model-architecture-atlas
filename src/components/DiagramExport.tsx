import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { flushSync } from "react-dom";
import { useNodesInitialized, useReactFlow } from "@xyflow/react";
import { exportFileName, serializeDiagramSvg } from "./diagram-svg";

const ExportContext = createContext({
  exporting: false,
  setExporting: (_value: boolean) => {},
});
export function DiagramExportProvider({ children }: { children: ReactNode }) {
  const [exporting, setExporting] = useState(false);
  return (
    <ExportContext.Provider value={{ exporting, setExporting }}>
      {children}
    </ExportContext.Provider>
  );
}
export function useDiagramExporting() {
  return useContext(ExportContext).exporting;
}
export function DiagramExportButton({
  getRoot,
  name,
  style,
}: {
  getRoot: () => HTMLElement | null;
  name: string;
  style?: CSSProperties;
}) {
  const { exporting, setExporting } = useContext(ExportContext);
  const { getNodes, getViewport } = useReactFlow();
  const ready = useNodesInitialized();
  const [error, setError] = useState("");
  async function download() {
    if (exporting) return;
    setError("");
    try {
      flushSync(() => setExporting(true));
      await document.fonts.ready;
      const root = getRoot()?.querySelector<HTMLElement>(".react-flow");
      if (!root) throw new Error("图尚未载入。");
      // 等待全量节点实际挂载和尺寸稳定，不移动相机，不写布局或撤销历史。
      let previous = "",
        stable = false;
      for (let frame = 0; frame < 120; frame++) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        const rendered = [
          ...root.querySelectorAll<HTMLElement>(".react-flow__node"),
        ];
        const signature = rendered
          .map(
            (el) =>
              `${el.dataset.id}:${el.offsetWidth}:${el.offsetHeight}:${el.childElementCount}`,
          )
          .join(";");
        if (
          rendered.length === getNodes().filter((n) => !n.hidden).length &&
          signature === previous
        ) {
          stable = true;
          break;
        }
        previous = signature;
      }
      if (!stable) throw new Error("全图仍在排版，请稍后重试。");
      const svg = await serializeDiagramSvg(root, getViewport(), name);
      const url = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName(name);
      link.click();
      // [OM-FREEPLAY] 下一帧释放下载对象，给浏览器下载处理保留当前事件循环。
      requestAnimationFrame(() => URL.revokeObjectURL(url));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "SVG 导出失败，请重试。",
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <button
        type="button"
        style={style}
        disabled={exporting || !ready}
        onClick={() => {
          download().catch(() => setError("SVG 导出失败。"));
        }}
        title="导出当前完整图（含手动布局）。浏览器兼容 SVG，内嵌公式字体；部分矢量编辑器不支持其中的 HTML 排版。"
      >
        {exporting ? "正在导出…" : "导出 SVG"}
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
