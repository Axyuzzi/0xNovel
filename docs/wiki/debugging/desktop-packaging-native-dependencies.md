# Windows 桌面打包与原生依赖

## 背景

桌面端使用 Electron 运行服务器，并通过 `better-sqlite3` 访问本地 SQLite。`better-sqlite3` 的 `.node` 文件与 Node/Electron ABI 绑定；工作区为普通 Node.js 安装的二进制不能直接作为 Electron 运行时二进制使用。

## 当前规则

1. `desktop/scripts/stage-desktop.cjs` 使用 `pnpm deploy` 构造独立桌面运行目录。
2. 暂存脚本把 `better-sqlite3` 从 pnpm 链接转换为物理副本。
3. 暂存脚本读取项目锁定的 Electron 版本，并通过依赖自带的 `prebuild-install` 安装对应 Electron ABI 的官方预编译二进制。
4. 暂存脚本必须确认 `build/Release/better_sqlite3.node` 存在才能结束。
5. `electron-builder` 设置 `npmRebuild: false`，避免在已经完成 ABI 准备后再次调用 `node-gyp`，从而不要求每台打包机安装 Visual Studio C++ Build Tools。

不能单独把 `npmRebuild` 关闭而省略暂存步骤；两者是一套完整约束。常规完整打包应使用根目录的 `pnpm dist:desktop`，复用已验证暂存目录时才使用带 `reuse-stage` 的脚本。

## 下载线路

Electron 与 Electron Builder 工具默认从 GitHub 下载。网络受限时可以只为当前终端配置镜像，不应把第三方镜像硬编码为所有环境的默认来源：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
pnpm dist:desktop
```

## 验证

完成打包后运行 `node desktop/scripts/verify-desktop-package.cjs`。校验应覆盖：桌面入口、服务器包、Prisma 运行时与迁移、客户端资源、更新配置、窗口图标，以及 `app.asar` 中的关键文件。

结构校验不能替代真实启动烟测。`desktop/src/runtime/paths.ts` 中的打包服务器入口必须与暂存目录中的 workspace 作用域完全一致；否则 `app.asar` 可以通过文件清单校验，但 `utilityProcess.fork` 会在启动时因入口路径不存在而立即退出。桌面包完成后应使用隔离的 `AI_NOVEL_APP_DATA_DIR` 启动 `win-unpacked`，并同时等待日志出现：

- `Desktop server is healthy`
- `main-window-shown`

启动页、工作区导航和 EXE 图标共用 `images/brand/0xnovelagent-app-icon.png` 派生资源。不要在 React 启动壳或 Electron 启动 HTML 中重新维护另一套内联品牌图形。
