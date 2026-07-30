# 2026-07-25 新手首次使用体验走查（产品沟通稿）

> 这是一份面向产品/UX 的体验反馈文档，目的是把"完全不懂写作的小白第一次接触 0xNovelAgent"这条路径上遇到的卡点、困惑和劝退点显式记录下来，便于和产品沟通优先级和下一步动作。
>
> 文档不是发版说明，也不会直接变成长线任务清单；具体落地动作请同步进 `TASK.md` 或对应的 wiki 规则文件。
>
> 评审视角：扮演"完全不会写小说、没接过大模型 API、第一次听说 AI 能写小说"的用户，从桌面版启动 → 打开首页 → 尝试开书 → 遇到问题找帮助的整条路径走一遍。

---

## 1. Background

0xNovelAgent 的产品定位、产品人格和核心体验原则已在 `PRODUCT.md`、`docs/wiki/product/beginner-first-novel-completion.md`、`docs/wiki/product/beginner-ux-redesign.md` 中给出：把"小白写完整本小说"作为顶层目标，反对开发者术语、配置墙、隐藏规则。2026-07-23 的 release notes 也明确以"新手创作体验"为本期重头戏。

但从用户首次接触产品的视角看，**已经落地的底层能力（自动导演、章节执行、修复回路）和"5 分钟内让小白动笔"之间还存在若干断点**：首屏劝退、关键功能承诺缺失、命名体系不一致、隐藏入口、术语未翻译。

本次走查目标：把每条卡点的具体表现、当前用户受影响的方式、用户预期是什么、对应到代码/文档的位置写清楚，便于和产品逐一对照优先级。

---

## 2. 走查路径

按用户实际操作顺序：

1. 桌面版首次启动
2. 进入首页
3. 阅读文档站
4. 创建小说（自动导演 / 手动两种）
5. 配置模型
6. 写作中遇到问题找帮助

---

## 3. 卡点清单

### 3.1 严重程度定义

- **P0 劝退**：用户在 5 分钟内会直接放弃，或在第一步就被卡住
- **P1 困惑**：用户能继续，但需要二次猜路或学习成本
- **P2 体验细节**：单独看不严重，但叠加会让小白觉得"产品不太专业"

---

### 3.2 P0 劝退类（5 项）

#### ① 桌面版首次启动弹出英文全屏遮罩

- **用户看到什么**：打开桌面版，第一眼是全屏英文弹窗 "Set Up A Model Provider First"，按钮是 "Open model settings" / "View setup help"。
- **困惑**：整页其它部分都是中文，唯独这个遮罩是英文。"Provider 是什么？是不是装错了？"
- **当前代码位置**：`client/src/components/layout/DesktopModelSetupGate.tsx` L49-90。
- **用户预期**：遮罩文案应该和整页一致使用中文，且首句直接告诉用户"你现在没配 AI 服务商，需要先填一个才能开始写"。
- **建议方向**：把英文文案翻成中文 + 改成产品人格的语气（参考 `PRODUCT.md` "冷静、可信、专注"）。

#### ② release notes 承诺的「AI 写作环境检查（免费本地 / 效果优先 / 成本优先）」三选一面板未实现

- **用户看到什么**：release notes 2026-07-23 明确写"首次准备改为 AI 写作环境检查：在免费本地 / 效果优先 / 成本优先里选一个"。我点"帮助与设置"，按步骤走到第 3 步，发现根本没有这个三选一面板，只能直接面对 API Key 填写。
- **困惑**：我是新手，不懂"效果优先"和"成本优先"具体差什么、对应哪些 API、会不会立刻扣费？文档承诺了一个引导，但实际不存在。
- **当前代码位置**：`client/src/pages/settings/SettingsPage.tsx` 中缺失该面板；`client/src/pages/help/HelpPage.tsx` 第 41-46 行的步骤引导指向了不存在的组件。
- **用户预期**：要么实现这个三选一面板，要么把 release notes 改成更准确描述。
- **建议方向**：补齐 `ProviderSelectionChooser` 组件，含三个预设卡片 + 各自推荐的厂商 + 一句"该预设会用什么模型、估算成本量级"。

#### ③ 关键设置入口（模型路由页）在新手模式侧栏完全不可见

