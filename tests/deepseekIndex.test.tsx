import { renderToStaticMarkup } from "react-dom/server";
import katex from "katex";
import { expect, it } from "vitest";
import {
  deepseekIndexStages,
  IndexFp8Row,
} from "../src/templates/deepseek-index";
import {
  IndexKeyNorm,
  IndexTransform,
  indexHadamardSign,
} from "../src/templates/deepseek-index-transform";
import { HalfRoPE } from "../src/templates/architecture-blocks";

function dom(body: React.ReactNode) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<>{body}</>);
  return root;
}
function formulas(root: Element) {
  return [...root.querySelectorAll("span[aria-label]")].map(
    (e) => e.getAttribute("aria-label")!,
  );
}

for (const phase of ["prefill", "decode"] as const)
  it(`DSA ${phase} 每个官方中间量均有形状及依赖`, () => {
    const { stages, links } = deepseekIndexStages(phase, 61);
    expect(stages.map((s) => s.id)).toEqual([
      "index-query",
      "index-key",
      "index-rotate-q",
      "index-rotate-k",
      "index-quant",
      "index-cache",
      "index-weights",
      "index",
    ]);
    for (const stage of stages)
      for (const tex of formulas(dom(stage.body)))
        expect(
          () => katex.renderToString(tex, { throwOnError: true }),
          `${stage.id}: ${tex}`,
        ).not.toThrow();
    const cache = dom(stages.find((s) => s.id === "index-cache")!.body);
    const n = phase === "prefill" ? "N" : "t";
    expect(formulas(cache)).toContain(`${n}\\times128`);
    expect(formulas(cache)).toContain(`${n}\\times1`);
    expect(
      formulas(cache.querySelector('[data-trace-object="row-0"]')!),
    ).toContain("k^{I8}_{61,t,128}");
    expect(
      formulas(cache.querySelector('[data-trace-object="row-1"]')!),
    ).toContain("\\sigma^K_{61,t}");
    expect(links).toContainEqual({
      source: "index-rotate-q",
      target: "index-quant",
      tex: "Q^{IH}_{61,t}",
    });
    expect(links).toContainEqual({
      source: "index-rotate-k",
      target: "index-quant",
      tex: "k^{IH}_{61,t}",
    });
    const weights = dom(stages.find((s) => s.id === "index-weights")!.body);
    expect(formulas(weights)).toContain(
      "\\beta^I_{61,t,h}=\\frac{\\widetilde\\eta^I_{61,t,h}\\sigma^Q_{61,h,t}}{\\sqrt{64}\\sqrt{128}}",
    );
    expect(weights.textContent).toContain("Head 权重可正可负");
    const score = dom(stages.find((s) => s.id === "index")!.body);
    const lines = [
      ...score.querySelectorAll(".object-connections > .architecture-equation"),
    ];
    expect(lines).toHaveLength(3);
    expect(formulas(lines[0])).toContain("\\operatorname{ReLU}");
    expect(formulas(lines[1])).toContain("\\beta^I_{61,t}");
    expect(formulas(lines[2])).toContain(`(S^K_{61,\\le ${n}})^\\top`);
  });

it("每条 128 维行一个 UE8M0 系数，且分母对应同一系数", () => {
  const root = dom(
    <IndexFp8Row input="q" output="q^8" scale="s" tone="blue" />,
  );
  expect(formulas(root)).toContain("a=\\max(10^{-4},\\max_{d=1}^{128}|u_d|)");
  expect(formulas(root)).toContain("s=2^{\\lceil\\log_2(a/448)\\rceil}");
  expect(
    formulas(root.querySelector('[data-trace-object="fp8-denominator"]')!),
  ).toEqual(["s"]);
  for (const amax of [0, 1e-7, 0.25, 1, 448, 449, 10000]) {
    const scale = 2 ** Math.ceil(Math.log2(Math.max(amax, 1e-4) / 448));
    expect(Number.isInteger(Math.log2(scale))).toBe(true);
    expect(amax / scale).toBeLessThanOrEqual(448);
  }
});

it("128 点 Hadamard 矩阵正交，使用规范化系数保持范数", () => {
  for (let a = 1; a <= 128; a++)
    for (let b = 1; b <= 128; b++) {
      let dot = 0;
      for (let d = 1; d <= 128; d++)
        dot += indexHadamardSign(a, d) * indexHadamardSign(b, d);
      expect(dot).toBe(a === b ? 128 : 0);
    }
});

it("Indexer 使用 YaRN 的前后半段配对，其他模型保留原频率", () => {
  const root = dom(
    <IndexTransform
      input="q^I_{61,h,t}"
      output="q^{IH}_{61,h,t}"
      tone="blue"
    />,
  );
  expect(formulas(root)).toContain(
    "\\phi_{t,j}=(t-1)\\,\\omega^Y_j,\\quad j=1,\\ldots,32",
  );
  expect(root.textContent).toContain("第 1、33 维");
  expect(root.textContent).toContain("第 32、64 维");
  expect(formulas(root)).toContain("u^R_{d}=u_{d},\\quad d=65,\\ldots,128");
  const original = dom(
    <HalfRoPE input="q" output="y" size={256} rotary={64} theta={10000000} />,
  );
  expect(formulas(original)).toContain(
    "\\phi_{t,j}=(t-1)\\,10000000^{-2(j-1)/64},\\quad j=1,\\ldots,32",
  );
  const bound = (rotations: number) =>
    (64 * Math.log(4096 / (rotations * 2 * Math.PI))) / (2 * Math.log(10000));
  expect(Math.floor(bound(32))).toBe(10);
  expect(Math.ceil(bound(1))).toBe(23);
});

it("索引 Key LayerNorm 使用两次归约和有偏置的向量相加", () => {
  const root = dom(<IndexKeyNorm layer={61} />);
  expect(root.querySelectorAll(".architecture-sum")).toHaveLength(3);
  expect(formulas(root)).toContain("r=\\sqrt{v+10^{-6}}");
  expect(formulas(root)).toContain("\\gamma^{IK}_{61}");
  expect(formulas(root)).toContain("b^{IK}_{61}");
  expect(root.querySelectorAll("[data-dsa-ln-summand]")).toHaveLength(2);
});
