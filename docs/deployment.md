# 构建与发布

## 当前云端站点

- 主站：https://0966b7ac.pinme.dev
- 备用：https://model-architecture-atlas.justfox32.chatgpt.site
- 托管：PinMe 主站、Sites 备用；静态产物目录为 `dist/`。
- 访问：两个网站均开放匿名访问；GitHub 仓库为公开仓库。
- 源码：https://github.com/SingularGuyLeBorn/model-architecture-atlas
- 站点身份与发布目录记录在 `.openai/hosting.json`；该文件不包含登录凭据。

GitHub 保存源码，PinMe 和 Sites 托管网站。推送 GitHub 不会自动更新这两个网站；修改页面后，需要单独发布。只修改 README 等不参与构建的文档，不改变已上线页面。

## PinMe 发布

本次使用 PinMe 2.0.12，上传已通过测试的 `dist/`，不上传源码、凭据或运行数据：

```sh
pinme login
pnpm check
pinme upload dist
```

发布者需要登录 PinMe，访问网站的读者不需要登录。凭据过期时重新执行 `pinme login`，不要把 AppKey 写入仓库。以每次上传输出的 URL 为准，不假定后续上传会更新原地址；域名绑定可能涉及余额，需单独确认。

当前产物对应应用源码提交 `89810a9`，后续提交仅更新发布文档。大陆不同运营商的可用性尚未完成验证；本机请求成功不代表所有大陆网络均可直连。官方用法见 [PinMe 项目](https://github.com/glitternetwork/pinme)。

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
