# 功能进度看板

> 最后更新：2026-07-28

| 功能 | 状态 | 涉及文件 | 文档 |
|------|------|----------|------|
| 项目品牌统一为 `0xNovelAgent` | 完成 | 根清单与锁文件、`client/`、`server/`、`shared/`、`desktop/`、`site/`、公开文档与发布说明 | 根级类型检查、站点类型检查、依赖检查通过 |
| `0xNovelAgent` 桌面与项目图标 | 完成 | `images/brand/`、`desktop/builder/`、`desktop/scripts/generate-desktop-icons.py`、客户端与官网图标资源 | 黑白横向 Logo 已拆分；SVG `0x` 已生成多尺寸 EXE、favicon 与 Web App 图标 |
| 桌面打包作用域兼容修复 | 完成 | `desktop/scripts/stage-desktop.cjs`、`desktop/electron-builder.config.cjs`、`desktop/scripts/verify-desktop-package.cjs` | 旧 workspace 作用域已清理；Electron 原生预编译依赖自动暂存；Windows 安装版与便携版通过结构校验；[打包说明](wiki/debugging/desktop-packaging-native-dependencies.md) |
| 最终品牌名与桌面启动修复 | 完成 | 项目品牌文本、`client/src/components/layout/DesktopBrandMark.tsx`、`desktop/src/runtime/paths.ts`、`desktop/src/main.ts`、桌面打包资源 | 最终名称已更正为 `0xNovelAgent`；启动图标统一使用 `0x` 母版；打包服务器健康检查与真实启动烟测通过 |
| 自定义供应商多模型列表持久化 | 完成 | `server/src/services/settings/ProviderModelCatalogService.ts`、供应商设置路由、路由测试 | 创建、保存或刷新供应商后会保留完整模型列表，重新进入模型路由页面仍可下拉选择同一供应商的多个模型 |
| 自有仓库与桌面更新源切换 | 完成 | Git 远程、项目仓库入口、桌面打包与更新运行时 | 主仓库切换到私有 Gitee；自动更新仅接受显式配置的自有通用更新地址，默认不会访问原 GitHub |
| 桌面端用户级 `sk-` Token、同步注册与充值闭环 | 📋 计划中 | `desktop/`、`server/src/relay/`、`client/src/pages/auth/`、`client/src/pages/account/`、`shared/types/` | [实施方案](wiki/architecture/desktop-user-token-auth-plan.md)；设备 Key 已废弃，已确定单窗口静默启动、强制登录与加密 Token 保持登录，等待中转站字段、币种与幂等契约确认 |
| C 端全新本地数据域 | 📋 计划中 | `desktop/src/runtime/`、本地数据库路径、作品用户归属 | [数据边界](wiki/architecture/desktop-user-token-auth-plan.md#全新本地数据域)；不迁移旧作品、任务和模型配置，新旧数据物理隔离且不自动删除旧数据 |
| C 端新手自适应首页与四入口导航 | 📋 计划中 | `client/src/pages/Home.tsx`、首页组件、客户端导航与状态层 | [产品原则](wiki/product/beginner-first-novel-completion.md#统一自适应首页)；统一首页按新用户、最近作品、生成恢复、离线和余额状态切换主动作 |
| C 端一句话新书创建 | 📋 计划中 | 新书创建页、方向候选、创建草稿与付费恢复 | [产品合同](wiki/product/beginner-first-novel-completion.md#一句话新书创建)；只要求输入故事想法并选择方向，其他偏好可选，模型和专业规划参数隐藏 |
| C 端新书四层滚动规划 | 📋 计划中 | 故事宏观规划、卷战略与骨架、节奏板、章节执行合同 | [产品合同](wiki/product/beginner-first-novel-completion.md#新书四层规划合同)；第一章前生成全书骨架和全部卷规划，只细化当前剧情阶段，下一章任务按需生成 |
| C 端后续剧情调整与最小影响重规划 | 📋 计划中 | 规划版本、影响范围判断、未执行任务失效与连续创作暂停点 | [产品合同](wiki/product/beginner-first-novel-completion.md#调整后续剧情)；用户只描述变化，系统判断最小未来影响范围，保护已完成内容并给出一套推荐方案 |
| C 端单作品文档型创作台 | 📋 计划中 | `client/src/pages/novels/`、作品工作区组件、编辑器、版本历史与 AI 助手 | [产品原则](wiki/product/beginner-first-novel-completion.md#单作品文档型创作台)；默认逐章确认；连续创作受剧情阶段和人民币消费上限双重约束；深度审校由用户在阶段或卷末决定 |
