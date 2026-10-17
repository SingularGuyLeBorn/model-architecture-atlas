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
    expect(tex).toContain(`L_t=m_t+K_{${layer},t}`);
    expect(tex).toContain(`\\mathbf g_{${layer},i_{${layer},t,1}}`);
    expect(tex).toContain(
      `(\\mathrm{KV}_{${layer},t})_{j,d}=u_{${layer},r+j-1,d},\\quad 1\\le j\\le m_t`,
    );
    expect(tex).toContain(
      `(\\mathrm{KV}_{${layer},t})_{m_t+j,d}=g_{${layer},i_{${layer},t,j},d},\\quad 1\\le j\\le K_{${layer},t},\\quad d=1,\\ldots,512`,
    );
    expect(root.textContent).not.toContain("÷");
    for (const row of root.querySelectorAll("[data-concat-row]")) {
      expect(row.lastElementChild!.textContent).not.toContain("维");
      expect(
        row.lastElementChild!.querySelectorAll("[aria-label]"),
      ).toHaveLength(5);
      expect(row.querySelectorAll("[data-concat-element]")).toHaveLength(3);
    }
    for (const kind of ["local", "global"]) {
      const elements = (side: string) =>
        [
          ...root.querySelectorAll(
            `[data-concat-rows="${kind}-${side}"] [data-concat-element] [aria-label]`,
          ),
        ].map((el) => el.getAttribute("aria-label"));
      expect(elements("output")).toEqual(elements("input"));
      expect(elements("input")).toHaveLength(9);
    }
    expect(tex).toContain(`u_{${layer},r,512}`);
    expect(tex).toContain(`g_{${layer},i_{${layer},t,K_{${layer},t}},512}`);
    const fill = (region: string) =>
      (
        root.querySelector(
          `[data-concat-rows="${region}"] [data-concat-element]`,
        ) as HTMLElement
      ).style.backgroundColor;
    expect(fill("local-input")).toBe(fill("local-output"));
    expect(fill("global-input")).toBe(fill("global-output"));
    expect(fill("local-input")).not.toBe(fill("global-input"));
  });
});
