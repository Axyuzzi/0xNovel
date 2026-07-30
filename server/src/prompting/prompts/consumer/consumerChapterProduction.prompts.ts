import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  consumerChapterWritingTaskSchema,
  type ConsumerChapterWritingTask,
} from "@0xnovelagent/shared/types/consumerChapterProduction";
import type {
  ConsumerBookSkeleton,
  ConsumerCurrentPhasePlan,
  ConsumerStoryDirection,
  ConsumerVolumePlan,
} from "@0xnovelagent/shared/types/consumerSetup";
import type { PromptAsset } from "../../core/promptTypes";
import {
  buildConsumerProsePolicy,
  CONSUMER_CHAPTER_LENGTH,
} from "./consumerProsePolicy";
import { buildConsumerChapterTitlePolicy } from "./consumerTitlePolicy";

export interface ConsumerChapterProductionPromptInput {
  novelId: string;
  targetChapterId: string;
  novelTitle: string;
  idea: string;
  selectedDirection: ConsumerStoryDirection;
  bookSkeleton: ConsumerBookSkeleton;
  volumePlan: ConsumerVolumePlan;
  currentPhase: ConsumerCurrentPhasePlan;
  sourceChapter: {
    order: number;
    title: string;
    content: string;
  };
  recentChapters: Array<{
    order: number;
    title: string;
    content: string;
  }>;
  task?: ConsumerChapterWritingTask | null;
  existingContent?: string;
}

function asJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function planningMessages(input: ConsumerChapterProductionPromptInput): BaseMessage[] {
  return [
    new SystemMessage(`你是长篇中文小说的章节策划。你要为下一章生成一份内部写作任务，让正文作者能够自然承接上一章并推进当前剧情阶段。

规则：
1. 严格承接已经发生的事实，不重置人物状态，不重复上一章。
2. 只推进当前剧情阶段需要的一小步，不能提前消耗卷末高潮或结局。
3. 必须让本章发生可观察的变化，并在结尾留下自然的继续阅读理由。
4. 任务要具体可写，不使用空泛的“深化人物”“推动剧情”。
5. 只返回符合 Schema 的 JSON，不输出 Markdown、解释或额外字段。`),
    new HumanMessage(`作品：${input.novelTitle}
最初想法：${input.idea}

故事方向：
${asJson(input.selectedDirection)}

全书骨架：
${asJson(input.bookSkeleton)}

全部卷规划：
${asJson(input.volumePlan)}

当前剧情阶段：
${asJson(input.currentPhase)}

最近章节（越靠后越接近当前）：
${asJson(input.recentChapters)}

刚刚确认的章节：
${asJson(input.sourceChapter)}

请为第 ${input.sourceChapter.order + 1} 章生成具体写作任务。

额外硬要求：
1. suggestedWords 必须填写 ${CONSUMER_CHAPTER_LENGTH.target}。
2. openingBeat 必须是正文前 150 字内可以直接写出的动作、对话、感官变化或具体麻烦；startState 与 carryOver 负责说明它承接什么。
3. endingBeat 必须是章末现场中可观察的动作、物件、对话、发现、决定或后果，不能写抽象局势判断。
4. readerInference 写清读者看完 endingBeat 后应该自行得出的结论，但这个结论不得直接进入正文。
5. forbiddenExplanation 写清正文绝对不能直接说破的章末解释，例如“某人是在逼他公开对决、他已经没有退路”。
6. endState 说明章末实际状态；endingHook 说明读者继续阅读的具体问题，不能写主题总结、命运感慨或“留下悬念”这类空话。

${buildConsumerChapterTitlePolicy(input.recentChapters.map((chapter) => chapter.title))}`),
  ];
}

function writingMessages(
  input: ConsumerChapterProductionPromptInput,
  mode: "new" | "continue",
): BaseMessage[] {
  const continuationRule = mode === "continue"
    ? `当前正文因为中断只写了一部分。只输出从断点后继续的新增正文：
1. 不得复述、改写或重新输出已有正文。
2. 第一句要能直接接在已有正文最后一句之后。
3. 补完任务中尚未完成的事件，并形成完整章末。`
    : `从本章开头写到完整章末。只输出正文，不输出标题、摘要、说明、Markdown 或代码块。`;
  return [
    new SystemMessage(`你是成熟的中文长篇小说作者。根据内部写作任务写出可直接交给用户阅读和修改的章节正文。

共同规则：
1. 通过人物行动、对话、场景和具体细节推进，不把策划术语写进正文。
2. 自然承接上一章的情绪、位置、人物关系和未解决问题。
3. 保持人物行为有动机，重要变化有因果，不使用机械总结段收尾。
4. 严格执行下方长度合同，不得自行把“完整性优先”解释为无限扩写或过早收尾。
5. ${continuationRule}

${buildConsumerProsePolicy({
    selectedDirection: input.selectedDirection,
    task: input.task,
    existingContent: mode === "continue" ? input.existingContent : "",
  })}`),
    new HumanMessage(`作品：${input.novelTitle}

上一章：
${input.sourceChapter.title}
${input.sourceChapter.content}

本章写作任务：
${asJson(input.task)}

${mode === "continue" ? `本章已有正文（只用于确定续写断点，禁止重复输出）：\n${input.existingContent}` : ""}`),
  ];
}

function validateChapterText(output: string): string {
  const content = output.trim();
  if (content.length < 200) {
    throw new Error("章节正文过短，无法作为可用结果保存。");
  }
  return content;
}

export const consumerNextChapterTaskPrompt: PromptAsset<
  ConsumerChapterProductionPromptInput,
  typeof consumerChapterWritingTaskSchema._output
> = {
  id: "consumer.chapter.task",
  version: "v4",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: consumerChapterWritingTaskSchema,
  render: planningMessages,
};

export const consumerChapterWritePrompt: PromptAsset<
  ConsumerChapterProductionPromptInput,
  string,
  string
> = {
  id: "consumer.chapter.write",
  version: "v3",
  taskType: "writer",
  mode: "text",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  render: (input) => writingMessages(input, "new"),
  postValidate: validateChapterText,
};

export const consumerChapterContinuePrompt: PromptAsset<
  ConsumerChapterProductionPromptInput,
  string,
  string
> = {
  id: "consumer.chapter.continue",
  version: "v3",
  taskType: "writer",
  mode: "text",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  render: (input) => writingMessages(input, "continue"),
  postValidate: validateChapterText,
};
