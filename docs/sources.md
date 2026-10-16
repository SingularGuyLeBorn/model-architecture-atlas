# 官方来源与版本边界

配置快照及提交 SHA 保存在 src/data/configs 和 src/data/sources.json。检查日期：2026-10-16。

| 模型 / 机制 | 官方依据 |
| --- | --- |
| V3 · MLA、MoE、MTP | [V3 推理实现](https://github.com/deepseek-ai/DeepSeek-V3/blob/main/inference/model.py)、[技术报告](https://arxiv.org/html/2412.19437v2) |
| R1 · 后训练 | [R1 官方仓库](https://github.com/deepseek-ai/DeepSeek-R1) |
| V3.1 · 混合思考 | [官方模型卡与聊天模板](https://huggingface.co/deepseek-ai/DeepSeek-V3.1) |
| V4 Flash · CSA/HCA、Hash MoE、mHC | [固定版本推理代码](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash/blob/60d8d70770c6776ff598c94bb586a859a38244f1/inference/model.py) |
| V4 Pro | [固定版本配置](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/b5968e9190ef611bbf34a7229255be88a0e937c1/config.json) |
| V4.1 Flash | [官方模型卡](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash)、[固定版本配置](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/5254448103b6254fc646dacbca1cbbf20e9216c1/config.json)、[技术报告](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/main/DeepSeek_V41_Tech_Report.pdf) |

## 不能混用的机制

- R1 页面对应原始 R1，不是 R1-Distill，也不是 R1-0528。训练产生推理能力，推理主干仍是 V3 系列结构。
- V3.1 的思考与非思考模式共用权重，由聊天模板选择。不会因为切换模式就多出一种 Attention。
- V3 MLA 吸收路径缓存每 token 的 512 维潜向量与 64 维 RoPE Key；V4 系列的共享 KV 稀疏注意力不能套这个缓存公式。
- V3 的选择偏置影响专家排名，不直接加进混合权重。辅助损失自由均衡不等于没有任何辅助损失；V3 保留 α=0.0001 的序列级均衡项。
- V4 前 3 层是 Hash 专家选择；不能用普通 Top-K 得分图冒充。Flash 与 Pro 的维度、层数、索引 Top-K 不同。
- V4 的 ratio=4 使用重叠压缩窗口；ratio=128 为 HCA，不走 Top-K Indexer。
- V4.1 的比例 1 全局分支仅投影和归一化，没有多行 gate 池化。Full / Reindex / Reuse 的共享来源必须按层追踪。
- V4 mHC 在当前子层生成并消费 pre；V4.1 Single-Pass mHC 的 pre 跨子层传递。当前 post/comb 仍用于当前回写。
- V4.1 的 20 层编码器与 20 层解码器、Engram、视觉分支和 DSpark 是不同路径；它们不能被合成一条伪串行链。

图中小数和短向量均标为演示，不是采样真实权重或激活。Tokenizer 的示意 ID 也不代表真实分词结果。
