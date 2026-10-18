/** 正常手势与故障注入共用的实际 SVG 端点、入边方向和箭头检查。 */
export function inspectBoundaryAttachment({
  nodeId,
  edgeId,
  side,
}: {
  nodeId: string;
  edgeId: string;
  side: "left" | "right" | "top" | "bottom";
}) {
  const node = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`);
  const wire = document.querySelector(
    `.react-flow__edge[data-id="${edgeId}"] .react-flow__edge-path`,
  ) as SVGPathElement | null;
  const arrow = document.querySelector(
    `[data-edge-arrow="${edgeId}"]`,
  ) as SVGPathElement | null;
  const problems: string[] = [];
  if (!node || !wire) return ["boundary-missing-object"];
  const box = node.getBoundingClientRect(),
    matrix = wire.getScreenCTM()!;
  const length = wire.getTotalLength();
  const last = wire.getPointAtLength(length).matrixTransform(matrix);
  const prior = wire
    .getPointAtLength(Math.max(0, length - 2))
    .matrixTransform(matrix);
  const expected =
    side === "left"
      ? { x: box.left, y: box.top + box.height / 2 }
      : side === "right"
        ? { x: box.right, y: box.top + box.height / 2 }
        : side === "top"
          ? { x: box.left + box.width / 2, y: box.top }
          : { x: box.left + box.width / 2, y: box.bottom };
  if (Math.hypot(last.x - expected.x, last.y - expected.y) > 2)
    problems.push("boundary-endpoint");
  const direction =
    side === "left"
      ? last.x - prior.x
      : side === "right"
        ? prior.x - last.x
        : side === "top"
          ? last.y - prior.y
          : prior.y - last.y;
  if (direction <= 0) problems.push("boundary-direction");
  if (!arrow?.getAttribute("marker-end")) problems.push("boundary-arrow");
  else {
    const tip = arrow
      .getPointAtLength(arrow.getTotalLength())
      .matrixTransform(arrow.getScreenCTM()!);
    if (Math.hypot(tip.x - last.x, tip.y - last.y) > 2)
      problems.push("boundary-arrow-endpoint");
  }
  return problems;
}
