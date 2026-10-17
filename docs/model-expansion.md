# MiMo、DeepSeek V3 系列与 Qwen 架构扩展

## 范围

本轮制作 MiMo-V2.5、原始 DeepSeek-R1、DeepSeek-V3、DeepSeek-V3.1、DeepSeek-V3.2、Qwen3.8-Flash-Next。每个型号独立核对官方配置与实现；共用图元、算子和测量布局。保留 V4/V4.1 的现有入口。本轮只更新本地，按主题提交。

目标是在逐层入口切换层号、Prefill/Decode，沿真实连接追踪输入、参数、运算、状态更新与输出。机制章节复用同一内部结构。配置注册或只有阶段标题的概览不算完整交付。

## 已固定的资料

完整配置保存在 `src/data/configs/`，提交 SHA、读取日期与实现链接在 `src/data/sources.json`。本轮新增三份配置逐字段与固定版本官方文件核对；不下载模型权重。

| 模型 | 配置版本 | 本轮重点 |
| --- | --- | --- |
| MiMo-V2.5 | `63651580ca774f8504f676040460aed3e1244ac1` | 48 层 Hybrid SWA/GQA、首层 Dense、其余 MoE、视觉/音频入口 |
| DeepSeek-V3.2 | `a7e62ac04ecb2c0a54d736dc46601c5606cf10a6` | MLA 主干、逐 token 的 DSA Indexer 与稀疏读取 |
| Qwen3.8-Flash-Next | `de4b8e4d43b917e7706784d8bb445c9af86a3540` | GDN/QSA、门控残差、N-gram/PLE、MoE、视觉入口 |
| V3 / R1 / V3.1 | 沿用来源表中各自独立 SHA | 完整层内 MLA/FFN/残差与训练差异 |

实现核对：MiMo 使用同一模型仓库的 `modeling_mimo_v2.py`；V3.2 使用 DeepSeek 官方 V3.2-Exp 仓库 `87e509a2e5a100d221c97df52c6e8be7835f0057` 的参考推理实现，正式 V3.2 的配置与报告独立列出；Qwen 使用 Transformers `d4804f9d76b8c071b993d813e9e87067b780cbee` 的 `qwen4_exp` 实现及 Qwen 官方模型卡。模型名保持 Qwen3.8-Flash-Next，代码中的 `qwen4_exp` 是实现类型名。

## 必须保留的差异

- MiMo-V2.5：全注意力位于 1、6、12、18、24、30、36、42、48 层；其余是 128-token 窗口。全注意力 4 个 KV Head，SWA 为 8 个，Query 均为 64 个；Q/K 每头 192 维、V 每头 128 维。前 64 维旋转。仅 SWA 有 sink；V 在写缓存前乘 0.707。按当前配置展示 fused QKV。第 1 层 Dense，后续 256 选 8；无共享专家。与 Pro 的 70 层分开。
- V3/R1/V3.1：61 层，前 3 层 Dense，后续 256 选 8 加 1 个共享专家。MLA 缓存每 token 的 512 维潜向量和 64 维位置 Key，128 个展开 Head 不等于缓存 128 份潜向量。R1 指原始完整模型，训练路线与推理结构分开。
- V3.2：Indexer 为 64 个 128 维 Query Head，Key 来自本层隐藏状态，Query 来自 1536 维低秩 Query。按因果 token 行选至多 2048 行，选择结果用于同层 MLA。没有 V4.1 的压缩组、跨层 G 复用或 128-token 本地拼接。
- Qwen：48 层，每四层的前三层 GDN、第四层 QSA。GDN 有 16 个 Q/K Head、48 个 V/递归状态 Head，每头 128 维，维护递归状态和短卷积状态；QSA 有 24 个 Query Head、2 个 KV Head，每头 256 维。两种状态不可合并为同一种 KV 窗口。
- Qwen QSA：Indexer 为 4 个 Query Head 和 1 个 Key Head，128 维。每 4 个可见 token 的 Key 取均值，归一化后按块起点旋转，选择至多 512 个完整块，再还原原 token 行号。未满块的 0–3 个尾部 token 额外保留；主注意力读取原 K/V，并非平均后的索引 Key。
- Qwen 门控残差：4 路，逐路归一化，低秩 320 维读门为逐元素 sigmoid；4 路加权平均供子层使用，写门为每路一个标量。保留输入旁路；没有 mHC 的 Sinkhorn 混合矩阵。
- Qwen N-gram：第 2 层，bigram/trigram 各 8 个哈希 Head，共 16 个 160 维查表向量，拼成 2560 维；PLE 向各残差路注入，并含核大小 4、dilation 3 的深度卷积。与 V4.1 的 24 行 FP8 双表反量化分开。
- Qwen MoE：512 选 10，加 1 个独立 sigmoid 门控的共享专家。Router 使用 softmax；与 DeepSeek/MiMo 的 sigmoid 选择分开。

## 实施进度

- [x] 核实六个目标型号；固定新增模型配置和实现来源。
- [x] 实现逐层配置、GQA Head 对应、窗口边界和 QSA 块→token 映射；加入边界测试。
- [x] DeepSeek V3、R1、V3.1、V3.2 接入本地逐层入口；参数、投影、潜缓存、权重吸收、Dense/MoE 与两次残差形成显式依赖图。
- [x] 共用张量支持独立元素命名、真实内部数据端口、同源色和选区净空；增加跨型号/层边界的端口声明检查。
- [x] MiMo-V2.5 接入概览与逐层入口：48 层切换、fused QKV、分组读缓存、SWA/sink、V 缩放、Dense/MoE 和残差。
- [ ] 六个型号接入逐层与机制入口，保证内部来源和消费端可追踪。
- [ ] 扩展共享 MLA、DSA、GQA/SWA、GDN/QSA、门控残差、N-gram、MoE 与多模态图。
- [ ] 按 skill 逐项核对符号、同源色、选区、运算符净空、溢出、端口、路由和实际交互。
- [ ] 保存并打开完整模块及局部截图，记录验证范围；本地提交。

进度只表示本轮工作，不覆盖先前 CI 的性能失败。新图的验收须独立记录，不能把配置测试通过写成架构图已完成。

## 本地阶段检查

2026-10-18：DeepSeek 四个代表模式（V3 第 1 层 Prefill、R1 第 4 层 Decode、V3.1 第 61 层 Prefill、V3.2 第 4 层 Decode）通过内容边界与真实端口数量检查；脚本为 `e2e/model-expansion.spec.ts`。检查曾发现共享专家两条投影并排溢出，现已修复。截图存放在对应 `test-results/model-expansion-*` 下；每步区分正常视口截图与完整模块截图。

后续仍须完成 Qwen 入口与两家的多模态模块，以及 DSA 的逐行选择展开、DeepSeek RoPE 成对运算、内部对象解释、长连线全路径审查、窄屏和交互性能检查。当前图能浏览和切层，这些检查尚未全部完成；本轮目标保持进行中。

同日补充：MiMo 的第 1 层 Prefill、第 2 层 Decode、第 48 层 Decode 通过内容边界和内部连线端点检查。已打开滑窗缓存、RoPE、GQA/sink 模块截图，调整缓存逐行通道与注意力横向布局。公式测试逐条使用 KaTeX 严格解析，修正符号维度粘连；长行号按内容宽度布局。MiMo 的多模态入口、Qwen 的图形入口和跨模型完整交互验收继续进行。
