import type { Phase, RecipeLink, Stage } from "./recipes";
import { MathFormula as M } from "../components/diagram-primitives";
import { ObjectConnections } from "../components/ObjectConnections";
import { Columns, Matrix, Row, Scalar } from "./architecture-blocks";
import { Down } from "./structure-blocks";

const features = ["1", "2", "…", "2560"];
const lanes = ["1", "2", "3", "4"];
const currentId = String.raw`\operatorname{id}_t`;

/** 文本输入按 token ID 查表；四路仅复制，不在这里加入位置向量。 */
export function qwenInputStages(phase: Phase) {
  const prefill = phase === "prefill";
  const positions = prefill ? ["1", "2", "…", "t", "…", "N"] : ["t"];
  const stages: Stage[] = [
    {
      id: "input",
      title: "Layer 1 · Token ID 查表，取出当前行",
      inlinePorts: true,
      width: 1250,
      output: "e_t",
      body: (
        <>
          <p className="architecture-note">
            Tokenizer 输出整数 ID；此处为无 padding 的文本路径。
            {prefill
              ? "每个位置独立查表；高亮任意位置 t。"
              : "本步仅输入当前位置 t；历史由各层缓存保留。"}
          </p>
          <ObjectConnections
            links={[
              { from: "id-position", to: "id-current" },
              {
                from: "id-current",
                to: "embedding-selected",
                direction: "right",
              },
              {
                from: "embedding-selected",
                to: "embedding-gathered",
                direction: "right",
              },
            ]}
          >
            <div className="architecture-equation" style={{ gap: 110 }}>
              <div>
                <Row
                  name="I^{in}"
                  size={prefill ? "N" : 1}
                  columns={positions}
                  selectedColumns={["t"]}
                  columnTrace={(p) => (p === "t" ? "id-position" : undefined)}
                  element={(j) => String.raw`\operatorname{id}_{${j}}`}
                  tone="slate"
                />
                <div
                  style={{
                    marginTop: 60,
                    width: "max-content",
                    marginInline: "auto",
                  }}
                  data-trace-object="id-current"
                >
                  <Scalar tex={currentId} tone="amber" />
                </div>
              </div>
              <Matrix
                name="E^{tok}"
                shape="248320\times2560"
                tone="indigo"
                title="独立的输入 embedding 参数"
                rows={["0", "1", "…", currentId, "…", "248319"]}
                columns={features}
                selected="\operatorname{id}_t"
                rowTrace={(r) =>
                  r === currentId ? "embedding-selected" : undefined
                }
                element={(r, d) => `E^{tok}_{${r},${d}}`}
              />
              <Matrix
                name="X^{emb}"
                shape={`${prefill ? "N" : "1"}\\times2560`}
                title="按输入位置排列的查表结果"
                tone="blue"
                rows={positions}
                columns={features}
                selected="t"
                rowTrace={(r) => (r === "t" ? "embedding-gathered" : undefined)}
                rowPort={(r) =>
                  r === "t" ? { tex: "e_t", direction: "out" } : undefined
                }
                element={(r, d) => `e_{${r},${d}}`}
              />
            </div>
          </ObjectConnections>
          <p className="architecture-note">
            <M tex="e_{t,d}=E^{tok}_{\operatorname{id}_t,d},\quad d=1,\ldots,2560" />{" "}
            · QSA 在注意力内部施加 RoPE；输入 embedding 不加位置向量。
          </p>
        </>
      ),
    },
    {
      id: "embedding-copy",
      title: "同一个 embedding 复制成四路",
      inlinePorts: true,
      width: 1100,
      output: "H^{in}_{1,t}",
      body: (
        <ObjectConnections
          links={lanes.map((j) => ({
            from: "embedding-source",
            to: `embedding-copy-${j}`,
          }))}
        >
          <Row
            name="e_t"
            size={2560}
            direction="in"
            tone="blue"
            trace="embedding-source"
          />
          <div style={{ marginTop: 48 }}>
            <Columns>
              {lanes.map((j) => (
                <Row
                  key={j}
                  name={`h^{in}_{1,${j},t}`}
                  size={2560}
                  tone="blue"
                  trace={`embedding-copy-${j}`}
                  element={(d) => `e_{t,${d}}`}
                />
              ))}
            </Columns>
          </div>
          <Down />
          <Matrix
            name="H^{in}_{1,t}"
            shape="4\times2560"
            rows={lanes}
            columns={features}
            element={(j, d) => `h^{in}_{1,${j},t,${d}}`}
            tone="blue"
            direction="out"
          />
          <p className="architecture-note">
            <M tex="h^{in}_{1,j,t,d}=e_{t,d},\quad j=1,2,3,4" /> ·{" "}
            {prefill
              ? "对 N 个输入位置分别复制；上图展开其中位置 t。"
              : "本步四路均属于当前位置 t。"}
          </p>
        </ObjectConnections>
      ),
    },
  ];
  const links: RecipeLink[] = [
    { source: "input", target: "embedding-copy", tex: "e_t" },
  ];
  return { stages, links };
}
