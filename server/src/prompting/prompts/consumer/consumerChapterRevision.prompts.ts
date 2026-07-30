import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type {
  ConsumerChapterRevisionMode,
  ConsumerChapterRevisionPreset,
} from "@0xnovelagent/shared/types/consumerChapterRevision";
import {
  parseConsumerChapterWritingTask,
  type ConsumerChapterWritingTask,
} from "@0xnovelagent/shared/types/consumerChapterProduction";
import type {
  ConsumerBookSkeleton,
  ConsumerCurrentPhasePlan,
  ConsumerStoryDirection,
  ConsumerVolumePlan,
} from "@0xnovelagent/shared/types/consumerSetup";
import { countConsumerChapterCharacters } from "@0xnovelagent/shared/types/consumerWorkspace";
import type { PromptAsset } from "../../core/promptTypes";
import { buildConsumerProsePolicy } from "./consumerProsePolicy";

export interface ConsumerChapterRevisionPromptInput {
  novelId: string;
  chapterId: string;
  novelTitle: string;
  idea: string;
  selectedDirection: ConsumerStoryDirection;
  bookSkeleton: ConsumerBookSkeleton;
  volumePlan: ConsumerVolumePlan;
  currentPhase: ConsumerCurrentPhasePlan;
  chapter: {
    order: number;
    title: string;
    content: string;
    taskSheet: string | null;
  };
  previousChapters: Array<{
    order: number;
    title: string;
    content: string;
  }>;
  mode: ConsumerChapterRevisionMode;
  preset: ConsumerChapterRevisionPreset;
  instruction: string;
}

function asJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function chapterTask(input: ConsumerChapterRevisionPromptInput): ConsumerChapterWritingTask | null {
  if (!input.chapter.taskSheet?.trim()) return null;
  try {
    return parseConsumerChapterWritingTask(JSON.parse(input.chapter.taskSheet));
  } catch {
    return null;
  }
}

function currentVolumeContext(input: ConsumerChapterRevisionPromptInput): object | null {
  const volumes = [...input.volumePlan.volumes].sort((left, right) => left.order - right.order);
  let chapterStart = 1;
  let fallback: object | null = null;
  for (const volume of volumes) {
    const chapterEnd = chapterStart + volume.estimatedChapters - 1;
    const projected = {
      ...volume,
      estimatedChapterRange: `${chapterStart}-${chapterEnd}`,
    };
    fallback = projected;
    if (input.chapter.order >= chapterStart && input.chapter.order <= chapterEnd) {
      return projected;
    }
    chapterStart = chapterEnd + 1;
  }
  return fallback;
}

function recentChapterContext(input: ConsumerChapterRevisionPromptInput): object[] {
  return input.previousChapters.map((chapter) => ({
    order: chapter.order,
    title: chapter.title,
    endingExcerpt: chapter.content.trim().slice(-1_600),
  }));
}

function commonContext(input: ConsumerChapterRevisionPromptInput): string {
  const task = chapterTask(input);
  return `【作品定位】
作品：${input.novelTitle}
最初想法：${input.idea}

故事方向与持续阅读合同：
${asJson({
    title: input.selectedDirection.title,
    premise: input.selectedDirection.premise,
    protagonist: input.selectedDirection.protagonist,
    centralConflict: input.selectedDirection.centralConflict,
    tone: input.selectedDirection.tone,
    coreAdvantage: input.selectedDirection.coreAdvantage,
    advantageLimit: input.selectedDirection.advantageLimit,
    payoffPattern: input.selectedDirection.payoffPattern,
    progressionPath: input.selectedDirection.progressionPath,
  })}

全书核心主线：
${asJson({
    corePromise: input.bookSkeleton.corePromise,
    protagonistArc: input.bookSkeleton.protagonistArc,
  })}

【当前进度，只允许用于保持本章一致】
当前卷规划：
${asJson(currentVolumeContext(input))}

当前剧情阶段：
${asJson(input.currentPhase)}

最近章节的章末承接片段：
${asJson(recentChapterContext(input))}

本章写作任务：
${asJson(task ?? input.chapter.taskSheet ?? "没有单独保存的写作任务，以现有正文和当前剧情阶段为准。")}

【需要处理的完整正文】
${input.chapter.content}

【用户本次要求】
${input.instruction}

只修改当前章。不得从规划中提前取用尚未发生的人物、秘密、转折、关系结果或后续高潮。`;
}

