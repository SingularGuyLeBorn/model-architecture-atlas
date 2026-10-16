export type ExportBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";
// [OM-FREEPLAY] 全图留 32px 呼吸边界，包含导线的人工折点和标签，不依赖当前相机。
const PADDING = 32;
const OMIT =
  ".react-flow__handle, .react-flow__resize-control, .react-flow__edge-interaction, [data-export-ignore], .katex-mathml, script, input, textarea";
const PROPERTIES =
  "display visibility position top right bottom left inset z-index box-sizing width height min-width min-height max-width max-height margin margin-top margin-right margin-bottom margin-left padding padding-top padding-right padding-bottom padding-left border border-radius border-top border-right border-bottom border-left outline outline-offset background-color background-image color opacity font-family font-size font-weight font-style font-variant line-height letter-spacing word-spacing text-align text-decoration text-transform text-indent text-shadow white-space vertical-align overflow overflow-x overflow-y overflow-wrap word-break transform transform-origin flex flex-direction flex-wrap flex-basis flex-grow flex-shrink align-items align-self align-content justify-content justify-items justify-self gap row-gap column-gap grid-template-columns grid-template-rows grid-auto-flow grid-auto-columns grid-column grid-row box-shadow fill fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-opacity marker-start marker-mid marker-end vector-effect clip-path".split(
    " ",
  );

export function exportFileName(name: string) {
  return `${name.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-|-$/g, "") || "diagram"}.svg`;
}
export function unionBounds(rects: ExportBounds[]): ExportBounds {
  if (!rects.length) throw new Error("图还未完成渲染，请稍后导出。");
  const x = Math.min(...rects.map((r) => r.x)),
    y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
}
function fontRules(): CSSFontFaceRule[] {
  const result: CSSFontFaceRule[] = [];
  function visit(rules: CSSRuleList) {
    for (const rule of rules) {
      if (rule instanceof CSSFontFaceRule) result.push(rule);
      else if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules);
    }
  }
  for (const sheet of document.styleSheets) visit(sheet.cssRules);
  return result;
}
async function embedFonts(families: Set<string>) {
  const rules = fontRules().filter((rule) =>
    families.has(
      rule.style.getPropertyValue("font-family").replace(/["']/g, "").trim(),
    ),
  );
  return (
    await Promise.all(
      rules.map(async (rule) => {
        const src = rule.style.getPropertyValue("src");
        const urls = [...src.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(
          (m) => m[1],
        );
        const url = urls.find((value) => value.includes(".woff2")) ?? urls[0];
        if (!url) throw new Error("公式字体缺少可嵌入来源。");
        const absolute = new URL(
          url,
          rule.parentStyleSheet?.href ?? location.href,
        );
        const response = await fetch(absolute);
        if (!response.ok)
          throw new Error(
            `公式字体载入失败（${response.status}），未导出不完整文件。`,
          );
        const blob = await response.blob();
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("字体读取失败。"));
          reader.readAsDataURL(blob);
        });
        return `@font-face{font-family:${rule.style.fontFamily};font-style:${rule.style.fontStyle};font-weight:${rule.style.fontWeight};src:url("${data}")}`;
      }),
    )
  ).join("\n");
}

/** SVG + XHTML foreignObject：保留 KaTeX 与嵌套矢量，不把整个结构图栅格化。 */
export async function serializeDiagramSvg(
  root: HTMLElement,
  viewport: { x: number; y: number; zoom: number },
  title: string,
) {
  const source = root.querySelector<HTMLElement>(".react-flow__viewport");
  if (!source) throw new Error("找不到当前结构图。");
  const origin = root.getBoundingClientRect();
  const rects = [
    ...source.querySelectorAll<Element>(
      ".react-flow__node, .react-flow__edge-path, [data-edge-label], [data-edge-terminal-label]",
    ),
  ]
    .filter((el) => getComputedStyle(el).display !== "none")
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: (r.x - origin.x - viewport.x) / viewport.zoom,
        y: (r.y - origin.y - viewport.y) / viewport.zoom,
        width: r.width / viewport.zoom,
        height: r.height / viewport.zoom,
      };
    });
  const bounds = unionBounds(rects),
    width = Math.ceil(bounds.width + PADDING * 2),
    height = Math.ceil(bounds.height + PADDING * 2);
  const clone = source.cloneNode(true) as HTMLElement;
  const originalElements = [source, ...source.querySelectorAll<Element>("*")];
  const clonedElements = [clone, ...clone.querySelectorAll<Element>("*")];
  const styles = new Map<string, string>(),
    families = new Set<string>();
  originalElements.forEach((element, i) => {
    if (element.closest(OMIT)) return;
    const computed = getComputedStyle(element);
    computed.fontFamily
      .split(",")
      .forEach((f) => families.add(f.replace(/["']/g, "").trim()));
    const css = PROPERTIES.map((prop) => {
      // 同一 SVG 内的 marker 不依赖导出时网页的 URL。
      let value = computed
        .getPropertyValue(prop)
        .replace(/url\(["']?[^)"']*#([^"')]+)["']?\)/g, "url(#$1)");
      // Chromium 的布局单位为 1/64px，computedStyle 的十进制截断会让恰好排满的 flex 行误换行。
      // 还原布局精度后再序列化，避免导出结果比原图少一个布局单位。
      if (
        /^(?:min-|max-)?(?:width|height)$/.test(prop) &&
        /^\d+(?:\.\d+)?px$/.test(value)
      ) {
        value = `${Math.round(Number.parseFloat(value) * 64) / 64}px`;
      }
      return value ? `${prop}:${value}` : "";
    })
      .filter(Boolean)
      .join(";");
    let name = styles.get(css);
    if (!name) {
      name = `export-style-${styles.size}`;
      styles.set(css, name);
    }
    const copy = clonedElements[i];
    copy.removeAttribute("style");
    copy.setAttribute("class", `${copy.getAttribute("class") ?? ""} ${name}`);
    for (const attr of [...copy.attributes])
      if (attr.name.startsWith("on") || attr.name === "tabindex")
        copy.removeAttribute(attr.name);
  });
  clone.querySelectorAll(OMIT).forEach((el) => el.remove());
  const fonts = await embedFonts(families);
  clone.style.cssText = `position:absolute;left:0;top:0;width:100%;height:100%;transform:translate(${PADDING - bounds.x}px, ${PADDING - bounds.y}px) scale(1);transform-origin:0 0;`;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const heading = document.createElementNS(SVG_NS, "title");
  heading.textContent = title;
  svg.append(heading);
  const desc = document.createElementNS(SVG_NS, "desc");
  desc.textContent =
    "当前完整结构图，含人工布局、公式字体及矢量连线。使用 SVG foreignObject 排版，建议用现代浏览器打开；不支持 foreignObject 的编辑器可能无法显示文字。";
  svg.append(desc);
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent =
    fonts +
    "\n" +
    [...styles].map(([css, name]) => `.${name}{${css}}`).join("\n");
  svg.append(style);
  const foreign = document.createElementNS(SVG_NS, "foreignObject");
  foreign.setAttribute("width", String(width));
  foreign.setAttribute("height", String(height));
  const container = document.createElementNS(XHTML_NS, "div");
  container.setAttribute(
    "style",
    `position:relative;width:${width}px;height:${height}px;background:white;overflow:hidden;`,
  );
  container.append(clone);
  foreign.append(container);
  svg.append(foreign);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
}
