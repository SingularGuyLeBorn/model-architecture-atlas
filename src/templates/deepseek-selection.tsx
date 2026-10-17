import { MathFormula as M } from "../components/diagram-primitives";
import { ObjectConnections } from "../components/ObjectConnections";
import { Down } from "./structure-blocks";
import {
  Columns,
  Flow,
  Matrix,
  Operation,
  Row,
  Scalar,
} from "./architecture-blocks";
import type { Phase, Stage } from "./recipes";

/** 固定实现对完整 Prefill 批次取 K 项；因果掩码在散射后再次相加。 */
export function dsaSelectionShape(phase: Phase) {
  const length = phase === "prefill" ? "N" : "t";
  return { length, budget: `\\min(2048,${length})`, visible: "\\min(2048,t)" };
}

export function deepseekSelectionStages(phase: Phase, layer: number): Stage[] {
  const l = String(layer),
    { length: n, budget } = dsaSelectionShape(phase);
  const score = `s^I_{${l},t}`,
    masked = `\\bar s^I_{${l},t}`;
  const ids = `I_{${l},t}`,
    mask = `m^I_{${l},t}`;
  const causal = `c^{mask}_{${l},t}`;
  // [OM-FREEPLAY] 三个按位置排列的代表项，仅表示选区映射，不虚构实际模型排名。
  const selected = ["j_a", "j_b", "j_c"];
  const rows = ["1", "…", "j_a", "j_b", "…", "j_c", "…", "t"];
  const make = (
    id: string,
    title: string,
    body: Stage["body"],
    output: string,
    width: number,
  ): Stage => ({ id, title, body, output, width, inlinePorts: true });
  return [
    make(
      "index-select",
      "DSA · 因果分数 → Top-K 原 token 行号 → 读取掩码",
      <>
        <p className="architecture-note">
          {phase === "prefill"
            ? "完整 Prefill：N 行并行计算；这里固定查询 t，未来 j > t 不可读。"
            : "Decode：本步查询 t，候选为本层已写入的 1…t 行。"}
        </p>
        <Flow>
          {[
            <Row key="s" name={score} size={n} tone="plum" direction="in" />,
            <Operation
              key="causal"
              tex={`+${causal}`}
              label="逐列加因果掩码"
            />,
            <Row
              key="masked"
              name={masked}
              size={n}
              tone="violet"
              element={(j) => `\\bar s^I_{${l},t,${j}}`}
            />,
            <Operation
              key="topk"
              tex={`\\operatorname{TopK}_{K},\\quad K=${budget}`}
              label="按分数返回 K 个原行号"
            />,
            <Row
              key="ids"
              name={ids}
              size="K"
              tone="amber"
              element={(d) => `i_{${l},t,${d}}`}
            />,
          ]}
        </Flow>
        <p className="architecture-note">
          <M
            tex={`${causal},\\quad c^{mask}_{${l},t,j}=\\begin{cases}0&j\\le t\\\\-\\infty&j>t\\end{cases}`}
          />
        </p>
        <Down label="行号散射回原 token 列；不按 Top-K 排名重排缓存" />
        <p className="architecture-note">
          <M
            tex={`b^I_{${l},t,j}=\\begin{cases}0&j\\in ${ids}\\\\-\\infty&j\\notin ${ids}\\end{cases}`}
          />
          。 下方取三个有效命中槽 <M tex={"r_a,r_b,r_c\\in\\{1,\\ldots,K\\}"} />
          ；槽号保留各自的分数排名。
        </p>
        <ObjectConnections
          links={selected.map((j) => ({
            from: `id-${j}`,
            to: `selected-${j}`,
          }))}
        >
          <Columns>
            {selected.map((j) => (
              <div key={j}>
                <p className="architecture-caption">
                  <M tex={`i_{${l},t,r_${j.at(-1)}}=${j}\\le t`} />
                </p>
                <div
                  className="architecture-id-anchor"
                  data-trace-object={`id-${j}`}
                >
                  <Scalar tex={j} tone="amber" />
                </div>
              </div>
            ))}
          </Columns>
          <div className="architecture-gate-branches">
            <Row
              name={mask}
              size={n}
              tone="violet"
              direction="out"
              columns={["1", "…", ...selected, "…", n]}
              element={(j) =>
                selected.includes(j) ? "0" : `m^I_{${l},t,${j}}`
              }
              selectedColumns={selected}
              columnTrace={(j) =>
                selected.includes(j) ? `selected-${j}` : undefined
              }
            />
          </div>
        </ObjectConnections>
        <p className="architecture-note">
          <M tex={`m^I_{${l},t,j}=b^I_{${l},t,j}+c^{mask}_{${l},t,j}`} />。
          {phase === "prefill"
            ? "t < K 时，返回行号可能含未来位置，但相加后的掩码仍将它们排除。"
            : "Decode 全部候选已经可见，因果掩码为零。"}
          有效行数为 <M tex={"\\min(2048,t)"} />
          ；分数并列时不承诺固定的行号次序。
        </p>
      </>,
      mask,
      1400,
    ),
    make(
      "index-read",
      "DSA · 同一选区对应内容缓存和位置缓存的同一个原 token",
      <>
        <p className="architecture-note">
          固定查询 t；下方把同一掩码的因果前缀转为列向量，对齐两张缓存的原 token
          行号。
        </p>
        <p className="architecture-note">
          <M tex="1<j_a<j_b<j_c<t" />{" "}
          为有效选区中的三条代表行；省略的行也按相同规则读取。缓存维持原位置顺序。
        </p>
        <ObjectConnections
          links={[0, 1].map((branch) => ({
            from: "read-mask",
            to: `mask-copy-${branch}`,
          }))}
        >
          <Row
            name={mask}
            size={n}
            tone="violet"
            direction="in"
            trace="read-mask"
          />
          <div className="architecture-gate-branches">
            <Columns>
              {[
                {
                  name: `C^{KV}_{${l},\\le t}`,
                  stem: "c^{KV}",
                  width: 512,
                  tone: "ocean" as const,
                  label: "内容潜缓存 · 512 维",
                },
                {
                  name: `K^R_{${l},\\le t}`,
                  stem: "k^R",
                  width: 64,
                  tone: "violet" as const,
                  label: "位置缓存 · 64 维",
                },
              ].map((cache, branch) => (
                <div key={cache.name} data-dsa-cache={branch}>
                  <ObjectConnections
                    links={selected.map((j) => ({
                      from: `mask-${branch}-${j}`,
                      to: `cache-${branch}-${j}`,
                      direction: "right",
                    }))}
                  >
                    <div className="dsa-cache-map">
                      <Matrix
                        name={`(m^{read}_{${l},t})^\\top`}
                        shape={"t\\times1"}
                        rows={rows}
                        columns={["1"]}
                        tone="violet"
                        trace={`mask-copy-${branch}`}
                        element={(j) =>
                          selected.includes(j) ? "0" : `m^I_{${l},t,${j}}`
                        }
                        rowTrace={(j) =>
                          selected.includes(j)
                            ? `mask-${branch}-${j}`
                            : undefined
                        }
                      />
                      <Matrix
                        name={cache.name}
                        title={cache.label}
                        shape={`t\\times${cache.width}`}
                        rows={rows}
                        columns={["1", "2", "…", String(cache.width)]}
                        tone={cache.tone}
                        direction="in"
                        selected={selected}
                        element={(j, d) => `${cache.stem}_{${l},${j},${d}}`}
                        rowTrace={(j) =>
                          selected.includes(j)
                            ? `cache-${branch}-${j}`
                            : undefined
                        }
                      />
                    </div>
                  </ObjectConnections>
                </div>
              ))}
            </Columns>
          </div>
        </ObjectConnections>
        <p className="architecture-note">
          高亮只表示本次可读，未选中的缓存不删除。两张表共用同一原 token
          行号；参考实现将掩码加到 MLA 分数，不额外拼出一张重排缓存。
        </p>
        <p className="architecture-note">
          <M tex={`m^{read}_{${l},t,j}:=m^I_{${l},t,j},\\quad 1\\le j\\le t`} />{" "}
          · 下游 MLA 使用同一列掩码。
        </p>
        <Row
          name={`m^{read}_{${l},t}`}
          size="t"
          tone="violet"
          direction="out"
          element={(j) => `m^I_{${l},t,${j}}`}
        />
      </>,
      `m^{read}_{${l},t}`,
      1350,
    ),
  ];
}
