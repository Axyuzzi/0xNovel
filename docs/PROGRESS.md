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
| 商业 SaaS 外联与许可证审计 | 🚧 进行中 | 桌面运行时、公开站、发布流程、外部请求、`LICENSE` / `NOTICE` | [风险审计](wiki/security/commercial-saas-risk-audit.md)；原作者公开站和非必要代理外联已清理并加入回归检查，商业授权仍是收费上线 P0 阻断项 |
| 桌面端用户级 `sk-` Token、同步注册与充值闭环 | 📋 计划中 | `desktop/`、`server/src/relay/`、`client/src/pages/auth/`、`client/src/pages/account/`、`shared/types/` | [实施方案](wiki/architecture/desktop-user-token-auth-plan.md)；已核对余额、消费日志、微信下单和订单查询接口；等待注册登录字段、Token 规则及真实 1:1 积分换算联调 |
| C 端 AI 唯一中转出口 | 📋 计划中 | `server/src/relay/llm/`、LLM 工厂与模型路由、客户端模型设置、正式构建边界 | [唯一出口决策](wiki/architecture/desktop-user-token-auth-plan.md#131-正式-c-端唯一-ai-出口)；正式产品所有 AI 只走中转，第一版由系统自动路由模型，不提供供应商、模型或专家设置 |
| C 端 0x积分与创作操作计费 | 📋 计划中 | 中转用量适配、章节操作、初始化阶段、账户与消费记录 UI | [计费合同](wiki/architecture/desktop-user-token-auth-plan.md#14-请求记录与扣费关联)；1 元等于 1 0x积分，只要产生模型调用即按量扣费，章节内部调用统一汇总为本章消费 |
| C 端全新本地数据域 | 📋 计划中 | `desktop/src/runtime/`、本地数据库路径、作品用户归属、备份恢复 | [数据边界](wiki/architecture/desktop-user-token-auth-plan.md#42-本地账号资料域与换账号)；稳定用户 ID 映射匿名资料域，同机多账号作品隔离保留，换电脑通过本地备份包恢复 |
| C 端新手自适应首页与四入口导航 | 📋 计划中 | `client/src/pages/Home.tsx`、首页组件、客户端导航与状态层 | [产品原则](wiki/product/beginner-first-novel-completion.md#统一自适应首页)；统一首页按新用户、最近作品、生成恢复、离线和余额状态切换主动作 |
| C 端一句话新书创建 | 📋 计划中 | 新书创建页、方向候选、创建草稿与付费恢复 | [产品合同](wiki/product/beginner-first-novel-completion.md#一句话新书创建)；内容决策只要求故事想法和方向，故事方向、全书骨架、全部卷规划、当前剧情阶段和第一章分别由用户确认后付费生成 |
| C 端新书四层滚动规划 | 📋 计划中 | 故事宏观规划、卷战略与骨架、节奏板、章节执行合同 | [产品合同](wiki/product/beginner-first-novel-completion.md#新书四层规划合同)；第一章前生成全书骨架和全部卷规划，只细化当前剧情阶段，下一章任务按需生成 |
| C 端后续剧情调整与最小影响重规划 | 📋 计划中 | 规划版本、影响范围判断、未执行任务失效与连续创作暂停点 | [产品合同](wiki/product/beginner-first-novel-completion.md#调整后续剧情)；用户只描述变化，系统判断最小未来影响范围，保护已完成内容并给出一套推荐方案 |
| C 端单作品文档型创作台 | 📋 计划中 | `client/src/pages/novels/`、作品工作区组件、编辑器、候选稿、版本历史与 AI 助手 | [产品原则](wiki/product/beginner-first-novel-completion.md#ai-内容写入边界)；正文始终可编辑，AI 修改先生成候选稿，采用前不覆盖正文；自动保存与历史版本分离，章节调用汇总为本章 0x积分消费 |
