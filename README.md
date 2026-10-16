# 模型架构全解析 · Model Architecture Atlas

用可交互结构图理解模型：矩阵如何投影、token 如何取行、Head 如何拆分、专家如何路由、缓存如何读写。

这是一个独立静态网站，不运行模型、不下载权重，不需要 API Key。技术栈：React 19、TypeScript、Vite、React Flow、KaTeX。

## 在线访问

[打开在线站点](https://0966b7ac.pinme.dev) · [直达 V4.1 逐层图](https://0966b7ac.pinme.dev/#model=v41&chapter=layer) · [GitHub 源码](https://github.com/SingularGuyLeBorn/model-architecture-atlas)

网站免登录，GitHub 仓库公开。主入口由 PinMe 托管，[Sites 备用入口](https://model-architecture-atlas.justfox32.chatgpt.site)也已开放匿名访问。大陆不同运营商的可用性尚未完成验证，不能据部署成功保证所有网络都可访问。也可以下载源码，在本机运行。

推荐先选模型与机制章节，再进入 V4.1 逐层图查看具体层、Prefill 与 Decode。选中框或连线后，可在右侧解释中对照变量来源和去向。

## 内容

| 模型 | 已提供的结构 |
| --- | --- |
| DeepSeek V4.1 Flash | 40 层完整交互图，Prefill / Decode；另有 CED、CSA2、mHC、Engram、MoE、RMSNorm、RoPE、视觉与 DSpark 章节 |
| DeepSeek R1 | V3 系列 MLA / MoE 主干；冷启动 SFT、推理 RL、拒绝采样与全场景 RL |
| DeepSeek V3 | MLA 原始展开与吸收路径、压缩缓存、分组路由、专家内部、辅助损失自由负载均衡、MTP |
| DeepSeek V3.1 | 复用相同主干结构；单独说明思考 / 非思考聊天模板与后训练差异 |
| DeepSeek V4 | Flash 与 Pro 分开配置；CSA4 / HCA128、mHC、Hash MoE、本地窗口与压缩缓存 |

V4.1 的逐层图是完整展开的迁移示范。其他模型用机制章节展开共同主干与特有设计。概览、训练路线、视觉与 DSpark 是结构导航，不能当作逐算子实现规范；逐算子细节以页面的官方代码链接为准。

## 本地运行

需要 Node.js 22+ 和 pnpm 11.9.0。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 http://127.0.0.1:4173。开发服务与原 OasisMind 的 3000 / 3010 端口互不影响。

```sh
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

本机 E2E 默认使用 Chrome；CI 使用 Playwright Chromium。生产预览使用 `pnpm preview`。浏览器测试会启动自己的预览服务，运行前先构建。

`pnpm check` 一次执行类型检查、单元测试和生产构建。`pnpm format:check` 检查格式；GitHub CI 还会运行浏览器测试。

## 阅读与交互

- 左侧选模型和机制，图旁步骤列表直接定位模块。
- 左右栏独立收起；在展开按钮上停留可预览并完整操作，预览跳转后收回，固定展开后才保持显示。
- 拖空白区域平移；机制图滚轮缩放；完整逐层图滚轮上下平移，使用缩放按钮或触控板捏合缩放。
- Prefill 是 N 行并行计算；Decode 是当前位置 t 的一行，历史来自缓存。
- 图内节点可拖动、边缘可调整尺寸；连线可调整路径。保存布局只写本浏览器，不修改模型事实。
- 完整 V4.1 图支持内部真实端口、连线标签编辑、边缘吸附、删除选中连线、撤销与重做。
- 完整 V4.1 图点击模块可查看右侧解释：真实输入输出、变量字典和计算过程。面板独立占位；关闭后不再随点击自动打开，点击“显示解释”恢复。窄屏改为上下对照。
- “来源与公式”抽屉保留官方配置、推理代码与必要数学关系。
- 链接中的 `#model=v3&chapter=mla` 可直接定位章节。小屏保留可读缩放，通过平移阅读大图。

布局不会自动跨设备同步。本地地址和云端地址使用不同的浏览器存储，切换地址不会自动带入之前保存的布局；清除网站数据也会清除本地保存。

## 目录

```text
src/data/                    模型目录、固定版本配置、来源
src/components/              共享图元与可编辑正交边
src/templates/               矩阵/投影/并行/求和模板、章节语义图、测量布局
src/compositions/            V4.1 Flash 完整逐层图
tests/                       语义、几何、路由与渲染回归
e2e/                         实际浏览器检查与平移测量
.agents/skills/               模型架构图规范及用户确认案例
docs/                        内容边界、扩展与部署说明
```

## 扩展模型

先读 [扩展说明](docs/architecture.md) 与仓库内 [模型架构图 skill](.agents/skills/model-architecture-viz/SKILL.md)。

模型配置、语义依赖、实测布局和渲染分层维护。新增模型复用模板，不复制整份 V4.1 组件再替换标题。章节顺序不构成数据依赖；只有显式变量连接才生成边。

## 来源与许可证

模型参数固定在 [sources.json](src/data/sources.json) 记录的官方提交版本。算法来源及版本差异见 [来源表](docs/sources.md)。

代码使用 MIT 许可证。V4.1 可编辑图源自 OasisMind，保留原版权；详见 [第三方说明](THIRD_PARTY_NOTICES.md)。本仓库不包含模型权重、用户文章、账号凭据或运行数据库。

现有主站由 PinMe 托管，Sites 保留备用入口。也可以将 `dist/` 部署到 GitHub Pages 或其他静态托管服务，见 [部署说明](docs/deployment.md)。

本机测试范围与性能数据见 [验收记录](docs/verification.md)。
