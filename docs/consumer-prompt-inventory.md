# C 端正式提示词位置清单

更新时间：2026-07-30

本文只整理本地 C 端正式链路正在使用的 Prompt。所有 Prompt 都通过 Prompt Registry 和自有中转调用；用户不能选择模型，也不会绕过中转直连。

## 1. 新书准备

| 用户阶段 | Prompt ID / 版本 | 代码位置 | 当前职责 |
|---|---|---|---|
| 故事方向 | `consumer.setup.story_direction@v3` | `server/src/prompting/prompts/consumer/consumerSetup.prompts.ts` | 从一句想法生成三个差异明显的故事方向；每个方向明确核心优势、优势限制、持续回报和成长路线，并在内部比较至少 6 个书名候选 |
| 全书骨架 | `consumer.setup.book_skeleton@v2` | `server/src/prompting/prompts/consumer/consumerSetup.prompts.ts` | 生成全书核心承诺、主角成长和明确结局；长篇阶段写清压力、不可逆转折、实质变化和下一阶段触发条件，不强制传统三幕剧 |
| 全部卷规划 | `consumer.setup.volume_plan@v3` | `server/src/prompting/prompts/consumer/consumerSetup.prompts.ts` | 生成全部卷的目标、冲突、转折、回报、成长变化和章节范围；每卷内部比较至少 3 个卷名候选 |
| 当前剧情阶段 | `consumer.setup.current_phase@v2` | `server/src/prompting/prompts/consumer/consumerSetup.prompts.ts` | 只展开当前 3～8 章；前三章依次建立具体压力、展示有边界的核心优势、兑现首次回报或制造不可逆新问题 |
| 第一章 | `consumer.setup.first_chapter@v5` | `server/src/prompting/prompts/consumer/consumerSetup.prompts.ts` | 前 150 字进入现场，让主角面对具体压力并作出产生后果的选择；只读取全书主线、第一卷和当前阶段，避免远期设定干扰 |

## 2. 后续逐章写作

| 用户动作 | Prompt ID / 版本 | 代码位置 | 当前职责 |
|---|---|---|---|
| 准备下一章 | `consumer.chapter.task@v4` | `server/src/prompting/prompts/consumer/consumerChapterProduction.prompts.ts` | 根据当前规划和最近已完成章节生成内部写作任务；章节标题取自本章具体事件，并避开最近标题的核心词与句式 |
| 写下一章 | `consumer.chapter.write@v3` | `server/src/prompting/prompts/consumer/consumerChapterProduction.prompts.ts` | 按任务流式生成完整正文，执行统一正文合同 |
| 中断后续写 | `consumer.chapter.continue@v3` | `server/src/prompting/prompts/consumer/consumerChapterProduction.prompts.ts` | 从已保存断点继续，只输出新增内容，不复述已有正文 |

## 3. AI 修改正文

| 用户动作 | Prompt ID / 版本 | 代码位置 | 当前职责 |
|---|---|---|---|
| 按意见修改 | `consumer.chapter.revise@v4` | `server/src/prompting/prompts/consumer/consumerChapterRevision.prompts.ts` | 只精准修改用户指出的问题，尽量保留其余段落；只读取当前卷、当前阶段和最近章节尾段，结果先进入候选稿 |
| 整章重写 | `consumer.chapter.rewrite@v4` | `server/src/prompting/prompts/consumer/consumerChapterRevision.prompts.ts` | 可重组本章场景、行动、对话和节奏，但不改变既定事实、不提前泄露后续规划；结果先进入候选稿 |

## 4. 阶段检查与后续调整

| 用户动作 | Prompt ID / 版本 | 代码位置 | 当前职责 |
|---|---|---|---|
| 阶段或卷末检查 | `consumer.story.review@v2` | `server/src/prompting/prompts/consumer/consumerStoryReview.prompts.ts` | 用全阶段章节边界证据与最近两章高清尾段检查连续性、核心优势代价、读者回报、重复和承接；只报告可定位问题 |
| 调整后续剧情 | `consumer.story.adjust@v2` | `server/src/prompting/prompts/consumer/consumerStoryReview.prompts.ts` | 按“当前阶段 → 卷规划 → 全书骨架”级联判断最小影响范围，已完成章节不可撤销 |
| 准备下一剧情阶段 | `consumer.story.transition@v2` | `server/src/prompting/prompts/consumer/consumerStoryReview.prompts.ts` | 只读取最近两章与相邻卷窗口，生成覆盖下一章的具体行动—阻力—结果计划，不进行质量评判 |

## 5. 所有正文共用规则

以下文件不是独立模型调用，而是被上面的正式 Prompt 拼接使用：

| 规则 | 代码位置 | 影响范围 |
|---|---|---|
| 正文质量、字数和章末规则 | `server/src/prompting/prompts/consumer/consumerProsePolicy.ts` | 第一章、后续正文、中断续写、AI 修改、整章重写 |
| 书名、卷名和章节标题规则 | `server/src/prompting/prompts/consumer/consumerTitlePolicy.ts` | 故事方向、全部卷规划、第一章和所有后续章节任务 |

当前标题规则的产品合同：

- 书名优先 6～16 个汉字，必须同时体现题材方向和本书独有卖点；三个方向不得只替换一个名词。
- 卷名优先 4～10 个汉字，取自本卷独有地点、物件、关系变化、制度冲突或转折。
- 章节标题优先 4～12 个汉字，取自本章真实发生的具体动作、物件、地点、冲突、决定或短对白。
- 禁止“暗流涌动”“风云再起”“危机降临”等可套在任何故事上的万能标题。
- 章节标题不写“第 N 章”，不提前剧透章末答案，并避开最近章节的核心词和句式。
- 模型偶尔不遵守格式时，保存前会本地移除“第 N 章”、外围引号/书名号和句末标点；这个清洗不调用模型、不扣费。

当前商业连载合同：

- `coreAdvantage` 可以是技能、资源、身份、关系、知识或特殊能力，不等同于必须存在的“系统/外挂”。
- `advantageLimit` 必须说明优势的条件、代价、盲区或失败风险。
- `payoffPattern` 说明读者可以反复获得、但表现形式会变化的持续回报。
- `progressionPath` 至少覆盖能力、地位、财富、关系、认知或行动范围中的一种阶段性变化。
- 不强制生死危机、打脸、扮猪吃虎或升级换地图；题材与人物一致性优先。
- 第一章不接收完整远期卷规划和结局，只接收全书核心主线、第一卷规划与当前阶段。

## 6. 注册与模型路由

- Prompt 注册清单：`server/src/prompting/registry/promptAssetLoaderEntries.ts`
- C 端任务到模型角色的映射：`server/src/relay/llm/consumerRelayPolicy.ts`
- 默认模型配置：`server/src/relay/config/relayConfig.ts`

默认路由为：

- `planner`：`deepseek-v4-flash`
- `writer`：`qwen3.7-plus`
- `review`：`claude-sonnet-4-6`

标题规则嵌入既有结构化调用，不会为了生成书名、卷名或章节标题额外增加一次模型请求。
