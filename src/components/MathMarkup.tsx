import { useLayoutEffect, useRef, type CSSProperties } from "react";

// 公式结构未变时只替换文字，避免切层时重建整棵 MathML 并重新计算样式。
// 输入仅来自统一的 KaTeX 渲染器，不接受外部 HTML。
export function updateMathMarkup(root: HTMLElement, html: string) {
  const template = root.ownerDocument.createElement("template");
  template.innerHTML = html;
  const updates: Array<{ node: Node; value: string | null }> = [];
  const sameStructure = (current: Node, next: Node): boolean => {
    if (
      current.nodeType !== next.nodeType ||
      current.nodeName !== next.nodeName
    )
      return false;
    if (current.nodeType === 3) {
      if (current.nodeValue !== next.nodeValue)
        updates.push({ node: current, value: next.nodeValue });
      return true;
    }
    if (current.nodeType === 1) {
      const a = current as Element,
        b = next as Element;
      if (
        a.namespaceURI !== b.namespaceURI ||
        a.attributes.length !== b.attributes.length
      )
        return false;
      for (const attribute of Array.from(a.attributes)) {
        if (
          b.getAttributeNS(attribute.namespaceURI, attribute.localName) !==
          attribute.value
        )
          return false;
      }
    } else if (current.nodeType !== 11) return false;
    if (current.childNodes.length !== next.childNodes.length) return false;
    for (let i = 0; i < current.childNodes.length; i++) {
      if (!sameStructure(current.childNodes[i], next.childNodes[i]))
        return false;
    }
    return true;
  };
  // 先验证完整子树再提交，结构变化时不能留下半更新的公式。
  const compatible =
    root.childNodes.length === template.content.childNodes.length &&
    Array.from(root.childNodes).every((node, i) =>
      sameStructure(node, template.content.childNodes[i]),
    );
  if (compatible)
    for (const update of updates) update.node.nodeValue = update.value;
  else root.replaceChildren(template.content);
}

export function MathMarkup({
  html,
  tex,
  style,
}: {
  html: string;
  tex: string;
  style?: CSSProperties;
}) {
  const element = useRef<HTMLSpanElement>(null);
  // 对象身份也要稳定；每次新建 __html 对象会让 React 在 effect 前重置子树。
  const initialMarkup = useRef({ __html: html });
  const renderedHtml = useRef(html);
  useLayoutEffect(() => {
    if (!element.current || renderedHtml.current === html) return;
    updateMathMarkup(element.current, html);
    renderedHtml.current = html;
  }, [html]);
  return (
    <span
      ref={element}
      aria-label={tex}
      style={style}
      dangerouslySetInnerHTML={initialMarkup.current}
    />
  );
}
