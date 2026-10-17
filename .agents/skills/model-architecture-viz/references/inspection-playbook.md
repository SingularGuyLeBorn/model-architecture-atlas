# 检查方法与覆盖边界

## 不是纯看，也不是纯脚本

四层检查相互补充：

| 层次 | 能查什么 | 不能代替什么 |
| --- | --- | --- |
| 数据与语义单测 | 形状、来源层、窗口行号、分数→ID→取行、模式分支、拼接映射 | 论文事实核对、最终浏览器排版 |
| 浏览器 DOM 与几何检查 | 实际尺寸、包含关系、颜色、端口、边路径、标签碰撞、状态切换 | 是否好读、留白是否必要、讲解是否连贯 |
| 截图人工复核 | 目标是否截对、文字密度、阅读顺序、分组、真实视觉留白与歧义 | 未显示区域、动态状态、精确性能 |
| 真实交互与性能测量 | 平移、缩放、拖框、拖线、撤销保存、输入后的反馈 | 全设备性能保证、显示器实际呈现时间 |

自动检查最擅长抓重复性错误；人工检查负责理解图。语义核对先于几何美化：一张不溢出的图仍可能把 G 来源连错。反例库是人工审查的提示清单，不是自动判图模型。

## 现有测试怎么选

下表是仓库已有入口，不代表它们本次全部执行或全部通过。测试名不是覆盖证明；运行前阅读当前断言，旧标题也不能覆盖新确认的规则。新增规则应落在相关断言，而不是只改测试名字。

路径相对仓库根目录，`tests/` 为数据/组件单测，`e2e/` 为真实浏览器检查。

| 问题类别 | 已有检查入口 | 仍需人工核对 |
| --- | --- | --- |
| 01 说明与数据分离 | `e2e/candidate-score-caption.spec.ts`、`e2e/compressor-structure.spec.ts` | 描述属于哪个对象，是否又套外框 |
| 02 元素宽高、矩阵网格 | `e2e/content-width-audit.spec.ts`、`e2e/parameter-height.spec.ts`、`e2e/selected-matrix-size.spec.ts` | 父框空白、合理走线空间、未扫描的手写格子 |
| 03 横排与整体密度 | `e2e/mhc-compact.spec.ts`、`e2e/mhc-output-compact.spec.ts`、`e2e/indexer-compact.spec.ts` | 重排后阅读顺序、复杂模块全貌 |
| 04–05 真实层内路径、分支 | `e2e/layer-cache-inline.spec.ts`、`e2e/compressor-structure.spec.ts`、`tests/architectureBoundary.test.ts` | 是否以长文字代替结构、是否假串行 |
| 06 简单算术、归约 | `e2e/compact-normalization.spec.ts`、`tests/deepseekRmsNorm.test.ts` | 过度拆解与遗漏运算之间的界限 |
| 07 裁切、末列、公式 | `e2e/residual-containment.spec.ts`、`e2e/matrix-grid.spec.ts`、`tests/mathMarkup.test.tsx` | 分数与下标可读性、真实裁切 |
| 08 符号与拼接 | `tests/headGroupConcat.test.tsx`、`tests/diagramNotation.test.tsx`、`e2e/concat-and-route-regression.spec.ts` | 原块在结果中是否一眼可认 |
| 09 颜色 | `tests/diagramAppearance.test.ts`、`tests/mhcColors.test.tsx`、`e2e/semantic-palette.spec.ts`、`e2e/color-identity.spec.ts`、`e2e/compact-semantic-regression.spec.ts` | 色系相近难辨、同对象跨模块连续性 |
| 10 端口、线路、标签 | `e2e/full-route-audit.spec.ts`、`e2e/edge-label-audit.spec.ts`、`e2e/sum-source-attachment.spec.ts` | 绕路理由、箭翼、入口变量能否跟踪 |
| 11–12 缓存与复用 | `tests/cacheDecode.test.tsx`、`tests/cacheSemantics.test.tsx`、`tests/perLayerCache.test.tsx`、`e2e/layer-two-swa.spec.ts` | 本层时间轴与跨层来源是否分清 |
| 13 候选、分数、ID | `tests/reindexCandidates.test.tsx`、`e2e/indexer-origins.spec.ts` | 选行对象与原 G 行的视觉对应 |
| 14 Engram | `tests/engramPurpose.test.tsx`、`e2e/engram-gate.spec.ts`、`e2e/compressor-structure.spec.ts` | 收益比较口径，反量化是否只是黑箱标签 |
| 15 SVG与可还原边界 | `e2e/cache-svg.spec.ts` | 离线外观、文字、屏幕外内容与编辑器限制 |
| 17 手势、状态、性能 | `e2e/interaction-budget.spec.ts`、`e2e/wire-drag-topology.spec.ts`、`e2e/editing-regression.spec.ts`、`e2e/internal-selection.spec.ts` | 连续操作的视觉稳定性、目标是否被面板遮盖 |

`content-width-audit` 的现有启发式只筛“单公式、没有其他说明、明显宽于内容”的一部分框。它不会自动识别整个模块是否空旷，也不会把含文字的所有大框都列出。没有命中不代表全部紧凑。

`candidate-score-caption` 比较说明与框的上下边界、框内文本、公式之外的额外高度，并覆盖多个 Reindex 层。这比只检查“本层分数”四个字存在更接近用户要求，但仍需看截图。