- **用户看到什么**：装好 Key 后，系统顶栏提示"AI 需要配置"（跳到 `/settings`）。可作为新手模式用户，**侧栏里根本没有 `/settings/model-routes` 的入口**，我也不能在 `/settings` 主页找到指向它的明确引导。
- **困惑**："模型路由"是什么？我装了 Key 不就够了吗？为什么还说没配置完？
- **当前代码位置**：`client/src/config/navConfig.ts` L97 把 `model-routes` 归入专业模式；新手模式侧栏的 BEGINNER_NAV_GROUPS 不含它。
- **用户预期**：新手模式也要有一条明确的"如果你被引导到这里（AI 仍报未配置）→ 下一步点这个"路径，至少要从 `/settings` 主页能直接点到。
- **建议方向**：要么让模型路由页以"高级 → 模型路由"形式在 `/settings` 主页卡片出现，要么在 `/settings` 顶部的"AI 仍需配置"诊断区直接展开该页关键摘要。

#### ④ `TASK.md` 用记事本打开是乱码

- **用户看到什么**：根目录的 `TASK.md` 有 1343 行，但记事本/微信文件传输会按系统 GBK 解码 UTF-8，显示成 `# AI 闀跨瘒鎴愪功褰撳墠鎵ц璁″垝...`。
- **困惑**：以为文件损坏 / 以为项目很业余。
- **真实情况**：文件本体是合法 UTF-8，渲染乱码是工具的字体回退或编码检测失败所致。
- **建议方向**：在 `README.md` 顶部加一句"仓库所有 .md 文件均为 UTF-8 编码，请用 VS Code / Notepad++ / 现代编辑器打开"；或者根目录放一个 `.editorconfig` 显式声明编码。

#### ⑤ 桌面端启动失败时只让"查看日志再重试"

- **用户看到什么**：`DesktopBootstrapShell.tsx` 在启动失败时弹"启动受阻 / 启动失败"，按钮是"查看日志再重试"。
- **困惑**：对一个桌面版用户来说，"日志"是什么？日志在哪？我重试它还会再失败吗？
- **当前代码位置**：`client/src/components/layout/DesktopBootstrapShell.tsx` L74。
- **建议方向**：把"查看日志"按钮改成"打开帮助文档"或"复制错误码发给我们"等用户实际能执行的动作；日志展示应允许一键复制，并附"错误码说明"链接。

---

### 3.3 P1 困惑类（6 项）

#### ⑥ 顶栏"AI 已就绪"徽标点击后跳到 `/settings`，但页面不告诉我"下一步填哪里"

- **用户看到什么**：点"AI 需要配置"徽标跳到 `/settings`，页面有 800 字段，按滚动顺序是：界面模式切换 → 新手偏好 → **开始创作必需**（Key + 模型）→ 模型路由 → 知识库设置……
- **困惑**：我应该先填哪个、跳过哪个？是不是所有项都得填完才能写？
- **当前代码位置**：`client/src/components/layout/Navbar.tsx` L70-83 跳转到 `/settings`；`SettingsPage.tsx` 没有"从徽标点击进入时高亮定位到 Key 配置区块"。
- **建议方向**：点击徽标进入 `/settings` 时，自动滚动 + 高亮"开始创作必需"区块；如果模型路由异常，再附一条"还需要指定模型路由 → 点这里"。

#### ⑦ 知识库命名 + 上传限制双重不友好

- **用户看到什么**：侧栏入口叫"知识库"，但它实际是"我写作时要查的参考资料"。上传只支持 `.txt`，没有任何前置提示。
- **困惑**：上传 `.epub` / `.pdf` 后被拒收，为什么不告诉我支持哪些格式 / 为什么不支持 PDF？
- **当前代码位置**：`client/src/pages/knowledge/KnowledgePage.tsx` L390 的 `isTxtFile` 检查；侧栏 `navConfig.ts` L85 命名为"知识库"。
- **建议方向**：
  - 入口在新手模式改成"创作资料"（与 `KnowledgePage.tsx` 的 `documents` Tab 名一致）
  - 上传区域加一句"目前支持 .txt；PDF / Word 转换后即可使用"
  - 错误提示从"仅支持 .txt 文件"改成"目前只支持 .txt，如果你想用 PDF / Word，建议先复制文本到 .txt 后再上传"

#### ⑧ 三种称呼指向不同地方，新手分不清

- **现象**：
  - `/help` 步骤引导里叫"任务中心"= `/tasks`
  - `/tasks` 侧栏专业模式叫"运行记录"（2026-07-15 改名）
  - `/auto-director/follow-ups` 新手模式侧栏叫"创作消息"
- **困惑**：这三个东西到底是不是同一个？是不是同一个功能被改了三次名字？
- **建议方向**：先把"任务中心 / 运行记录 / 创作消息"在新手模式下统一成一个面向用户动作的命名（例如"AI 消息和进度"），并在新手指南里说明这三者的关系。

