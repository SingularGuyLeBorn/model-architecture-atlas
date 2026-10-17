# 分享与使用

将整个 `model-architecture-viz` 文件夹交给另一个 AI，先让它读 `SKILL.md`，再读入口指定的两份契约。`references/counterexamples.md` 是含原图的反例册；图片与文档保持相对目录即可离线阅读。

支持本地 skill 的工具可把这个文件夹放进自己的 skills 目录。普通对话工具也可直接上传整包，要求按这些规则检查和绘图。图片是历史案例，不是当前页面的验收截图。

检查包是否完整：在文件夹内运行 `node scripts/validate_casebook.mjs`。它检查案例编号、文档引用、图片签名与哈希，不会检查你的新图是否正确。原仓库中的测试脚本路径只是实现参考；独立包中不会附带整套应用。

这份 skill 是绘图与验收规范，不是图的可逆数据格式。还原原图需要图的源码、模型配置、布局与依赖；只提供 skill 或截图，不能保证逐像素重建。可编辑的完整实现位于 [model-architecture-atlas](https://github.com/SingularGuyLeBorn/model-architecture-atlas)。

逐模块截图应另存清晰 PNG，登记模型、层号、模式、Prefill/Decode、模块 ID、页面 URL 与源码提交；较大模块同时提供全图和连续阅读切片。截图只表示该次渲染，不能替代交互与数学正确性检查。发布小红书前按实际内容选择图片，不自动发布账号内容。