`semantic-palette` 在真实逐层页面扫描压缩器、mHC、Attention、Engram 和 KV 拼接的数据公式所在元素，不把图例或透明容器计入色数；输出已定义/实际使用色系及逐模块清单，并核对压缩生成、暂存、消费与量化 scale 的连续颜色。`color-identity` 另追踪 Full、Reuse、Reindex 与 SWA-only 的缓存来源色，比较选区加深、追加不换色、混合 K/V 及 Value 消费。颜色数达标仍需打开模块截图，检查相邻色的辨识度。

用户要求“每一层检查”时，运行 `e2e/all-layer-colors.spec.ts`：实际切换 40 层 × Prefill/Decode，fitView 后断言所有细节已挂载，再读取真实元素填充；检查局部/全局来源、Indexer 分数单行与矩阵、专家结果及选区。省略号不是数据元素，不纳入填色断言。不存在于该模式的角色可跳过，但必须存在的模块不能静默跳过。输出逐状态的节点数、断言数与异常，不以抽查代表层冒充全层检查。

`scripts/scan-all-layer-colors.mjs` 输出全层公式与实际颜色清单；`scripts/audit-layer-colors.mjs` 逐模块定位、截图并列出同公式异色线索。清单与线索不是自动语义判定：作用域同名、合法变换和选区加深均需人工区分。最终汇报分别列出自动检查的层/模式，以及亲自打开的截图变体；80 个状态通过不能表述为人工逐张看过全部模块，也不能证明其他章节已检查。

`interaction-budget` 测输入事件到 DOM 更新及其后下一 rAF 的反馈代理，记录 P95、最大值和样本数。不能只报 DOM 耗时，也不能把下一 rAF 说成显示器实际呈现。帧间隔和反馈延迟分开报告。

## 每次修图的执行顺序

1. **固定范围。** 写明用户要求的入口、模型、层、模式、模块和不改项。查原始模型资料确认数据流，再定位公共组件和手写同类实现。
2. **锁定反例。** 从反例库选对应类别，指出截图哪一处错；不要以整图全部错误为前提。先写能暴露该问题的断言或测量。
3. **按依赖选测试。** 改公式选语义/组件测试；改布局选包含、端口、路由；改公共色板查生成与消费两端；改交互补撤销保存；改导出补离线回读。
4. **运行并保留结果。** 相关类型检查、单测、构建及浏览器回归按改动风险执行。文档整理只检查文档与资产，不假装重新验收了应用。保持已有本地服务，不为截图随意停服。
5. **定位后截图。** 等实际目标内容挂载、字体就绪，核对模块身份和边界在视口内，再截完整模块与局部。自动滚动/变换画布后重新取坐标；文件名正确不代表取景正确。
6. **实际打开。** 查看每张交付截图，先认目标，再看边界、公式、留白、颜色、源端和消费端。像素不可读时换局部截图，不能假装已审查微小文字。
7. **复查动态状态。** 使用真实输入拖框、拖线、缩放、改标签、撤销/重做和保存恢复。性能测试使用生产构建单独运行，避免并发重任务污染结果。
8. **分层汇报。** 说明通过项、未运行项和失败项。只有用户明确要求发布才部署；本地修改、提交与线上发布是三件不同的事。

## 两个已经暴露过的验收陷阱

### 截图错位，DOM 断言却通过

此前“本层分数”修复中，第一次输出图未覆盖预期过滤模块。定位与尺寸断言并未证明最终图片里的对象就是目标；人工打开后发现并重新截取。后续应把目标身份、viewport 包含与截图 clip 放在同一验收步骤，仍保留最后的人看图。

### 局部通过，整组路由仍失败

整理本册之前的工作记录中，`edge-label-audit` 的终端标签距离及编辑后布局检查仍有失败，基线也出现失败。基线复现只能说明不能直接归因于本次修改，不能把失败改报通过，更不能放宽断言掩盖问题。

本册是历史检查经验，不是当前测试状态看板。本次整理没有重跑该组；今后修路由时应重新运行并记录实际结果。只改 skill 的任务也不授权顺手修改整个路由器。

## 证据记录最少包含什么

| 字段 | 内容 |
| --- | --- |
| 范围 | 问题编号、修改组件、同类调用范围 |
| 版本与入口 | 提交或工作树状态、实际 URL、是否本地、是否发布 |
| 图状态 | 模型、层号、Prefill/Decode、当前 t/示例参数、模块 ID |
| 显示条件 | viewport、缩放、面板开关、自动或人工保存布局 |
| 自动结果 | 运行命令、实际退出状态、关键断言/测量、未覆盖项 |
| 截图 | 全模块和局部文件、人工是否打开、仍有的问题 |
| 动态结果 | 做过的真实操作、几何恢复、性能口径与数值 |

不应只写“检查通过”“已截图”“已优化”。检查通过的对象应具体到一种规则、一个入口和一组模式。

## 维护这份反例库

在仓库根目录运行：

```powershell
node .agents/skills/model-architecture-viz/scripts/validate_casebook.mjs
```

脚本检查：18个类别编号、子案例编号唯一性、案例索引、Markdown本地文件引用、图片登记/使用关系、PNG签名/尺寸/字节哈希。在原仓库中还检查提到的测试文件路径；独立分享包明确跳过这项，不要求附带整套应用。图片来源写在 `references/counterexample-assets.json`；当前采用原始附件和已有局部修复截图的逐字节副本。

**这个脚本不是架构图审查器。** 它不能判定留白是否合理、公式是否正确，也不能确认测试中的断言足够。更新后要打开反例册，检查图注是否准确、原图是否清楚，不能把资产校验绿当作视觉验收绿。