function revisionMessages(input: ConsumerChapterRevisionPromptInput): BaseMessage[] {
  return [
    new SystemMessage(`你是擅长长篇连载微调的中文小说编辑。根据用户要求精准修改当前完整章节。

规则：
1. 直接输出修改后的完整章节正文，不输出标题、摘要、修改说明、Markdown 标题、差异标记或代码围栏；必须保留自然段落换行。
2. 在不违反已确认事实、人物连续性和本章任务的前提下，用户本次要求是修改重点；必须让要求产生可读的实质变化。
3. 尽量保留用户没有要求改变的段落、事件顺序、人物关系、因果、视角、时间线和章末承接，不得把精准修改扩大成整章另写。
4. 强化情绪、冲突或节奏时，通过人物选择、动作、对话、停顿、信息差和现场反馈实现，不用旁白宣布“情绪更强”或机械添加反应。
5. 只在本章任务确实包含相应回报时强化“${input.selectedDirection.payoffPattern}”；不得擅自添加打脸、奖励、反转或新设定。
6. 严禁提前泄露当前卷后续、远期卷、结局或人物隐藏答案，不得把规划中的未来事实写成本章已经发生。
7. 不把策划、Prompt、模型、编辑过程或“本章目标”等元数据写进正文。
8. 正文必须能够直接替换原章；不要只输出局部片段。

${buildConsumerProsePolicy({
    selectedDirection: input.selectedDirection,
    task: chapterTask(input),
    replacementContent: input.chapter.content,
  })}`),
    new HumanMessage(commonContext(input)),
  ];
}

function rewriteMessages(input: ConsumerChapterRevisionPromptInput): BaseMessage[] {
  return [
    new SystemMessage(`你是擅长挽救失焦初稿的中文长篇小说作者。根据本章任务和用户要求，重新组织并写出一整章可直接阅读的正文。

规则：
1. 直接输出重写后的完整章节正文，不输出标题、摘要、说明、Markdown 标题、差异标记或代码围栏；必须保留自然段落换行。
2. 保留本章在全书中的功能、必须发生的核心事件、人物初始状态、章末状态和前文已确认事实。
3. 可以重组场景、行动、对话、信息顺序和节奏，但不能重新规划故事、改变人物动机基础或提前消耗后续高潮。
4. 围绕本章任务重建压力、行动、阻力、变化和结果；如果本章承担已经确认的持续回报“${input.selectedDirection.payoffPattern}”，应把兑现过程写充分，但不得强加打脸、奖励或反转。
5. 章末必须执行任务规定的现场变化和承接；没有任务时停在具体动作、发现、决定、后果或未获回答的互动上，不强制每章都卡在冲突爆发前。
6. 严禁提前泄露当前卷后续、远期卷、结局或人物隐藏答案，不得把规划中的未来事实写成本章已经发生。
7. 不把策划、Prompt、模型、写作任务或“爽点”等元数据写进正文。

${buildConsumerProsePolicy({
    selectedDirection: input.selectedDirection,
    task: chapterTask(input),
    replacementContent: input.chapter.content,
  })}`),
    new HumanMessage(commonContext(input)),
  ];
}

function validateCandidate(output: string, input: ConsumerChapterRevisionPromptInput): string {
  const trimmed = output.trim();
  const fenced = /^```(?:markdown|md|text|plaintext)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/iu.exec(trimmed);
  const content = (fenced?.[1] ?? trimmed).trim();
  const characterCount = countConsumerChapterCharacters(content);
  if (characterCount < 500) {
    throw new Error(`修改稿只有约 ${characterCount} 字，疑似输出中断，无法作为完整章节候选保存。`);
  }
  if (content === input.chapter.content.trim()) {
    throw new Error("修改稿与当前正文没有实质差异。");
  }
  return content;
}

export const consumerChapterRevisePrompt: PromptAsset<
  ConsumerChapterRevisionPromptInput,
  string,
  string
> = {
  id: "consumer.chapter.revise",
  version: "v4",
  taskType: "writer",
  mode: "text",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  render: revisionMessages,
  postValidate: validateCandidate,
};

export const consumerChapterRewritePrompt: PromptAsset<
  ConsumerChapterRevisionPromptInput,
  string,
  string
> = {
  id: "consumer.chapter.rewrite",
  version: "v4",
  taskType: "writer",
  mode: "text",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  render: rewriteMessages,
  postValidate: validateCandidate,
};
