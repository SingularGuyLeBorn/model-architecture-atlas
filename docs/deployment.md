# 构建与发布

## 当前云端站点

- 地址：https://model-architecture-atlas.justfox32.chatgpt.site
- 托管：Sites；静态产物目录为 `dist/`。
- 访问：仅站点所有者登录后可访问。GitHub 仓库公开与否不会自动改变网站权限。
- 站点身份与发布目录记录在 `.openai/hosting.json`；该文件不包含登录凭据。

GitHub 保存源码，Sites 托管网站，两者相互独立。推送 GitHub 不会自动更新 Sites；修改页面后，需要单独发布新的 Sites 版本。只修改 README 等不参与构建的文档，不改变已上线页面。

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