#### ⑨ 创建小说页手动表单信息密度高到劝退

- **用户看到什么**：`/novels/create` 的手动表单有：书名 / 概述 / 读者 / 卖点 / 章节数 / 世界 / 题材 / 续写源 / AI 检测……十几项。自动导演主按钮在右上角，但**手动表单占了整屏 80% 区域**。
- **困惑**：是不是要先填完这十几项才能开始？自动导演按钮这么小，是不是测试功能？
- **当前代码位置**：`client/src/pages/novels/NovelCreate.tsx` + `components/NovelBasicInfoForm.tsx`。
- **建议方向**：交换视觉权重——把"AI 自动导演开书"作为页面主体（占整屏），手动表单收进次级折叠区或"高级选项"。

#### ⑩ `/help`（新手指南）在新手模式侧栏不可见

- **用户看到什么**：新手模式侧栏里"帮助与设置"实际指向 `/settings`，但 `/help` 路由（专门给新人的步骤引导）在新手模式侧栏被隐藏。
- **建议方向**：把 `/help` 也加入新手模式侧栏，新手遇到问题能直接点进去。

#### ⑪ 自动导演第 4 阶段仍有技术词汇

- **现象**：自动导演 5 阶段里第 4 阶段"模型与运行方式：跟随模型路由 vs 固定模型"——"模型路由"对没接过大模型 API 的人是黑话。
- **当前代码位置**：`client/src/pages/novels/autoDirector/StageModelRun.tsx`。
- **建议方向**：把阶段名从"模型与运行方式"改成"AI 用哪个模型来写"，副标题说明"通常选跟随默认就好；只有你想让整本书都用同一个特定模型时改这个"。

---

### 3.4 P2 体验细节类（5 项）

#### ⑫ 新手首页没有 onboarding 浮层 / 步骤气泡

- **用户看到什么**：首页是 `HomeNextActionPanel` + `HomeStatusStrip` + `HomeAttentionQueue` + `HomeRecentNovels` + `HomeAssetHealth` 5 个组件拼成的仪表盘。
- **建议方向**：第一次访问时，显示一个 3-5 步的浮层（"选 AI 自动导演开书" / "手动建书" / "去看文档"），完成后不再出现。

#### ⑬ "新手创作偏好"目前只是本地摆设

- **用户看到什么**：我能设置"主动程度 / 成本容忍 / 自动修复"，但系统从来没告诉我"你刚才选的是怎么影响 AI 的"——也没真的接到服务端（release-notes 自己都承认"未来版本才真正影响行为"）。
- **建议方向**：要么把偏好的实际效果接进服务端，要么在偏好面板下方加一句灰字"现在只是标记你的倾向；等下次大版本升级后会真正影响 AI 行为"。

#### ⑭ 公开文档站没有"我是新手从这里开始"的单一聚合页

- **用户看到什么**：公开文档内容齐全，但分散在 3 个 manifest 分类（开始使用 / 实战手册 / 创作主链），需要跨分类跳转。
- **建议方向**：在 `site/` 站首页增加一个聚合卡片"我是新手，30 分钟写第一本"，直链到 `first-novel-walkthrough.md`。

#### ⑮ `first-novel-walkthrough.md` 还有内部术语

- **现象**：文档产物路径仍叫"故事宏观 / 书契约 / 节奏板 / 应用角色阵容"。
- **建议方向**：在产物名后括号加一句白话解释（"故事宏观 = 这本书的核心方向"），而不是直接换术语——文档应该作为术语翻译层存在。

#### ⑯ 桌面端遮罩/启动壳外层包装的英文标记

- **建议方向**：除了 ① 提到的英文文案，桌面端部分组件（`DesktopBrandMark` 等）也有英文标签 / aria 标记。一并审查并中文化。

---

## 4. 与既有规则的对应关系

