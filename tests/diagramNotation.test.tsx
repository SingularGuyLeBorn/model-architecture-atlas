import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { expect, it } from "vitest";
import {
  MhcPost,
  LayerHandoff,
  Expert,
} from "../src/compositions/DeepSeekV41Layer";
import {
  MhcProjection,
  MhcSinkhorn,
} from "../src/components/MhcCoefficientStages";

function render(element: ReactElement) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(element);
  expect(root.querySelector(".katex-error")).toBeNull();
  return root;
}

it.each(["A", "F"] as const)(
  "%s 回写在第一次简写之前定义完整分量映射",
  (sublayer) => {
    const root = render(<MhcPost layer={15} sublayer={sublayer} />);
    for (const branch of root.querySelectorAll(
      "[data-mhc-elementwise-broadcast]",
    )) {
      const alias = branch.querySelector("[data-notation-alias]")!;
      expect(
        alias.querySelector("[aria-label]")!.getAttribute("aria-label"),
      ).toBe(
        `o_d:=o_{15,t,d}${sublayer === "F" ? "^{\\mathrm{FFN}}" : ""},\\quad d=1,\\ldots,5120`,
      );
      expect(
        alias.compareDocumentPosition(
          branch.querySelector("[data-mhc-broadcast-element]")!,
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  },
);

it("层间 p 向量明确取行与四个分量，专家给出两项逐元素乘法", () => {
  const handoff = render(<LayerHandoff layer={15} count="N" />);
  expect(
    handoff
      .querySelector("[data-notation-alias] [aria-label]")
      ?.getAttribute("aria-label"),
  ).toContain("p_j:=p^{F}_{15,t,j}");
  const expert = render(<Expert layer={15} index={7} />);
  const terms = [
    ...expert.querySelectorAll("[data-expert-product-examples] [aria-label]"),
  ].map((el) => el.getAttribute("aria-label"));
  expect(terms).toEqual([
    "c_{t,1}=a_{t,1}\\cdot b_{t,1}",
    "c_{t,2}=a_{t,2}\\cdot b_{t,2}",
  ]);
});

it("参数标签按内容定宽定高，归一化稳定项直接写进结果等式", () => {
  const projection = render(<MhcProjection layer={15} sub="F" />);
  const columns = projection.querySelector<HTMLElement>(
    "[data-mhc-parameter-columns]",
  )!;
  expect(columns.style.gridTemplateColumns).toBe("repeat(4,max-content)");
  for (const cell of columns.querySelectorAll<HTMLElement>(":scope > div"))
    expect(cell.style.padding).toBe("4px 8px");
  const sinkhorn = render(
    <MhcSinkhorn>
      <span>输出</span>
    </MhcSinkhorn>,
  );
  const tex = [...sinkhorn.querySelectorAll("[aria-label]")].map(
    (el) => el.getAttribute("aria-label")!,
  );
  expect(
    tex.filter(
      (value) => value.includes("downarrow") && value.includes("epsilon"),
    ),
  ).toEqual([]);
  expect(tex).toContain("T_{11}=\\frac{e_{11}}{d_1}+\\epsilon_{HC}");
  expect(tex).toContain("d^{col}_1=T_{11}+T_{21}+T_{31}+T_{41}+\\epsilon_{HC}");
});
