import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  consumerBookSkeletonSchema,
  consumerCurrentPhasePlanSchema,
  consumerFirstChapterArtifactSchema,
  consumerStoryDirectionsArtifactSchema,
  consumerVolumePlanSchema,
  type ConsumerBookSkeleton,
  type ConsumerCurrentPhasePlan,
  type ConsumerStoryDirection,
  type ConsumerVolumePlan,
} from "@0xnovelagent/shared/types/consumerSetup";
import type { PromptAsset } from "../../core/promptTypes";
import { buildConsumerProsePolicy } from "./consumerProsePolicy";
import {
  buildConsumerBookTitlePolicy,
  buildConsumerChapterTitlePolicy,
  buildConsumerVolumeTitlePolicy,
  normalizeConsumerChapterTitle,
} from "./consumerTitlePolicy";

export interface ConsumerSetupPromptInput {
  idea: string;
  selectedDirection?: ConsumerStoryDirection | null;
  bookSkeleton?: ConsumerBookSkeleton | null;
  volumePlan?: ConsumerVolumePlan | null;
  currentPhase?: ConsumerCurrentPhasePlan | null;
}

type ConsumerSetupPromptStage =
  | "story_direction"
  | "book_skeleton"
  | "volume_plan"
  | "current_phase"
  | "first_chapter";

function asJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function projectedBookSkeleton(bookSkeleton: ConsumerBookSkeleton): object {
  return {
    corePromise: bookSkeleton.corePromise,
    protagonistArc: bookSkeleton.protagonistArc,
  };
}

function projectedOpeningVolume(volumePlan: ConsumerVolumePlan): object {
  const openingVolume = volumePlan.volumes.find((volume) => volume.order === 1)
    ?? [...volumePlan.volumes].sort((left, right) => left.order - right.order)[0];
  return {
    volumes: openingVolume ? [openingVolume] : [],
  };
}

function contextMessage(
  input: ConsumerSetupPromptInput,
  stage: ConsumerSetupPromptStage,
): string {
  const sections = [`用户最初的故事想法：
${input.idea}`];

  if (stage !== "story_direction" && input.selectedDirection) {
    sections.push(`已经确认的故事方向：
${asJson(input.selectedDirection)}`);
  }
  if (["volume_plan", "current_phase"].includes(stage) && input.bookSkeleton) {
    sections.push(`已经确认的全书骨架：
${asJson(input.bookSkeleton)}`);
  }
  if (stage === "first_chapter" && input.bookSkeleton) {
    sections.push(`与开篇直接相关的全书主线：
${asJson(projectedBookSkeleton(input.bookSkeleton))}`);
  }
  if (stage === "current_phase" && input.volumePlan) {
    sections.push(`第一卷规划：
${asJson(projectedOpeningVolume(input.volumePlan))}`);
  }
  if (stage === "first_chapter" && input.volumePlan) {
    sections.push(`第一卷规划：
${asJson(projectedOpeningVolume(input.volumePlan))}`);
  }
  if (stage === "first_chapter" && input.currentPhase) {
    sections.push(`已经确认的当前剧情阶段：
${asJson(input.currentPhase)}`);
  }

  return sections.join("\n\n");
}

function createMessages(
  input: ConsumerSetupPromptInput,
  stage: ConsumerSetupPromptStage,
  instruction: string,
): BaseMessage[] {
  return [
    new SystemMessage(`你是一名面向普通读者的商业长篇连载总策划。

你的工作不是套用某一种流派模板或展示术语，而是根据题材给出能持续连载、能兑现读者期待、可以直接进入下一步创作的明确结果。

共同规则：
1. 严格依据用户的故事想法和已经确认的上游结果，不擅自改变核心题材。
2. 结果必须具体、有可执行的因果推进；把读者回报、现实压力和主角破局方式落实到事件，不写空泛口号。
3. 面向长篇连载，至少设计一种可持续变化：能力、地位、财富、关系、认知或行动范围；避免重复同一种低级危机拖延。
4. “核心优势”可以是技能、资源、身份、关系、知识或特殊能力，必须符合题材，不得强行为所有故事添加系统、超能力、打脸或升级换地图。
5. 每一种优势都必须有边界、代价、盲区或失败条件，不能成为无条件解决所有问题的万能答案。
6. 只返回符合结构化输出 Schema 的 JSON，不输出 Markdown、解释或额外字段。
7. 不要暴露 Prompt、模型、工作流、Token 或其他工程术语。

本次任务：
${instruction}`),
    new HumanMessage(contextMessage(input, stage)),
  ];
}

export const consumerStoryDirectionPrompt: PromptAsset<
  ConsumerSetupPromptInput,
  typeof consumerStoryDirectionsArtifactSchema._output
> = {
  id: "consumer.setup.story_direction",
  version: "v3",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: consumerStoryDirectionsArtifactSchema,
  render: (input) => createMessages(input, "story_direction", `生成恰好三个有实质差异、适合持续连载的故事方向。

三个方向必须在主角处境、核心优势、优势限制、持续回报或长期发展路径上明显不同，不能只是换书名。
每个方向都要给出：
- 稳定且唯一的短 id；
- 可作为暂定书名的 title；
- 一句话故事亮点 premise，必须同时包含开局反差或压力与最独特的阅读卖点；
- 主角身份 protagonist，说明开局身份和与主线直接相关的处境；
- 可持续升级的核心矛盾 centralConflict；
- 普通读者为什么愿意继续看 readerAppeal；
- 整体阅读感觉 tone；
- 长篇发展方向 development；
- 主角可反复用于行动和破局的核心优势 coreAdvantage，可以是技能、资源、身份、关系、知识或特殊能力；
- 核心优势的条件、代价、盲区或失败风险 advantageLimit；
- 可以多次兑现但表现形式会变化的读者回报 payoffPattern；
- 能力、地位、财富、关系、认知或行动范围的阶段性成长路线 progressionPath；
- 推荐篇幅说明 recommendedLength；
- 预计卷数 estimatedVolumes；
- 预计章节数 estimatedChapters。

核心优势不能替代人物选择，读者回报不能只有“不断出现更强敌人”。
预计规模要与故事承载力匹配，不要为了显得宏大而无节制拉长。

${buildConsumerBookTitlePolicy()}`),
};