| 走查卡点 | 既有规则 | 现状偏差 |
|---|---|---|
| ① 桌面英文遮罩 | `beginner-ux-redesign.md` 要求文案人话化 | 未落地（英文） |
| ② 三选一面板 | release-notes 2026-07-23 承诺 | 缺失 |
| ③ 模型路由入口隐藏 | `settings-readiness.md` 要求全局创作入口能诊断 | 隐藏，违反 |
| ④ TASK.md 编码 | 无显式规则 | 仓库惯例需补 .editorconfig / README 提示 |
| ⑤ 启动失败处理 | 无显式规则 | 待补 |
| ⑥ 徽标点击定位 | `settings-readiness.md` "首屏必须清楚说明基础创作链路是否可用" | 部分违反，未高亮 |
| ⑦ 知识库命名 | `beginner-ux-redesign.md` 反对开发者术语 | "知识库"是开发者术语 |
| ⑧ 命名三套并存 | `PRODUCT.md` "冷静、可信、专注" | 不一致 |
| ⑨ 创建页视觉权重 | `beginner-ux-redesign.md` 主路径适配新手 | 视觉权重倒挂 |
| ⑩ /help 入口隐藏 | `beginner-ux-redesign.md` 高级控件不主导流程 | `/help` 在新手模式被隐藏 |
| ⑪ 自动导演阶段术语 | `beginner-ux-redesign.md` 白话化 | 第 4 阶段仍有技术词汇 |
| ⑫ onboarding 缺失 | `beginner-first-novel-completion.md` 强引导 | 未落地 |
| ⑬ 新手偏好摆设 | release-notes 自己承认 | 文档承诺与实现 gap |
| ⑭ 文档聚合页 | `site/DESIGN.md` 反对通用卡片堆叠 | 缺单一聚合入口 |
| ⑮ 文档内部术语 | `site/DESIGN.md` 文学编辑部气质 | 部分违反 |
| ⑯ 桌面英文标记 | `PRODUCT.md` 用户语言一致性 | 散落英文 |

---

## 5. 沟通建议（与产品对话时的提问模板）

> 下面 5 个问题是建议先和产品对齐的优先级问题，每题给出推荐答案（仅供讨论，不替代决策）。

1. **桌面端首次启动遮罩（①）和 release-notes 三选一面板（②）哪一个先做？**
   - 推荐：① 成本极低（纯文案），先做；② 是承诺的功能，需要业务确认投入。
2. **模型路由入口（③）是否在新手模式可见？**
   - 推荐：保留隐藏，但在 `/settings` 主页加诊断卡 + 跳转按钮。
3. **"任务中心 / 运行记录 / 创作消息"（⑧）三个命名是否在新手模式统一？**
   - 推荐：先统一侧栏显示名（"AI 消息和进度"），再分别处理路由内部名。
4. **创建小说页（⑨）视觉权重是否交换？**
   - 推荐：是，"AI 自动导演开书"占主体，手动表单降级到高级区。
5. **`TASK.md` 编码（④）**：
   - 推荐：先加 README 提示，长期改 `.editorconfig`。

---

## 6. 不在本次走查范围的事项

- 性能、并发、长任务可靠性（属于 `TASK.md` 的 P0 主线，不在本反馈文档范围）
- 后端 agent 编排、prompt schema、状态契约（属于 wiki/architecture 范围）
- 桌面版打包、上架流程（属于 `desktop-plan.md` 范围）

---

## 7. Related Modules

- 客户端路由：`client/src/router/index.tsx`
- 侧栏配置：`client/src/config/navConfig.ts`
- 新手模式 store：`client/src/store/experienceStore.ts`
- 新手偏好 store：`client/src/store/beginnerPreferenceStore.ts`
- 首页：`client/src/pages/Home.tsx`、`client/src/pages/home/components/HomeNextActionPanel.tsx`
- 创建小说页：`client/src/pages/novels/NovelCreate.tsx`
- 自动导演入口：`client/src/pages/novels/autoDirector/AutoDirectorCreatePage.tsx`、`directorCreateStages.ts`
- 模型路由页：`client/src/pages/settings/ModelRoutesPage.tsx`
- 系统设置：`client/src/pages/settings/SettingsPage.tsx`
- 知识库：`client/src/pages/knowledge/KnowledgePage.tsx`
- 帮助页：`client/src/pages/help/HelpPage.tsx`
- 顶栏：`client/src/components/layout/Navbar.tsx`
- 侧栏：`client/src/components/layout/Sidebar.tsx`
- 桌面启动拦截：`client/src/components/layout/DesktopModelSetupGate.tsx`
- 桌面启动壳：`client/src/components/layout/DesktopBootstrapShell.tsx`
- 公开介绍站：`site/`、`site/src/docsManifest.ts`

---

## 8. 相关 wiki

- `docs/wiki/product/beginner-first-novel-completion.md` — 新手优先与整本完成原则
- `docs/wiki/product/beginner-ux-redesign.md` — 双层结构（新手/专业）、L0–L3 风险分级、全局进度条
- `docs/wiki/product/settings-readiness.md` — 设置页"能不能开书"的可用性
- `docs/wiki/product/workspace-status-expression.md` — 工作区状态表达
- `docs/wiki/product/task-center-role.md` — 任务中心角色