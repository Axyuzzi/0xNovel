# 桌面版本号与发布标识规则

## Background

桌面客户端有三处会暴露版本信息：界面顶部的当前版本、Electron 打包产物的应用版本、GitHub Release 的发布 tag。如果这些信息分别维护，用户截图、安装包文件名和自动更新判断会很容易出现不一致。

## Current Rule

- `desktop/package.json` 的 `version` 和 `buildNumber` 是桌面客户端唯一发布版本源；前者给用户查看，后者用于更新判断。
- 前端网页开发态从 Vite 注入的 `VITE_APP_VERSION` 读取该版本，桌面运行态优先读取 Electron runtime 提供的 `appVersion`。
- 正式发布 tag 必须是 `vX.Y.Z`，并且 `X.Y.Z` 必须等于 `desktop/package.json` 的 `version`。
- 不在 UI、README 或发布脚本中硬编码另一个客户端版本号。
- GitHub 桌面发布 workflow 必须使用 Node 24 运行时和 Node 24 代际的官方 action，不再依赖 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` 去强制旧 Node 20 action。

## Release Steps

1. 发新版桌面包前，先运行 `pnpm release:desktop:bump X.Y.Z` 更新展示版本并自动把构建号加一。
2. 更新用户可见 release notes 和 README 最新更新，说明该版本面向用户的变化。
3. 构建 NSIS 安装包后运行 `pnpm generate:package-release-manifest`，核对版本、构建号、文件大小和 SHA256。
4. 在 0xAPI 应用发布中心先以未启用状态上传，验证下载文件后再启用。

## Failure Modes

- 如果界面顶部显示版本和安装包文件名不一致，先检查打包所用 commit 的 `desktop/package.json`，不要在前端组件里补一个临时版本。
- 已经启用过的版本不能用同一版本号或构建号重新覆盖；应继续 bump 到新的 `X.Y.Z`。
- 如果发版前只更新 release notes 但没有 bump 桌面版本，自动更新链路会把新包识别成旧版本，必须先修正版本源再发布。
- 如果 GitHub Actions 提示某个 action 仍在使用 Node 20，应优先升级该 action 的 major 版本，而不是重新加入强制运行时环境变量。

## Related Modules

- `client/vite.config.ts`：把桌面版本注入网页开发态和普通前端构建。
- `client/src/lib/constants.ts`：统一导出前端可用的 `APP_VERSION`。
- `desktop/src/main.ts`：桌面运行态把 Electron `app.getVersion()` 注入 renderer。
- `scripts/bump-desktop-version.cjs`：同步推进展示版本和构建号。
- `desktop/scripts/generate-package-release-manifest.cjs`：生成 0xAPI 后台上传校验清单。
