# 0xNovelAgent 项目上下文

## 项目概述

`0xNovelAgent` 是一个面向小说创作新手的 AI 原生长篇小说生产系统，目标是通过规划、角色、世界观、章节生产、质量修复和知识库等能力，帮助用户完成整部长篇小说。

## 技术架构

- pnpm workspace Monorepo
- `client/`：React + Vite Web 客户端
- `server/`：Node.js + Express + Prisma 服务端
- `shared/`：前后端共享类型与契约
- `desktop/`：Electron Windows 桌面运行时与打包配置
- `site/`：公开介绍站
- 默认本地开发端口：前端 `5173`，后端 `3000`

## 关键架构决策

- C 端重构使用全新的本地数据域，只处理新版本登录后创建的作品、任务、版本和配置。
- 新版本不扫描、不导入、不绑定旧版本作品，不恢复旧任务，也不迁移旧 Provider 或 API 配置。
- 新数据目录或数据库文件必须与旧版本隔离，不能在旧数据库上原地改造成新链路。
- 旧数据不进入新产品，但安装、升级和启动过程也不得自动删除或覆盖旧数据。
- 新作品从创建时绑定当前登录用户；稳定中转 `userId` 映射到匿名本地资料域，同机换账号保留各自作品但互相不可见，退出登录不删除数据，换电脑通过本地备份包恢复。
- 桌面端使用每台安装随机盐对中转 `userId` 做 HMAC 派生，得到匿名 `profileId`；正式本机服务从进程启动起只连接 `consumer-v1/profiles/<profileId>/data/dev.db`，换账号通过加密凭证切换资料域并重新启动本机服务。
- 桌面 renderer 只持有每次启动随机生成的本机 API 会话凭证；用户 `sk-` Token 只存在于 Electron `safeStorage` 密文和本机服务内存。主进程与本机服务使用另一枚不进入 renderer 的临时 Broker 凭证导出和恢复 Token。
- 中转账户 API 根地址使用 `OXNOVEL_RELAY_ACCOUNT_BASE_URL`，OpenAI 兼容模型根地址使用 `OXNOVEL_RELAY_BASE_URL`；两者必须分离配置，业务模块不得直接拼接中转地址。
- 桌面发布默认中转配置集中保存在 `desktop/config/consumer-release.defaults.json`，当前账号根地址为 `https://api.0xkey.cn`、模型根地址为 `https://api.0xkey.cn/v1`；发布环境变量可以覆盖，但任何 Beta/正式安装包都不得再生成空中转策略。
- 中转注册固定发送 `username`、`password`、可选 `email` 和可选 `verification_code`，登录固定发送 `username`、`password`；两者都统一为带 `0xn_` 前缀的中转用户名。
- 注册接口不被假定直接返回 API Key。同步认证固定执行“注册（仅注册模式）→ 登录取得 Cookie/用户 ID → 查找或创建名称严格为 `0xNovelAgent` 的有效 Key → 取回明文 → 统一规范为 `sk-...` → 用余额接口校验归属”。
- 同一账号优先复用 ID 最大、启用且未过期的 `0xNovelAgent` Key；其他客户端 Key、禁用 Key 和过期 Key不复用。中转返回裸 key 时只在服务端边界补 `sk-`，桌面 Broker、`safeStorage` 和后续 Bearer 请求只接受规范 `sk-`。
- 桌面加密会话同时保存稳定用户 ID、用户名和显示名；恢复时以同一 Token 的余额接口重新校准用户归属，不再构造 `pending` 占位用户。保持登录保存 Token，不保存账号密码明文。
- 新书采用四层规划：先生成全书骨架和全部卷规划，只详细展开当前剧情阶段，并按需生成下一章任务。
- 新书初始化按故事方向、全书骨架、全部卷规划、当前剧情阶段和第一章分五步，每一步都由用户确认后才产生下一次付费调用。
- 新书初始化由 `ConsumerStorySetup` 的单一 `step + status + revision` 状态机驱动；每个付费阶段绑定唯一 `ConsumerCreationOperation.requestKey`，失败或结果未知不得自动重试，进程重启后的未决调用进入 `outcome_unknown`。
- 五个初始化 Prompt 必须注册到 Prompt Registry 并携带作品、操作和阶段元数据；第一章生成结果先进入 `ConsumerChapterCandidate`，只有用户确认后才写入正文、草稿和不可变版本。
- 逐章生产使用 `ConsumerCreationOperation` 作为单章计费和恢复边界：下一章任务与正文生成归入同一操作，流式正文只写可变草稿，用户确认下一章时才把当前草稿写入正式正文并保存不可变版本。
- 逐章 Prompt 固定通过 `consumer.chapter.task@v1`、`consumer.chapter.write@v1` 和 `consumer.chapter.continue@v1` 进入 Prompt Registry；最近章节上下文不得包含目标章节或来源章节之后的未来内容。
- 逐章 `requestKey` 只允许同作品、同章节意图幂等复用；失败或结果未知保留已接收正文，恢复必须创建新的付费续写操作，不能重放原中转请求。
- C 端创作台在桌面端使用章节目录、正文和下一步三栏结构；窄屏端正文优先，目录与历史版本使用可访问对话框，下一步垂直排列在正文之后。
- 后续剧情调整由系统判断最小的未来影响范围；已完成章节和卷默认锁定，普通用户只确认推荐调整方案，不直接操作重规划内部资产。
- 商业版不引入第三方分析、崩溃自动上报或远程日志；公开站、桌面更新和正式 C 端 AI 请求只能使用显式配置的自有地址。
- 正式 C 端所有 AI 能力只允许经过自有中转站，不提供用户 API Key、内置供应商直连、自定义 Provider 或专家直连开关；该边界由本机服务强制执行，旧直连能力只能保留在构建时隔离的内部开发包中。
- 第一版不提供模型选择，由系统按任务自动路由；中转按实际调用量扣费，章节内部必要调用统一汇总为该章消费。
- 正文始终可直接编辑；AI 修改、续写和整章重生成只生成候选稿，用户采用前不覆盖正文。自动保存与历史版本分离，关键节点保存不可变快照，采用、放弃和恢复版本本身不调用 AI。
- C 端章节持久化明确分为 `ConsumerChapterDraft`（可变工作草稿）、`ConsumerChapterCandidate`（待采用候选）、`ConsumerChapterVersion`（不可变历史版本）和 `ConsumerCreationOperation`（付费创作操作）；草稿使用递增 revision 做乐观并发控制，任何后台结果都不能直接写入用户正在编辑的正文。
- AI 修改与整章重写分别通过 `consumer.chapter.revise@v1` 和 `consumer.chapter.rewrite@v1` 进入 Prompt Registry；操作开始时冻结来源正文、草稿 revision 与正文哈希，流式结果只进入 `ConsumerCreationOperation.receivedContent`，成功后才创建候选稿。
- AI 候选稿采用前必须重新校验冻结的 revision 与正文哈希；当前草稿已经变化时拒绝陈旧候选稿。采用前保存原草稿版本、采用后保存候选版本；采用、放弃、预览和版本恢复本身不调用 AI，“继续调整”创建新的付费操作。
- 阶段/卷末检查点由已确认的 `currentPhase.chapterEnd` 与卷规划边界推导；检查点未处理时，下一章生成在服务端被阻断。用户可以检查后继续或跳过深度检查，但两条路径都必须先准备覆盖下一章的新阶段规划。
- 阶段检查、跳过后的阶段过渡和主动后续剧情调整分别通过 `consumer.story.review@v1`、`consumer.story.transition@v1` 与 `consumer.story.adjust@v1` 进入 Prompt Registry。
- 故事方案冻结规划 revision、规划哈希与全部已完成章节正文哈希；采用时三者重新校验。规划版本使用 `ConsumerPlanningVersion` 保存完整全书骨架、卷规划和当前阶段快照，恢复版本和采用/放弃方案本身不调用 AI，任何规划操作都不得写入已完成章节。
- 尚未确认的主动后续剧情方案会在服务端阻断下一次付费章节生成；不能只依赖前端隐藏按钮。
- 桌面备份使用 SQLite 在线快照并打包当前账号的数据库与本地素材；备份包含带随机盐的账号归属指纹和逐文件哈希，恢复前先完整校验、自动创建安全备份并保留 `restore-recovery/` 回退目录。
- 当前中转站没有 AI 请求幂等、状态查询、结果取回和流式续传契约；第一版只做逐章确认，生成中持续保存本地草稿，中断后从已有正文发起新的续写请求，不承诺恢复原中转请求。
- 充值订单可按 `orderNo` 恢复查询；余额和消费统一显示为“0x积分”，产品合同为 `1 元人民币 = 1 0x积分`，中转 Quota 和上游币种只用于内部对账。
- 充值适配器在展示付款码前强制校验订单 `money === amount`，订单查询也执行同一校验；不一致时阻止付款。`pnpm run verify:relay-contract` 是零扣费发布门禁，`pnpm run verify:relay-contract:live` 仅在人工提供真实 Token、已支付订单号并显式开启实扣时运行。
- C 端第一阶段固定为七个核心页面和四个一级入口，按运行边界、账号充值、本地数据、新书初始化、创作台、AI 修改、审校调整和发布收口八个阶段实施；总验收目标是零基础用户独立完成前三章。
- 正式 C 端本机服务只暴露 `/api/health` 与 `/api/consumer/**`；C 端启动不初始化 RAG、导演、旧任务恢复、质量债务和第三方专业服务。
- 桌面客户端使用 Consumer 专用构建入口，正式 renderer 不得包含旧 B 端路由 chunk；非工作台窄屏页面使用全宽内容与底部导航，工作台保持正文优先。
- 桌面发布包必须内置账号 API、AI 中转、更新站和 HTTPS 域名白名单；生产中转地址必须与白名单精确匹配，非 Beta 正式发布必须提供 Windows 签名材料和 HTTPS 更新地址。
- C 端断网时本地浏览、编辑、保存、导出和备份继续可用；登录、充值和付费 AI 请求在发送前阻止，不能以网络自动重试制造重复消费。
- 运行日志统一脱敏、截断；C 端始终禁止模型请求/响应正文日志。当前账号本地数据可在二次确认后移入系统回收站，但这不等于注销中转账号。
- 发布流水线必须先执行 C 端边界验证，再检查桌面包中的发布策略和旧页面 chunk，并生成 CycloneDX SBOM 与第三方依赖许可证清单。
- `LICENSE` / `NOTICE` 属于商业上线 P0 门槛而不是可删除的追踪代码；取得书面商业授权或完成律师确认的 AGPL 履约方案前，不发布收费闭源 SaaS。

## 开发约定

- 优先遵守仓库根目录 `AGENTS.md` 中的安全、架构、产品与发布规则。
- 使用仓库声明的 Node.js 版本范围和 `pnpm@10.6.0`。
- UI 文案从用户任务和下一步行动出发，避免开发过程叙述。
- 桌面版本号以 `desktop/package.json` 为准；公开发布标签必须与版本号匹配。
- 主仓库为 `https://gitee.com/b497021499/0xnovel.git`；原 GitHub 仓库只保留为本地 `upstream` 参考，禁止向其推送。
- 私密仓库不能把访问令牌内置到 EXE；自动更新必须通过 `OXNOVEL_DESKTOP_UPDATE_URL` 指向可匿名读取的自有通用更新目录。

## 环境信息

- Web 开发：`pnpm dev`
- Electron 桌面开发：`pnpm dev:desktop`
- Windows 安装包：`pnpm dist:desktop:nsis`
- Windows 便携包：`pnpm dist:desktop:portable`
