# 功能进度看板

> 最后更新：2026-07-29

| 功能 | 状态 | 涉及文件 | 文档 |
|------|------|----------|------|
| 项目品牌统一为 `0xNovelAgent` | 完成 | 根清单与锁文件、`client/`、`server/`、`shared/`、`desktop/`、`site/`、公开文档与发布说明 | 根级类型检查、站点类型检查、依赖检查通过 |
| `0xNovelAgent` 桌面与项目图标 | 完成 | `images/brand/`、`desktop/builder/`、`desktop/scripts/generate-desktop-icons.py`、客户端与官网图标资源 | 黑白横向 Logo 已拆分；SVG `0x` 已生成多尺寸 EXE、favicon 与 Web App 图标 |
| 桌面打包作用域兼容修复 | 完成 | `desktop/scripts/stage-desktop.cjs`、`desktop/electron-builder.config.cjs`、`desktop/scripts/verify-desktop-package.cjs` | 旧 workspace 作用域已清理；Electron 原生预编译依赖自动暂存；Windows 安装版与便携版通过结构校验；[打包说明](wiki/debugging/desktop-packaging-native-dependencies.md) |
| 最终品牌名与桌面启动修复 | 完成 | 项目品牌文本、`client/src/components/layout/DesktopBrandMark.tsx`、`desktop/src/runtime/paths.ts`、`desktop/src/main.ts`、桌面打包资源 | 最终名称已更正为 `0xNovelAgent`；启动图标统一使用 `0x` 母版；打包服务器健康检查与真实启动烟测通过 |
| 自定义供应商多模型列表持久化 | 完成 | `server/src/services/settings/ProviderModelCatalogService.ts`、供应商设置路由、路由测试 | 创建、保存或刷新供应商后会保留完整模型列表，重新进入模型路由页面仍可下拉选择同一供应商的多个模型 |
| 自有仓库与桌面更新源切换 | 完成 | Git 远程、项目仓库入口、桌面打包与更新运行时 | 主仓库切换到私有 Gitee；自动更新仅接受显式配置的自有通用更新地址，默认不会访问原 GitHub |
| 商业 SaaS 外联与许可证审计 | 🚧 进行中 | 桌面运行时、公开站、发布流程、外部请求、`LICENSE` / `NOTICE` | [风险审计](wiki/security/commercial-saas-risk-audit.md)；原作者公开站和非必要代理外联已清理并加入回归检查，商业授权仍是收费上线 P0 阻断项 |
| C 端 SaaS 完整改造总纲 | 🚧 外部验收中 | 产品流程、页面信息架构、认证中转、本地数据、计费恢复、商业发布与阶段验收 | [完整改造总纲](wiki/architecture/local-exe-saas-rebuild-plan.md)；阶段 0～7 本地代码和发布门禁已落地，中转八项合同已有六项完成自动验收、两项具备真实验收脚本，等待真实小额支付/模型扣费、正式签名和全新 Windows 前三章端到端验收 |
| 桌面端用户级 `sk-` Token、同步注册与充值闭环 | 🚧 外部验收中 | `desktop/src/runtime/`、`server/src/relay/`、`client/src/features/consumerAuth/`、`client/src/pages/account/`、`shared/types/relay.ts` | [完整中转合同](wiki/architecture/local-exe-saas-rebuild-plan.md#221-中转契约)；注册/登录字段、注册后自动登录换 Key、专用 Key 复用/失效、裸 key 规范化、稳定身份恢复和桌面加密凭证均已冻结并通过门禁；等待一笔真实已支付小额订单 |
| C 端 AI 唯一中转出口 | 🚧 外部验收中 | `server/src/relay/llm/`、LLM 工厂、服务端产品边界、客户端 C 端路由 | [唯一出口决策](wiki/architecture/desktop-user-token-auth-plan.md#131-正式-c-端唯一-ai-出口)；Consumer 模式强制 relay、自动模型和服务端路由白名单，同一 Key 的普通、SSE 流式和 JSON Schema 结构化调用已通过真实 OpenAI 客户端契约测试；等待生产中转最小实扣验收 |
| C 端 0x积分与创作操作计费 | 🚧 外部验收中 | 中转用量适配、账户余额、消费记录、微信充值、订单轮询与 `ConsumerCreationOperation` | [计费合同](wiki/architecture/local-exe-saas-rebuild-plan.md#17-0x积分充值和消费)；余额、消费和支付 UI 已统一为 0x积分，订单 `money !== amount` 会在付款前被阻断，真实支付/模型余额日志对账脚本已完成；等待生产凭证留证 |
| C 端全新本地数据域 | 🚧 进行中 | `desktop/src/runtime/profileIdentity.ts`、`desktop/src/runtime/profileBackup.ts`、账号独立数据库、草稿和备份目录 | [数据边界](wiki/architecture/local-exe-saas-rebuild-plan.md#15-本地数据账号隔离与备份)；账号隔离、在线数据库快照、账号校验备份、恢复前安全备份和回退目录已实现，等待正式桌面包换机恢复验收 |
| C 端页面与实施路线 | 🚧 外部验收中 | 桌面运行边界、认证充值、本地数据、创建流程、创作台、候选版本、审校调整和发布收口 | [唯一执行方案](wiki/architecture/local-exe-saas-rebuild-plan.md)；C 端独立构建、账户/帮助/隐私页、本地作品、五步准备、创作台和窄屏导航已接入，以零基础用户独立完成前三章为总验收 |
| C 端新手自适应首页与四入口导航 | 📋 计划中 | `client/src/pages/Home.tsx`、首页组件、客户端导航与状态层 | [产品原则](wiki/product/beginner-first-novel-completion.md#统一自适应首页)；统一首页按新用户、最近作品、生成恢复、离线和余额状态切换主动作 |
| C 端一句话新书创建 | 🚧 进行中 | `shared/types/consumerSetup.ts`、`server/src/modules/consumerSetup/`、`client/src/pages/consumer/setup/`、五个初始化 Prompt | [完整产品合同](wiki/architecture/local-exe-saas-rebuild-plan.md#8-一句话新书创建与五阶段确认)；五次生成/确认、请求幂等、结果未知、三方向选择和第一章候选稿已实现，等待真实中转计费与桌面端到端验收 |
| C 端新书四层滚动规划 | 🚧 进行中 | 初始化全书骨架、全部卷规划、当前阶段结构化资产与逐章写作任务 | [完整产品合同](wiki/architecture/local-exe-saas-rebuild-plan.md#9-四层滚动规划合同)；四层主合同已接入，下一章任务按确认后的最新正文生成；阶段边界滚动更新待阶段 6 |
| C 端后续剧情调整与最小影响重规划 | 🚧 进行中 | `shared/types/consumerStoryReview.ts`、`server/src/modules/consumerProduction/application/storyReviewService.ts`、`client/src/pages/consumer/workspace/ConsumerStoryReviewPanel.tsx` | [阶段 6](wiki/architecture/local-exe-saas-rebuild-plan.md#阶段-6阶段审校和后续调整)；阶段/卷末检查与跳过、最小影响方案、三重陈旧保护、规划版本和高影响付费阻断已通过 32 项聚焦回归及桌面/390px 模拟 API 验收，等待真实中转和正式 Windows 包验收 |
| C 端单作品文档型创作台 | 🚧 进行中 | `client/src/pages/consumer/ConsumerWorkspacePage.tsx`、`client/src/pages/consumer/workspace/`、`server/src/modules/consumerWorkspace/`、`server/src/modules/consumerProduction/` | [唯一执行方案](wiki/architecture/local-exe-saas-rebuild-plan.md#10-单作品文档型创作台)；章节目录、故事规划目录、正文编辑、自动保存、历史恢复、逐章生成、失败续写、AI 修改/重写、候选稿、阶段检查、后续调整、版本、消费显示和窄屏适配已实现 |
| C 端逐章生产与中断恢复 | 🚧 进行中 | `shared/types/consumerChapterProduction.ts`、`server/src/modules/consumerProduction/`、`server/src/prompting/prompts/consumer/consumerChapterProduction.prompts.ts`、`client/src/api/consumerChapterProduction.ts`、`client/src/pages/consumer/workspace/ConsumerProductionPanel.tsx` | [阶段 4](wiki/architecture/local-exe-saas-rebuild-plan.md#阶段-4创作台和逐章生成)；本地状态机、下一章任务、流式草稿、单章消费、请求幂等、结果未知和断点续写已通过聚焦回归与桌面/390px 模拟 API 验收，等待真实中转和正式 Windows 包前三章验收 |
| C 端 AI 修改、候选稿与版本 | 🚧 进行中 | `shared/types/consumerChapterRevision.ts`、`server/src/modules/consumerProduction/application/chapterRevisionService.ts`、`server/src/prompting/prompts/consumer/consumerChapterRevision.prompts.ts`、`client/src/pages/consumer/workspace/ConsumerRevisionPanel.tsx` | [阶段 5](wiki/architecture/local-exe-saas-rebuild-plan.md#阶段-5ai-修改候选稿和版本)；修改与整章重写、冻结来源、流式候选、继续调整、陈旧候选保护、非破坏性采用和历史版本已通过 21 项聚焦回归及桌面/390px 模拟 API 验收，等待真实中转计费和正式 Windows 包恢复验收 |
| C 端正式发布收口 | 🚧 外部验收中 | Consumer 路由/服务白名单、发布策略、日志脱敏、离线行为、本地删除、签名门禁、SBOM 与桌面包检查 | [阶段 7](wiki/architecture/local-exe-saas-rebuild-plan.md#阶段-7正式发布收口)；32 项聚焦回归、C 端发布门禁、Windows x64 目录包验证和 390px 浏览器验收已通过，等待真实证书/更新源、法务和全新 Windows 真实中转前三章验收 |
