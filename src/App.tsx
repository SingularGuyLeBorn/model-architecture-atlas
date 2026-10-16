import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { BookOpen, Layers, ExternalLink, Menu, X, Code2 } from "lucide-react";
import {
  models,
  chapterNames,
  type Chapter,
  type ModelId,
} from "./data/models";
import { recipeFor, type Phase } from "./templates/recipes";
import { RecipeCanvas } from "./templates/RecipeCanvas";
import { MathFormula } from "./components/diagram-primitives";

const DetailedLayer = lazy(() =>
  import("./compositions/DeepSeekV41Layer").then((module) => ({
    default: module.DeepSeekV41Layer,
  })),
);
function routeFromUrl() {
  const params = new URLSearchParams(location.hash.slice(1));
  const model =
    models.find((item) => item.id === params.get("model")) ?? models[0];
  const requested = params.get("chapter") as Chapter;
  return {
    id: model.id,
    chapter: model.chapters.includes(requested) ? requested : model.chapters[0],
  };
}
export function App() {
  const [route, setRoute] = useState(routeFromUrl);
  const [phase, setPhase] = useState<Phase>("prefill");
  const [layer, setLayer] = useState(1);
  const [sources, setSources] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const syncRoute = () => {
      setRoute(routeFromUrl());
      setLayer(1);
    };
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);
  const model = models.find((item) => item.id === route.id)!;
  const recipe = useMemo(
    () =>
      route.chapter === "layer"
        ? null
        : recipeFor(model, route.chapter, phase, layer),
    [model, route.chapter, phase, layer],
  );
  const navigate = (id: ModelId, chapter: Chapter) => {
    const next = models.find((item) => item.id === id)!;
    const selected = next.chapters.includes(chapter) ? chapter : "overview";
    setRoute({ id, chapter: selected });
    setLayer(1);
    setMenu(false);
    history.replaceState(null, "", `#model=${id}&chapter=${selected}`);
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <div className="brand">
          <Layers size={26} />
          <div>
            主流的模型<small>架构全解析</small>
          </div>
          <button
            className="close-menu icon-button"
            aria-label="关闭菜单"
            onClick={() => setMenu(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="nav-caption">
          MODEL ATLAS <span>01 / DEEPSEEK</span>
        </div>
        <nav aria-label="模型选择" className="model-nav">
          {models.map((item) => (
            <button
              key={item.id}
              aria-current={route.id === item.id ? "page" : undefined}
              onClick={() => navigate(item.id, "overview")}
            >
              <span>{item.name}</span>
              <small>{item.subtitle}</small>
            </button>
          ))}
        </nav>
        <div className="nav-caption">展开机制</div>
        <nav aria-label="章节选择" className="chapter-nav">
          {model.chapters.map((chapter, i) => (
            <button
              key={chapter}
              aria-current={route.chapter === chapter ? "page" : undefined}
              onClick={() => navigate(model.id, chapter)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {chapterNames[chapter]}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <BookOpen size={16} />
          <span>
            官方配置 · 可追溯来源
            <br />
            结构先行，公式用于核对。
          </span>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-scrim"
          aria-label="关闭导航"
          onClick={() => setMenu(false)}
        />
      )}
      <main className="main">
        <header className="page-header">
          <div className="heading">
            <button
              className="mobile-menu icon-button"
              aria-label="打开导航"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <div>
              <span className="eyebrow">{model.name}</span>
              <h1>{chapterNames[route.chapter]}</h1>
            </div>
          </div>
          <button
            className="sources-button"
            onClick={() => setSources(!sources)}
            aria-expanded={sources}
          >
            <Code2 size={16} />
            来源与公式
          </button>
        </header>
        <div className="model-strip">
          <span>{model.config.num_hidden_layers} 层</span>
          <span>{model.config.hidden_size} 维</span>
          <span>{model.config.num_attention_heads} Heads</span>
          <span>
            {model.config.n_routed_experts} 专家 / 激活{" "}
            {model.config.num_experts_per_tok}
          </span>
          <span className="verified">
            配置固定到 {model.provenance.revision.slice(0, 7)}
          </span>
        </div>
        {route.chapter !== "layer" && (
          <div className="chapter-tools">
            <div className="segmented">
              {(["prefill", "decode"] as Phase[]).map((value) => (
                <button
                  key={value}
                  aria-pressed={phase === value}
                  onClick={() => setPhase(value)}
                >
                  {value === "prefill" ? "Prefill · N 行" : "Decode · 当前一行"}
                </button>
              ))}
            </div>
            {route.chapter === "csa" && (
              <label>
                层{" "}
                <select
                  value={layer}
                  onChange={(event) => setLayer(Number(event.target.value))}
                >
                  {Array.from(
                    { length: model.config.num_hidden_layers },
                    (_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}
                      </option>
                    ),
                  )}
                </select>
              </label>
            )}
            <div className="legend">
              <i className="blue" />
              输入 / 缓存
              <i className="green" />
              计算结果
              <i className="amber" />
              参数
              <i className="violet" />
              混合 / 记忆
              <i className="rose" />
              门控
              <i className="cyan" />
              加权项
            </div>
          </div>
        )}
        {recipe && <p className="chapter-intro">{recipe.introduction}</p>}
        <section className="diagram-area" aria-label="交互结构图">
          <ReactFlowProvider
            key={`${model.id}-${route.chapter}-${phase}-${layer}`}
          >
            {recipe ? (
              <RecipeCanvas
                recipe={recipe}
                storageKey={`model-atlas:v1:${model.id}:${route.chapter}:${phase}:${layer}`}
              />
            ) : (
              <Suspense
                fallback={<div className="loading">正在载入完整逐层图…</div>}
              >
                <DetailedLayer initialLayer={layer} />
              </Suspense>
            )}
          </ReactFlowProvider>
        </section>
      </main>
      {sources && (
        <aside className="source-drawer">
          <header>
            <h2>核对依据</h2>
            <button
              className="icon-button"
              aria-label="关闭来源"
              onClick={() => setSources(false)}
            >
              <X size={20} />
            </button>
          </header>
          <p>
            图内展开数据流；这里保留数学关系与官方来源。示例数值不代表模型运行输出。
          </p>
          {(
            recipe?.references ?? [
              { title: "官方配置", url: model.provenance.url },
              {
                title: "官方推理实现",
                url: `https://huggingface.co/deepseek-ai/${model.source}/tree/main/inference`,
              },
            ]
          ).map((ref) => (
            <a key={ref.url} href={ref.url} target="_blank" rel="noreferrer">
              {ref.title}
              <ExternalLink size={14} />
            </a>
          ))}
          {recipe?.stages
            .filter((stage) => stage.formula)
            .map((stage) => (
              <section key={stage.id}>
                <h3>{stage.title}</h3>
                <MathFormula tex={stage.formula!} display />
              </section>
            ))}
          <p>校验日期：{model.provenance.checkedAt}</p>
          <pre>{JSON.stringify(model.config, null, 2)}</pre>
        </aside>
      )}
    </div>
  );
}
