# 构建与发布

## 当前云端站点

- 主站：https://b75a1cd1.pinme.dev
- 上次 PinMe 版本：https://32c925b5.pinme.dev（旧链接保留旧版本）
- 旧版备用：https://model-architecture-atlas.justfox32.chatgpt.site（本次未更新）
- 托管：PinMe 主站、Sites 备用；静态产物目录为 `dist/`。
- 访问：两个网站均开放匿名访问；GitHub 仓库为公开仓库。
- 源码：https://github.com/SingularGuyLeBorn/model-architecture-atlas
- 站点身份与发布目录记录在 `.openai/hosting.json`；该文件不包含登录凭据。

GitHub 保存源码，PinMe 和 Sites 托管网站。推送 GitHub 不会自动更新这两个网站；修改页面后，需要单独发布。只修改 README 等不参与构建的文档，不改变已上线页面。

## PinMe 发布

默认只改本地。只有用户明确要求部署或更新线上时，才执行发布；GitHub 提交与页面修改均不触发手动部署。

本次使用 PinMe 2.0.12，上传已通过测试的 `dist/`，不上传源码、凭据或运行数据：

```sh
pinme login
pnpm check
pinme upload dist
```

发布者需要登录 PinMe，访问网站的读者不需要登录。凭据过期时重新执行 `pinme login`，不要把 AppKey 写入仓库。以每次上传输出的 URL 为准，不假定后续上传会更新原地址；域名绑定可能涉及余额，需单独确认。

2026-10-19 按用户指令阶段发布：源码 `cb062c1`（应用修改 `c3cad8e`），包含此前本地的多模型展开、连线修复、投影身份色与新增检查。发布前 582 项单测、最新 10 项投影和边缘交互浏览器检查、类型、格式及构建通过；全量浏览器检查按用户要求停止，不能称为全套通过。剩余历史约束补齐工作见 `docs/verification.md`，后续继续，不在本次发布收尾中扩展。

2026-10-18 的上次发布对应应用源码 `962f49d`：包含压缩乘积向量边框、选行模块溢出修复，以及 mHC 运算符与相邻框的间距调整。当时核对过脚本版本、搜索、窗口、KV 拼接和 Engram；该检查不等于全套浏览器测试或跨运营商可用性验证。

当前发布核对入口：`node scripts/verify-published.mjs https://b75a1cd1.pinme.dev`。

本次核对通过：线上入口与本地 `index-C1QMZ-4M.js` 一致；变量搜索、Prefill 窗口、KV 拼接、Decode 窗口及第 2、15 层两种模式的 Engram 均通过实际浏览器检查。仅更新 PinMe，Sites 备用站未同步；推送后的 GitHub CI 仍需等其独立运行结果。

大陆不同运营商的可用性尚未完成验证；本机请求成功不代表所有大陆网络均可直连。官方用法见 [PinMe 项目](https://github.com/glitternetwork/pinme)。

## 静态部署

运行 `pnpm build` 后，`dist/` 即为发布目录。Vite 使用相对 base，章节使用 hash 路由，可部署在 GitHub Pages 子路径，无需服务端重写。

GitHub 仓库先通过 CI，再按需启用 Pages。Pages 工作流为手动触发，避免创建私有仓库时自动公开网站。首次使用需要在仓库 Settings → Pages 选择 GitHub Actions，并确认账号计划支持该仓库可见性。

## GitHub 推送

首次推送前，在自己的终端完成 GitHub 登录：

```sh
gh auth login --hostname github.com --web
gh auth status
```

认证通过后，确认目标账号、仓库名称和可见性，再创建仓库、添加 `origin` 并推送 `main`。已有同名仓库时先检查内容，不覆盖远端历史。不要将 token 写进源码、远端 URL 或聊天记录。

每次推送前检查 `git status` 和差异，按文件暂存。提交保留功能主题与修改原因，不强推、不改写已发布历史。推送成功后检查远端提交与 GitHub Actions 结果。

## 本机与 CI

- Node.js 22+，pnpm 11.9.0；CI 使用 Node.js 24。
- 安装锁定依赖：pnpm install --frozen-lockfile。
- 检查：pnpm check。
- 浏览器检查：pnpm exec playwright install --with-deps chromium，然后 pnpm test:e2e。
- 构建物、截图、测试报告与本地布局不进入 Git。
