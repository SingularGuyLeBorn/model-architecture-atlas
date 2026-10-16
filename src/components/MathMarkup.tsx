import { memo, useLayoutEffect, useRef, type CSSProperties } from "react";

type MarkupPlan = {
  template: HTMLTemplateElement;
  signature: string;
  values: (string | null)[];
};
const plans = new WeakMap<Document, Map<string, MarkupPlan>>();
const renderedTrees = new WeakMap<
  HTMLElement,
  { signature: string; texts: Node[] }
>();

function inspectTree(root: Node) {
  const structure: unknown[] = [],
    texts: Node[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      structure.push([3]);
      texts.push(node);
      return;
    }
    const el = node.nodeType === 1 ? (node as Element) : null;
    structure.push([
      node.nodeType,
      node.nodeName,
      el?.namespaceURI,
      el
        ? Array.from(el.attributes, (a) => [
            a.namespaceURI,
            a.localName,
            a.value,
          ])
        : null,
      node.childNodes.length,
    ]);
    node.childNodes.forEach(visit);
  };
  root.childNodes.forEach(visit);
  return { signature: JSON.stringify(structure), texts };
}

function markupPlan(document: Document, html: string) {
  let cache = plans.get(document);
  if (!cache) {
    cache = new Map();
    plans.set(document, cache);
  }
  const previous = cache.get(html);
  if (previous) return previous;
  const template = document.createElement("template");
  template.innerHTML = html;
  const tree = inspectTree(template.content);
  const plan = {
    template,
    signature: tree.signature,
    values: tree.texts.map((node) => node.nodeValue),
  };
  cache.set(html, plan);
  // [OM-FREEPLAY] 与公式字符串缓存同限额；按文档隔离，避免长期浏览无限保留 DOM 模板。
  if (cache.size > 4096) cache.delete(cache.keys().next().value!);
  return plan;
}

// 公式结构未变时只替换文字，避免切层时重建整棵 MathML 并重新计算样式。
// 输入仅来自统一的 KaTeX 渲染器，不接受外部 HTML。
export function updateMathMarkup(root: HTMLElement, html: string) {
  const plan = markupPlan(root.ownerDocument, html);
  const current = renderedTrees.get(root) ?? inspectTree(root);
  // 公式 DOM 由本组件独占。相同结构只更新文本，不反复解析 HTML 或逐元素比较属性。
  if (current.signature === plan.signature) {
    current.texts.forEach((node, i) => {
      if (node.nodeValue !== plan.values[i]) node.nodeValue = plan.values[i];
    });
    renderedTrees.set(root, current);
  } else {
    root.replaceChildren(plan.template.content.cloneNode(true));
    renderedTrees.set(root, inspectTree(root));
  }
}

export const MathMarkup = memo(function MathMarkup({
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
});
