// 历史编号按原 session 的 response_item/user 顺序；原始会话只读，不进入仓库。
// 本表记录约束和已知检查入口，不把“文件存在”或“有 expect”认定为行为通过。
export const sessionFileName =
  "rollout-2026-10-14T22-25-53-01a13ace-1c33-7e51-bfd8-a117dba60611.jsonl";
const rules = `
S01|7,9,13,96|图用嵌套矩阵、向量、元素结构，不用公式墙代替|structure-semantics.md#图形语法|tests/catalog.test.tsx,e2e/model-expansion.spec.ts
S02|5,6,14,21|残差保留真实长旁路和箭头，结果使用新状态及等式|structure-semantics.md#层间交接|tests/deepseekAggregation.test.ts,e2e/mimo-wire-audit.spec.ts
S03|5,6,15,97|MoE 展开专家内部、完整输入输出及代表专家|structure-semantics.md#路由与专家|tests/deepseekExpertStructure.test.ts,e2e/edge-arrow-clearance.spec.ts
S04|6,14,15,58,76|Router 展开分数矩阵、Top-K、高低分及专家对应|structure-semantics.md#路由与专家|tests/deepseekRouterLayout.test.ts,e2e/deepseek-selection.spec.ts
S05|14,15,76|共享与非共享专家分组；输入旁路与输出权重分开|structure-semantics.md#路由与专家|tests/deepseekRouterLayout.test.ts,tests/layerColors.test.tsx
S06|9,38,47,49,74|矩阵由行列向量组成，向量横向展开代表元素|structure-semantics.md#图形语法|tests/headGroupConcat.test.tsx,e2e/matrix-grid.spec.ts
S07|56,97,177,197|首、次、末至少三项；只有两项则全展示|structure-semantics.md#图形语法|e2e/head-flow.spec.ts,e2e/projection-contracts.spec.ts
S08|78,82,177,197,237|省略号位于省略轴并按列对齐，选区包住被省略区域|structure-semantics.md#图形语法|tests/headGroupConcat.test.tsx,e2e/matrix-grid.spec.ts
S09|12,25,33,39,96|LaTeX 解析、转义、上下标与裸命令残留均检查|react-flow-layout.md#latex-渲染|tests/mathMarkup.test.tsx,e2e/atlas.spec.ts
S10|6,14,40,169|变量保留层号、Head、token 和正确的标量向量矩阵粒度|structure-semantics.md#变量参数与阶段命名|tests/diagramNotation.test.tsx,tests/mimoLayerRecipe.test.tsx
S11|25,26,28,92,102|Tokenizer、Embedding、完整投影到当前 t 行的来源链|structure-semantics.md#变量参数与阶段命名|tests/deepseekInputFlow.test.ts,e2e/variable-search-prefill.spec.ts
S12|40,49,92|两层 Query 投影保留完整升维矩阵再取行拆 Head|structure-semantics.md#投影与多头注意力|tests/deepseekInputFlow.test.ts,e2e/model-expansion.spec.ts
S13|22,23,35,36|禁止代码切片充当选择，源矩阵高亮并标原行号|structure-semantics.md#选择切片与窗口必须展开高亮|tests/kvRowConcat.test.tsx,e2e/deepseek-selection.spec.ts
S14|48,49|同一对象可换行展开；不重复复制相同选中矩阵|structure-semantics.md#选择切片与窗口必须展开高亮|e2e/variable-search-prefill.spec.ts,e2e/selected-matrix-size.spec.ts
S15|14,16,44|同号 Q/K/V 进入同 Head；不为嵌套组成画无意义线|structure-semantics.md#投影与多头注意力|tests/mimoLayerRecipe.test.tsx,e2e/head-flow.spec.ts
S16|99,105,106|RoPE、RMSNorm、SiLU、mHC、Engram 不缩成黑箱名称|structure-semantics.md#算子内部展开|tests/rmsStructure.test.tsx,tests/siluStructure.test.tsx,e2e/head-flow.spec.ts
S17|97,103|SiLU 保留原值与 sigmoid 两路，结果符号前后一致|structure-semantics.md#算子内部展开|tests/siluStructure.test.tsx,e2e/silu-structure.spec.ts
S18|142,143,146,153,234,236|简单平方、指数、除法不机械拆步，不画装饰小箭头|structure-semantics.md#简单计算的展开边界|e2e/simple-operators-contrast.spec.ts,e2e/compact-normalization.spec.ts
S19|177,180|不用 ÷；缩放用正式分式并定义维度|structure-semantics.md#图形语法|tests/diagramNotation.test.tsx,tests/deepseekRmsNorm.test.ts
S20|163,177,195,234|简写、赋值、拼接换名先给映射并保留原块和索引|structure-semantics.md#拼接保留来源与索引|tests/headGroupConcat.test.tsx,tests/diagramNotation.test.tsx,e2e/concat-and-route-regression.spec.ts
S21|192|乘权重一列只能输出标量，完整向量对应完整矩阵|structure-semantics.md#图形语法|tests/compressorProjection.test.tsx,e2e/projection-contracts.spec.ts
S22|34,127,180,193|参数来源区分独立参数、派生、切片与运行时结果|structure-semantics.md#变量参数与阶段命名|tests/compressorProjection.test.tsx,tests/diagramNotation.test.tsx
S23|114,172,174,175|mHC 四路复制完整向量，子层只算一次，p/q/C 来源明确|structure-semantics.md#加权汇合与输出命名|tests/deepseekMhcEngram.test.ts,tests/moduleInspector.test.tsx
S24|117,118,131,174|mHC 混合与输出回写平行，两路计算后汇合|structure-semantics.md#并行汇合与整体排版|e2e/mhc-reading.spec.ts,e2e/mhc-output-compact.spec.ts
S25|118,131,162,180|Σ 方形透明中性色，各输入有箭头且入口分开|react-flow-layout.md#运算节点|e2e/sum-source-attachment.spec.ts,e2e/handoff-and-sums.spec.ts
S26|100,283|加权乘积仍是向量，结果有合理外框并连入求和|structure-semantics.md#图形语法|e2e/content-bounds.spec.ts,tests/compressorPooling.test.tsx
S27|127,128|下一层使用对象单独交接，状态与系数不能误接成相加|structure-semantics.md#层间交接|tests/deepseekMhcEngram.test.ts,e2e/kv-handoff-layout.spec.ts
S28|326,329|各 Query Head 保留代表支路，取同号行并写回同号结果|structure-semantics.md#代表-head-与写回|e2e/head-flow.spec.ts
S29|327,329|Q/K 分别旋转，不能临时改名 w 再消失|structure-semantics.md#代表-head-与写回|e2e/head-flow.spec.ts
C01|29,30,31,208,211,214|区分时间历史复用与跨层共享；Full 不重算全部历史|structure-semantics.md#本地窗口-kv全局压缩-kv-与复用|tests/cacheSemantics.test.tsx,tests/cacheDecode.test.tsx
C02|32,34,79,83,186|本地 U、全局 G 的输入、参数、生成、消费者都有来源|structure-semantics.md#本地窗口-kv全局压缩-kv-与复用|tests/perLayerCache.test.tsx,e2e/indexer-origins.spec.ts
C03|216,217,219,229,231,233,234,235|本层新 KV 与旧窗口接起来，淘汰、保留、追加、读取分开|structure-semantics.md#选择切片与窗口必须展开高亮|tests/perLayerCache.test.tsx,e2e/layer-two-swa.spec.ts
C04|57,87,229|窗口按逻辑行展示，后续决定取代早期环形方案|structure-semantics.md#选择切片与窗口必须展开高亮|tests/perLayerCache.test.tsx,e2e/layer-cache-inline.spec.ts
C05|229,231|层间传隐藏状态，不拼上一层本地 KV；参数 SWA 不等于窗口|structure-semantics.md#本地窗口-kv全局压缩-kv-与复用|tests/perLayerCache.test.tsx,e2e/layer-two-swa.spec.ts
C06|216,219,234|压缩暂存与组满追加分开，旧 G/Key 保留|structure-semantics.md#本地窗口-kv全局压缩-kv-与复用|tests/cacheDecode.test.tsx,tests/compressorPooling.test.tsx
C07|222,224,228,229|Full/Reindex/Reuse 显示不同参数路径和完整共享范围|structure-semantics.md#跨层复用的完整范围|tests/cacheSemantics.test.tsx,tests/perLayerCache.test.tsx
C08|228,229|来源别名等式先声明；G、Key、ID、掩码各自追踪来源|structure-semantics.md#本地窗口-kv全局压缩-kv-与复用|tests/perLayerCache.test.tsx,e2e/cache-semantics.spec.ts
C09|185,186,187,202|Indexer 是 Query 给 G 行打分；分数矩阵标行列意义|structure-semantics.md#本地窗口-kv全局压缩-kv-与复用|tests/deepseekIndex.test.tsx,e2e/indexer-origins.spec.ts
C10|187,189|η×A 展开代表候选列的同一次 Head 归约，不重复加权|structure-semantics.md#加权汇合与输出命名|tests/deepseekRmsNorm.test.ts,e2e/indexer-compact.spec.ts
C11|220,225,227|筛选示例超过上限；候选掩码、分数、ID 和 G 高亮一致|structure-semantics.md#共享候选与重新选行|tests/reindexCandidates.test.tsx,e2e/deepseek-selection.spec.ts
C12|219,222,224|Reuse 用同 token 的 ID；Reindex 不误读前一层最终 ID 池|structure-semantics.md#共享候选与重新选行|tests/reindexCandidates.test.tsx,tests/cacheSemantics.test.tsx
C13|234,253,260,262|U 与选中 G 按行拼接；原索引与两来源色保留，列数不变|structure-semantics.md#本地窗口-kv全局压缩-kv-与复用|tests/kvRowConcat.test.tsx,e2e/kv-row-concat.spec.ts
C14|194,196,237|候选 v 是内容，α 才是权重，逐列归一化不混成整行标量|structure-semantics.md#本地窗口-kv全局压缩-kv-与复用|tests/compressorPooling.test.tsx,e2e/compressor-projections.spec.ts
C15|106,171,222,224|Engram 按实际层存在，说明收益代价，不虚构少跑主干|structure-semantics.md#engram-的收益与代价|tests/engramPurpose.test.tsx,tests/deepseekMhcEngram.test.ts
C16|248,276,278|Engram 24 行号到两张表同号行实际连接，不靠一句文字|structure-semantics.md#engram-的收益与代价|tests/engramAddresses.test.tsx,e2e/engram-addresses.spec.ts
C17|248,279|反量化同 b 数值行与系数行对应，每个 scale 乘其 32 列|structure-semantics.md#engram-的收益与代价|tests/engramAddresses.test.tsx,e2e/engram-addresses.spec.ts
L01|16,23,33,52,135,168|内容决定宽高，尺寸自动测量，不靠固定高度顶开|react-flow-layout.md#自适应尺寸|tests/parameterHeight.test.ts,e2e/editing-regression.spec.ts
L02|52,65,115,132,148,150,152,163|元素不被父框撑宽撑高，收紧后重排外层|react-flow-layout.md#元素框按内容定宽|e2e/content-width-audit.spec.ts,e2e/parameter-height.spec.ts
L03|182,197|同矩阵格子等尺寸、同列对齐，选中不改变尺寸|react-flow-layout.md#元素框按内容定宽|e2e/matrix-grid.spec.ts,e2e/selected-matrix-size.spec.ts
L04|14,63,64,71,81,86,104,126,128,201,241,242,244,249,250,254,255|紧凑排版利用空白，独立过程横排，串行可向右折行|structure-semantics.md#并行汇合与整体排版|e2e/mhc-compact.spec.ts,e2e/indexer-compact.spec.ts,e2e/compressor-rms-horizontal.spec.ts
L05|65,115,236,240,243,253,256|数据框只放变量、形状、元素；说明放框外|structure-semantics.md#图形语法|e2e/candidate-score-caption.spec.ts,e2e/compressor-structure.spec.ts
L06|13,14,25,33,48,96,176,213,284|检查元素、长下标、末列、祖先框及宽窄屏裁切|react-flow-layout.md#自动验收|e2e/content-bounds.spec.ts,e2e/residual-containment.spec.ts
L07|285|等号、乘号等与框两侧有实际净空|react-flow-layout.md#框体间距与环形排列|e2e/content-bounds.spec.ts
L08|87,91|同级框不重叠；点击高亮原框，不叠加第二个框|react-flow-layout.md#框体间距与环形排列|e2e/internal-selection.spec.ts,tests/internalSelection.test.ts
L09|90,116,171,181|模块、连线与公式字号有层级，不能靠放大掩盖|react-flow-layout.md#画布外观与阅读|e2e/concat-and-route-regression.spec.ts
L10|70,139,144,239|删审计式元文案与不是句式；旁注完整成段，图内少文字|structure-semantics.md#文案与颜色|tests/moduleInspector.test.tsx,e2e/module-inspector.spec.ts
P01|117,138,244,251,263,265,266|语义色至少20个实际使用，不能装饰凑数|react-flow-layout.md#语义配色与透明层级|e2e/semantic-palette.spec.ts
P02|117,131,138,164,262|不同数据来源与易混淆角色分色，不按分组覆盖身份|react-flow-layout.md#语义配色与透明层级|tests/layerColors.test.tsx,e2e/color-identity.spec.ts
P03|131,144,262|同对象生成、代理、读取、消费保持身份色，拼接继承来源|react-flow-layout.md#语义配色与透明层级|tests/mhcColors.test.tsx,e2e/color-identity.spec.ts
P04|245,246,269,271,272|同色加深与琥珀共存，同组选区一致且来源可辨|react-flow-layout.md#语义配色与透明层级|tests/colorIdentity.test.tsx,e2e/selection-style.spec.ts
P05|274|填色元素自身边框同色系，虚线与元素文字四侧留净空|react-flow-layout.md#语义配色与透明层级|e2e/selection-style.spec.ts
P06|147,149,152,153,155|白底透明矩阵外框，真实元素有底色，边框导线清楚可辨|react-flow-layout.md#画布外观与阅读|tests/tensorSurface.test.tsx,e2e/white-tensor-surface.spec.ts
P07|267,268|每层配色实际扫描，不能用代表层冒充全部|react-flow-layout.md#语义配色与透明层级|e2e/all-layer-colors.spec.ts
P08|331|真实投影输入输出分色，输入生成与消费仍同色|react-flow-layout.md#语义配色与透明层级|e2e/head-flow.spec.ts,e2e/projection-contracts.spec.ts
W01|3,5,6,13,33,46,53,54,155|连续完整折线与明确源端，不出现断线或莫名短线头|react-flow-layout.md#边路由|tests/architectureBoundary.test.ts,e2e/full-route-audit.spec.ts
W02|16,19,115,317|真实内部小框接线，多变量外框不能冒充来源|react-flow-layout.md#连接身份切片与端点|tests/mimoLayerRecipe.test.tsx,e2e/head-flow.spec.ts
W03|317|部分矩阵先高亮或展示同名切片，不能从整体框含混引出|react-flow-layout.md#连接身份切片与端点|e2e/connection-semantics.spec.ts,e2e/head-flow.spec.ts
W04|317|端点在边中点或等分点，不落角落，保存恢复也遵守|react-flow-layout.md#连接身份切片与端点|tests/architectureBoundary.test.ts,e2e/mimo-wire-audit.spec.ts
W05|6,44,140,142|开放箭头、正确入边方向、净空与统一缩放，不留反向尾刺|react-flow-layout.md#边路由|e2e/edge-arrow-clearance.spec.ts,tests/architectureBoundary.test.ts
W06|33,43,47,68,159,323|不穿无关框与文字，不沿框边转弯，端点所属容器也要查|react-flow-layout.md#最少转折与整页布线检查|e2e/mimo-wire-audit.spec.ts,e2e/head-flow.spec.ts
W07|61,85,159,323|不同逻辑线不重叠，不用紧贴平行段伪装解决|react-flow-layout.md#距离与通道硬约束|e2e/route-separation.spec.ts,e2e/mimo-wire-audit.spec.ts
W08|13,156,158,159,252,322,323,325|尽量少交叉少转折，比较四侧入口，不机械下出上入|react-flow-layout.md#最少转折与整页布线检查|tests/architectureBoundary.test.ts,e2e/mimo-wire-audit.spec.ts
W09|69,89,93,115,160,161|透明标签、长线终点复述、不压框线字，编辑后仍避让|react-flow-layout.md#连线标签避让与动态保持|tests/edgeLabelLayout.test.ts,e2e/edge-label-audit.spec.ts
W10|163,317|点任意线段或箭翼高亮整条逻辑线，交叉线不连带选中|react-flow-layout.md#连接身份切片与端点|e2e/connection-semantics.spec.ts,e2e/notation-and-compactness.spec.ts
I01|4,38,39,42,55|不分阅读编辑；可拖框、沿边缩放、增删连接|react-flow-layout.md#持续可编辑交互|e2e/editing-regression.spec.ts,tests/interactiveChanges.test.tsx
I02|42,43,48,53,80|起线点悬停0.5秒显示加号，松手吸附且可换边改连|react-flow-layout.md#持续可编辑交互|tests/architectureBoundary.test.ts
I03|42,54,57,59|未选隐藏控制点；选线显示端点，线段控制仅附近显示|react-flow-layout.md#持续可编辑交互|e2e/edge-arrow-clearance.spec.ts
I04|16,42,162,317,322|内部元素、向量、运算及线能独立点击与解释|react-flow-layout.md#运算节点|tests/internalSelection.test.ts,e2e/internal-selection.spec.ts
I05|42,38|需要人工移动缩放改线的内部框是真正独立子节点|react-flow-layout.md#持续可编辑交互|tests/interactiveChanges.test.tsx
I06|59,161,176|主标签与终点标签沿线拖动、改字、撤销、保存恢复|react-flow-layout.md#连线标签避让与动态保持|e2e/editing-regression.spec.ts,e2e/edge-label-audit.spec.ts
I07|43,176,177,198|线段拖动不跳变不多出连接，正交与无关路径稳定|react-flow-layout.md#持续可编辑交互|e2e/wire-drag-topology.spec.ts,tests/architecturePerformance.test.ts
I08|43,176|Ctrl+Z/Y/Shift+Z 在画布外也有效，输入框保留原生撤销|react-flow-layout.md#持续可编辑交互|e2e/editing-regression.spec.ts
I09|38,53,167|人工尺寸、端点、路径、标签可保存恢复，失败可见|react-flow-layout.md#持续可编辑交互|e2e/editing-regression.spec.ts,e2e/kv-handoff-layout.spec.ts
I10|131,139|解释面板开关偏好、当前对象、段落内容及图文不遮挡|react-flow-layout.md#模块解释面板|tests/moduleInspector.test.tsx,e2e/module-inspector.spec.ts
I11|131|普通滚轮平移，面板滚轮只滚面板|react-flow-layout.md#持续可编辑交互|e2e/module-inspector.spec.ts
I12|164,166|左右独立、hover完整预览、导航后收回、固定才保持|react-flow-layout.md#侧栏预览与滑动|tests/railIntent.test.tsx,e2e/sidebar-preview.spec.ts
I13|166|预览延迟、滑动中不遮挡、键盘Escape和减少动态效果|react-flow-layout.md#侧栏预览与滑动|e2e/sidebar-preview.spec.ts
I14|259|变量名查找能定位实际模块及展开结果|react-flow-layout.md#自动验收|tests/variable-search.test.ts,e2e/variable-search-prefill.spec.ts
I15|210|SVG完整导出、离线公式与布局可读，不影响保存和相机|react-flow-layout.md#自动验收|e2e/cache-svg.spec.ts
F01|107,111,112,113,137,230,312,317|真实浏览器测平移缩放拖框拖线反馈、不能卡死|react-flow-layout.md#交互性能验收|e2e/interaction-budget.spec.ts,e2e/recipe-interaction-budget.spec.ts
F02|113,312,317|首次逐层入口和连续切层测就绪与长任务，不只DOM耗时|react-flow-layout.md#交互性能验收|e2e/recipe-performance.spec.ts
F03|137|历史5ms极限诉求与后续30ms门槛分开记录，不假报达标|react-flow-layout.md#交互性能验收|e2e/recipe-interaction-budget.spec.ts
Q01|15,119,152,155,159,267,322|保持服务；共享组件同类检查，不逐截图打补丁|inspection-playbook.md#每次修图的执行顺序|e2e/model-expansion.spec.ts,e2e/mimo-wire-audit.spec.ts
Q02|137,152,155,159,257,259,322|实际入口逐模块和局部截图，必须人工打开而非只生成|inspection-playbook.md#每次修图的执行顺序|e2e/head-flow.spec.ts,e2e/mimo-wire-audit.spec.ts
Q03|167,204,226,281,329|按主题本地提交，用户要求才推送部署，CI不能留红|inspection-playbook.md#每次修图的执行顺序|scripts/verify-published.mjs
Q04|16,36,118,136,155,159,161,163,166,234,257,274,283,285,329,335|反馈进skill与反例，有检测边界和故障注入证明|inspection-playbook.md#每条反馈都要有可执行检查|e2e/content-bounds.spec.ts,e2e/selection-style.spec.ts,e2e/mimo-wire-audit.spec.ts
`;
const additionalSources = {
  S01: [8, 11, 18, 20, 51, 75, 94],
  S06: [66, 67, 73, 77],
  S15: [60],
  S17: [145],
  S22: [183],
  C02: [188],
  L04: [88, 199],
  P06: [84],
  Q01: [191, 270, 275, 320, 321],
  Q02: [221, 261],
  Q03: [124, 203, 205, 206, 207, 280, 286],
  Q04: [333, 334],
};
export const dispositions = {
  98: "模型事实提问：专家分数到最终权重的变换须按具体模型核对，不能一律补 Softmax；见 S04/S22。",
  287: "赞许，无新增要求。",
  288: "模型扩展任务：MiMo、V3、R1、V3.1、V3.2、Qwen；当前模板与 catalog/recipe 单测记录范围，不等于已完成全部官方事实复核。",
  289: "授权自行查明模型身份，不授权编造；来源与配置由 src/data 及 catalog 测试维护。",
  315: "追问进展，无新增独立约束。",
  318: "范围决定：保持回退后内容，只优化当前版本，不恢复已回退音频模块。",
};
export const requirements = rules
  .trim()
  .split("\n")
  .map((line) => {
    const [id, sources, requirement, spec, tests] = line.split("|");
    const extraChecks = ["I01", "I02", "I03", "I08", "I09"].includes(id)
      ? ["e2e/boundary-interaction.spec.ts"]
      : [];
    if (["P03", "S21"].includes(id))
      extraChecks.push("e2e/projection-contracts.spec.ts");
    return {
      id,
      sources: [
        ...sources.split(",").map(Number),
        ...(additionalSources[id] ?? []),
      ].sort((a, b) => a - b),
      requirement,
      spec: spec.replace("#路由与专家", "#router-与-moe"),
      tests: [...new Set([...tests.split(","), ...extraChecks])],
    };
  });
