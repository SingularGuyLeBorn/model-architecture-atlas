# 构建与发布

## 静态部署

运行 pnpm build 后，dist 即为发布目录。Vite 使用相对 base，章节使用 hash 路由，可部署在 GitHub Pages 子路径，无需服务端重写。

GitHub 仓库先通过 CI，再按需启用 Pages。Pages 工作流为手动触发，避免创建私有仓库时自动公开网站。首次使用需要在仓库 Settings → Pages 选择 GitHub Actions，并确认账号计划支持该仓库可见性。

## GitHub 推送

当前项目的远端创建与推送需要本机 GitHub 身份认证。登录步骤通过 gh auth login 由用户本人完成，不把 token 放进仓库或聊天记录。

认证完成后创建仓库、设置 origin、推送 main。仓库未创建前，README 不提供虚构的在线地址。

## 本机与 CI

- Node.js 22+，pnpm 11.9.0；CI 使用 Node.js 24。
- 安装锁定依赖：pnpm install --frozen-lockfile。
- 检查：pnpm check。
- 浏览器检查：pnpm exec playwright install --with-deps chromium，然后 pnpm test:e2e。
- 构建物、截图、测试报告与本地布局不进入 Git。
