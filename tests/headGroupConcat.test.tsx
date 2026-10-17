import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { HeadGroupConcat } from "../src/components/HeadGroupConcat";

it("先纯拼接保留原 O/o、圈出来源列块，再提示改名 C；不把八组全铺开", () => {
  for (const count of ["N", "1"]) {
    for (const group of [1, 2, 8]) {
      const root = document.createElement("div");
      root.innerHTML = renderToStaticMarkup(
        <HeadGroupConcat layer={25} group={group} count={count} />,
      );
      expect(root.querySelector(".katex-error")).toBeNull();
      expect(root.querySelectorAll("[data-original-head]")).toHaveLength(3);
      expect(root.textContent).toContain("列 1–512");
      expect(root.textContent).toContain("列 513–1024");
      expect(root.textContent).toContain("列 3585–4096");
      const formulas = [...root.querySelectorAll("annotation")].map(
        (e) => e.textContent,
      );
      for (const offset of [1, 2, 8]) {
        const head = 8 * (group - 1) + offset;
        expect(formulas).toContain(`O_{25,${head}}`);
        expect(formulas).toContain(
          `\\mathbf o_{25,${head},${count === "1" ? "t" : "1"}}`,
        );
      }
      expect(root.textContent).toContain("同一矩阵命名为 C");
    }
  }
});
