import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KvRowConcat } from "../src/components/KvRowConcat";

describe("KV 行拼接保留来源和行位置", () => {
  it.each([
    [3, 3, 3],
    [4, 3, 3],
    [29, 21, 29],
  ])("第 %s 层保留来源层 %s 与选行层 %s", (layer, kvSource, indexSource) => {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
      <KvRowConcat
        layer={layer}
        kvSource={kvSource}
        indexSource={indexSource}
      />,
    );
    expect(root.querySelector(".katex-error")).toBeNull();
    for (const kind of ["local", "global"]) {
      const values = (side: string) =>
        [
          ...root.querySelectorAll(
            `[data-concat-rows="${kind}-${side}"] [data-concat-row]`,
          ),
        ].map((el) => el.getAttribute("data-concat-row"));
      expect(values("input")).toHaveLength(3);
      expect(values("output")).toEqual(values("input"));
      for (const side of ["input", "output"])
        expect(
          [
            ...root.querySelectorAll(
              `[data-concat-rows="${kind}-${side}"] [aria-label]`,
            ),
          ].map((el) => el.getAttribute("aria-label")),
        ).toContain("\\vdots");
    }
    expect(root.querySelector("[data-concat-global]")?.textContent).toContain(
      "按已排序的选中行号",
    );
    const tex = [...root.querySelectorAll("[aria-label]")].map((el) =>
      el.getAttribute("aria-label"),
    );
    expect(tex).toContain("m_t=\\min(128,t),\\quad r=\\max(1,t-127)");
    expect(tex).toContain("m_t\\times512");
    expect(tex).toContain(`L_t=m_t+K_{${indexSource},t}`);
    expect(tex).toContain(`\\mathbf g_{${kvSource},i_{${indexSource},t,1}}`);
    expect(tex).toContain(
      `(\\mathrm{KV}_{${layer},t})_{j,d}=u_{${layer},r+j-1,d},\\quad 1\\le j\\le m_t`,
    );
    expect(tex).toContain(
      `(\\mathrm{KV}_{${layer},t})_{m_t+j,d}=g_{${kvSource},i_{${indexSource},t,j},d},\\quad 1\\le j\\le K_{${indexSource},t},\\quad d=1,\\ldots,512`,
    );
    expect(root.textContent).not.toContain("÷");
  });
});