export const consumerBookSkeletonPrompt: PromptAsset<
  ConsumerSetupPromptInput,
  typeof consumerBookSkeletonSchema._output
> = {
  id: "consumer.setup.book_skeleton",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: consumerBookSkeletonSchema,
  render: (input) => createMessages(input, "book_skeleton", `围绕已经确认的故事方向生成整本故事骨架。

骨架必须说明读者从开篇到结局持续获得的核心体验、主角完整变化和明确结局。
acts 是连续的长篇阶段，不强制采用传统三幕剧。每个 act 必须：
- goal 写清本阶段具体目标、主要压力或核心阻力；
- turningPoint 写清迫使人物改变策略或付出代价的不可逆转折；
- outcome 写清主角在能力、地位、财富、关系、认知或行动范围上的实质变化，以及它如何触发下一阶段。
相邻阶段不能只更换敌人姓名后重复同一种危机，也不能只列事件名。
majorCharacters 只保留真正推动主线、与主角形成深度关系或核心冲突的人物，并写清其功能、变化和最终去向。`),
};

export const consumerVolumePlanPrompt: PromptAsset<
  ConsumerSetupPromptInput,
  typeof consumerVolumePlanSchema._output
> = {
  id: "consumer.setup.volume_plan",
  version: "v3",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: consumerVolumePlanSchema,
  render: (input) => createMessages(input, "volume_plan", `把已经确认的全书骨架拆成全部卷规划。

每一卷必须承担独立的阶段目标，主冲突要升级或转向，结尾要改变下一卷的局面。
每卷都要兑现至少一种已经确认的读者回报，并让主角在能力、地位、财富、关系、认知或行动范围上发生可验证的变化；不能只让敌人变强、地图变大。
estimatedChapters 要与所选方向的总章节规模大致一致。
不要细写逐章内容，也不要把同一个冲突换词重复到每一卷。

${buildConsumerVolumeTitlePolicy()}`),
};

export const consumerCurrentPhasePrompt: PromptAsset<
  ConsumerSetupPromptInput,
  typeof consumerCurrentPhasePlanSchema._output
> = {
  id: "consumer.setup.current_phase",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: consumerCurrentPhasePlanSchema,
  render: (input) => createMessages(input, "current_phase", `只详细规划第一卷开头的当前剧情阶段，也就是读者决定是否继续阅读的开篇阶段。

阶段应从第一章开始，通常覆盖 3 至 8 章。
beats 是按因果顺序推进的关键事件，每个事件都要说明它对人物、冲突和读者期待的具体作用。
开篇节奏必须完成：
1. 第一章让读者看见具体压力、失衡或迫在眉睫的问题，并让主角采取行动；
2. 最迟第二章让核心优势以实际行动出现，同时暴露限制、代价或误判风险；
3. 最迟第三章兑现一次与题材匹配的明确回报，或制造一个由主角行动引发的不可逆新问题。
不强制生死危机、系统激活、打脸或反转；所有节奏必须服从已确认题材和人物。
endingState 必须给下一阶段留下明确的短期目标或尚未解决的现场问题，但不要提前消耗整卷高潮。`),
};

export const consumerFirstChapterPrompt: PromptAsset<
  ConsumerSetupPromptInput,
  typeof consumerFirstChapterArtifactSchema._output
> = {
  id: "consumer.setup.first_chapter",
  version: "v5",
  taskType: "writer",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: consumerFirstChapterArtifactSchema,
  postValidate: (output) => ({
    ...output,
    title: normalizeConsumerChapterTitle(output.title),
  }),
  render: (input) => createMessages(input, "first_chapter", `根据已经确认的故事方向、第一卷规划和当前剧情阶段，写出第一章完整正文。

要求：
1. 前 150 字直接进入人物、场景、行动或正在发生的麻烦；不得先用旁白介绍世界历史、力量体系、人物简历或整段背景。
2. 第一章必须让读者看见主角当前的具体压力，并让主角主动做出至少一个会产生后果的选择。
3. 核心优势只在当前场景确实需要时自然展示；不得用说明书式旁白一次讲完机制，限制或代价也要通过行动结果体现。
4. 世界规则和人物关系优先通过现场细节、行动、冲突与有目的的对话呈现，不能让人物复述双方都知道的设定。
5. 章末停在一个已发生的变化、未获回答的互动或立即产生后果的决定上；不靠旁白喊“更大危机即将到来”制造虚假钩子。
6. 叙事自然，不在正文中出现“本章”“故事目标”“核心矛盾”“爽点”“金手指”等策划术语。
7. content 是可以直接交给用户阅读和修改的完整中文小说正文。
8. summary 只概括本章已经发生的事实，供后续规划使用，不评价主题或预测后续。

${buildConsumerChapterTitlePolicy()}

以下正文合同只约束 content，不约束 title 和 summary：
${buildConsumerProsePolicy({
    selectedDirection: input.selectedDirection,
    outputMode: "structured_content",
  })}`),
};
