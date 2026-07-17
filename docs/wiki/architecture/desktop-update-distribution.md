# 桌面更新分发

## 仓库与更新入口

- 项目主仓库：`https://gitee.com/b497021499/0xnovel`
- 手动更新入口：`https://gitee.com/b497021499/0xnovel/releases`
- 原 GitHub 仓库只用于只读参考，不再作为发布或更新来源。

## 为什么私密 Gitee 仓库不能直接作为自动更新源

桌面端自动更新需要在未登录浏览器的情况下读取版本清单并下载安装包。私密仓库要求身份凭据；如果把私人令牌写入 EXE，任何安装者都可以提取该令牌，因此禁止这样配置。

## 启用自有自动更新源

打包前设置 `OXNOVEL_DESKTOP_UPDATE_URL`，指向一个可匿名读取的 HTTPS 目录：

```powershell
$env:OXNOVEL_DESKTOP_UPDATE_URL = "https://updates.example.com/0xnovelagent/"
pnpm dist:desktop:nsis
```

该目录需要提供当前通道的 Electron 更新清单（正式通道为 `latest.yml`，测试通道为 `beta.yml`）以及清单引用的安装包和校验信息。

没有设置更新地址时，打包流程不会写入 `app-update.yml`，桌面自动更新保持关闭；用户仍可通过 Gitee Releases 手动更新。兼容变量 `AI_NOVEL_DESKTOP_UPDATE_URL` 暂时可用，但新配置应使用 `OXNOVEL_DESKTOP_UPDATE_URL`。
