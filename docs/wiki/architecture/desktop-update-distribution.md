# 桌面更新分发

## 唯一更新来源

Windows 安装版通过 0xAPI 的应用发布中心检查和下载新版：

- 最新版：`GET /api/internal/apps/0xnovelagent/releases/latest?platform=windows`
- 下载：`GET /api/internal/apps/0xnovelagent/releases/{id}/download`
- 根地址：正式环境默认 `https://your-relay.example.com`
- 鉴权：`Authorization: Bearer {InternalPackageCode}`

旧的 `electron-updater + latest.yml` 通用目录已经停用。私密 Gitee 仓库和原 GitHub
仓库都不是客户端更新源。

## 客户端行为

1. Windows 安装版启动后延迟检查最新版。
2. 本地 `desktop/package.json.buildNumber` 小于远端 `buildNumber` 时提示更新。
3. 下载只在 Electron 主进程执行，renderer 不接触安装包鉴权码。
4. 下载地址必须与配置的 0xAPI Origin 一致，且路径必须匹配安装包下载接口。
5. 安装包流式写入本机 `updates/` 临时目录，完成后核对文件大小和 SHA256。
6. 用户确认安装时，renderer 先保存当前草稿；主进程再排空在途创作操作、启动安装程序并退出旧版本。

普通更新可以稍后处理。`forcedUpdate=true` 或当前版本低于
`minSupportedVersion` 时，提示不可关闭，并在客户端请求层阻止新的联网操作；本地阅读、
编辑、保存、导出和备份不受影响。

便携版不自动安装更新。0xAPI 当前只按 `windows` 区分平台，不能同时表达安装版和便携版，
因此正式更新中心只上传 NSIS `setup-x64.exe`。

## 发布配置

正式打包需要：

```powershell
$env:OXNOVEL_INTERNAL_PACKAGE_CODE = "32位安装包鉴权码"
$env:OXNOVEL_RELAY_ACCOUNT_BASE_URL = "https://your-relay.example.com"
$env:CSC_LINK = "Windows签名证书"
$env:CSC_KEY_PASSWORD = "证书密码"
```

可用 `OXNOVEL_PACKAGE_RELEASE_BASE_URL` 单独覆盖安装包 API 根地址。正式包缺少 32 位
鉴权码时发布门禁会停止；Beta 可以不配置，此时更新功能显示为不可用。

固定鉴权码会进入 Electron 主进程使用的发布策略，不能被视为真正秘密。代码不进入
renderer、不写日志、不提交仓库，但安装者仍可能从本机文件中提取。0xAPI 应对查询与下载
增加 IP 限流；后续优先改成短期签名下载地址或用户 Token 换取一次性地址。

## 后台上传步骤

1. `pnpm release:desktop:bump X.Y.Z` 同时更新展示版本并把构建号加一。
2. 更新 README 和版本说明。
3. 生成经过签名的 Windows NSIS 安装包。
4. 运行 `pnpm generate:package-release-manifest`，核对版本、构建号、大小和 SHA256。
5. 在 `系统设置 → 运维 → 应用发布` 上传安装包，第一次保持“上传后启用”关闭。
6. 通过内部查询和下载接口验证一次文件大小与 SHA256。
7. 验证通过后启用版本。普通版本默认关闭“强制更新”。
8. 出现严重问题时停用该版本，保留记录，不直接删除；上一条已启用的较低构建重新成为最新版。

上传字段以 `desktop/build/dist/0xNovelAgent-release-manifest.json` 为准。不要上传便携版，
也不要把尚未包含当前代码的旧安装包与新构建号组合发布。
