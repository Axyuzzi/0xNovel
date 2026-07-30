import type { ConsumerChapterWritingTask } from "@0xnovelagent/shared/types/consumerChapterProduction";
import { countConsumerChapterCharacters } from "@0xnovelagent/shared/types/consumerWorkspace";
import type { ConsumerStoryDirection } from "@0xnovelagent/shared/types/consumerSetup";
import { normalizeConsumerChapterTitle } from "./consumerTitlePolicy";

export const CONSUMER_CHAPTER_LENGTH = {
  target: 2_600,
  minimum: 2_200,
  maximum: 3_200,
} as const;

export interface ConsumerProsePolicyInput {
  selectedDirection?: ConsumerStoryDirection | null;
  task?: ConsumerChapterWritingTask | null;
  existingContent?: string;
  replacementContent?: string;
  outputMode?: "text_only" | "structured_content";
}

export interface ConsumerChapterLengthSnapshot {
  characterCount: number;
  targetCharacters: number;
  minimumCharacters: number;
  maximumCharacters: number;
}

export interface ConsumerProseQualityWarning {
  code:
    | "length_out_of_range"
    | "formulaic_phrasing"
    | "summary_ending"
    | "explanatory_ending";
  message: string;
}

const FORMULAIC_PHRASES = [
  "宛如",
  "交织",
  "画卷",
  "不禁",
  "深吸一口气",
  "嘴角勾起",
  "嘴角扬起",
  "脸色铁青",
  "若有所思",
  "被拖下水",
  "没有退路",
  "难以言喻",
  "百感交集",
  "内心深处",
  "倒吸一口凉气",
];

const SUMMARY_ENDING_PATTERNS = [
  /(?:他|她|他们|她们)终于明白/u,
  /这一刻.{0,12}(?:明白|懂得|意识到)/u,
  /命运的齿轮/u,
  /新的篇章/u,
  /故事才刚刚开始/u,
  /未来.{0,12}(?:注定|充满)/u,
  /在这个.{0,18}(?:世界|时代|夜晚)里/u,
];

const EXPLANATORY_ENDING_PATTERNS = [
  /这是在.{2,60}/u,
  /这意味着.{2,60}/u,
  /(?:显然|无疑)[，,：:]?.{2,60}/u,
  /已经没有(?:退路|选择|余地)/u,
  /——.{0,80}(?:这是|意味着|已经|显然|无疑)/u,
];

function withoutQuotedDialogue(content: string): string {
  return content
    .replace(/“[^”]*”/gu, "")
    .replace(/"[^"]*"/gu, "");
}

export function normalizeConsumerChapterTask(
  task: ConsumerChapterWritingTask,
): ConsumerChapterWritingTask {
  return {
    ...task,
    title: normalizeConsumerChapterTitle(task.title),
    suggestedWords: CONSUMER_CHAPTER_LENGTH.target,
  };
}

export function measureConsumerChapter(
  content: string,
): ConsumerChapterLengthSnapshot {
  return {
    characterCount: countConsumerChapterCharacters(content),
    targetCharacters: CONSUMER_CHAPTER_LENGTH.target,
    minimumCharacters: CONSUMER_CHAPTER_LENGTH.minimum,
    maximumCharacters: CONSUMER_CHAPTER_LENGTH.maximum,
  };
}

function lengthInstruction(existingContent = "", replacementContent = ""): string {
  const replacementCharacters = countConsumerChapterCharacters(replacementContent);
  if (replacementCharacters > 0) {
    return `原章约 ${replacementCharacters} 字。修改后的完整章节仍以 ${CONSUMER_CHAPTER_LENGTH.target} 字为基准，并落在 ${CONSUMER_CHAPTER_LENGTH.minimum}—${CONSUMER_CHAPTER_LENGTH.maximum} 字；不要因润色大幅删短，也不要靠新设定、重复描写或总结扩写。`;
  }
  const existingCharacters = countConsumerChapterCharacters(existingContent);
  if (existingCharacters <= 0) {
    return `正文目标为 ${CONSUMER_CHAPTER_LENGTH.target} 个中文非空白字符，可接受范围为 ${CONSUMER_CHAPTER_LENGTH.minimum}—${CONSUMER_CHAPTER_LENGTH.maximum} 字。不得用重复描写、同义改写或总结凑字数，也不要因为赶结尾明显少写。`;
  }
  const remainingTarget = Math.max(
    300,
    CONSUMER_CHAPTER_LENGTH.target - existingCharacters,
  );
  const remainingMinimum = Math.max(
    150,
    CONSUMER_CHAPTER_LENGTH.minimum - existingCharacters,
  );
  return `已有正文约 ${existingCharacters} 字。本次只续写新增部分，建议新增约 ${remainingTarget} 字，至少补足约 ${remainingMinimum} 字，使合并后的整章尽量落在 ${CONSUMER_CHAPTER_LENGTH.minimum}—${CONSUMER_CHAPTER_LENGTH.maximum} 字。不得重复已有正文或靠总结凑字数。`;
}

export function buildConsumerProsePolicy(
  input: ConsumerProsePolicyInput,
): string {
  const tone = input.selectedDirection?.tone?.trim() || "以作品已经确认的阅读感觉为准";
  const viewpoint = input.selectedDirection?.protagonist?.trim() || "本章当前视角人物";
  const openingResponsibility = input.task
    ? `开头必须从“${input.task.startState}”继续，并在前 150 字内执行可见开场“${input.task.openingBeat}”，用正在发生的动作、对话、感官变化或具体麻烦接住“${input.task.carryOver}”。`
    : "开头前 150 字内必须出现人物、正在发生的动作或具体麻烦；不要先写天气全景、世界观讲解、人物简历或抽象感慨。";
  const endingResponsibility = input.task
    ? `结尾必须让局面实际到达“${input.task.endState}”，并执行可见章末画面“${input.task.endingBeat}”。读者应该自行推断“${input.task.readerInference}”，正文禁止直接解释这个结论；尤其不得出现“${input.task.forbiddenExplanation}”所描述的写法。章末钩子“${input.task.endingHook}”只能通过现场证据形成。`
    : "结尾停在一个具体动作、发现、决定、后果或尚未回答的互动上，给下一章留下可承接的现场状态。";
  const outputRule = input.outputMode === "structured_content"
    ? "输出前在内部快速复读一遍 content，删掉说明文语气、同义反复、空泛抒情、套路反应和强行升华；仍须按当前任务的结构化 Schema 返回 title、content 与 summary。"
    : "输出前在内部快速复读一遍，删掉说明文语气、同义反复、空泛抒情、套路反应和强行升华。最终只输出用户可直接阅读的小说正文。";

  return `【正文长度合同】
${lengthInstruction(input.existingContent, input.replacementContent)}

【本书表达基准】
- 整体阅读感觉：${tone}。
- 默认贴近“${viewpoint}”的有限视角。只写视角人物能感知、判断或合理推断的内容，不擅自解释其他人物内心。
- ${openingResponsibility}
- ${endingResponsibility}

【去模板化行文规则】
1. 用人物选择、动作、对话、注意力变化和现场反馈推进事件。可以有简短心理活动，但不要连续替读者解释人物“为什么这样想”。
2. 对话必须符合身份、关系和当下目的；允许停顿、回避、误解、隐瞒和言外之意，禁止借人物长篇讲解设定或复述双方都知道的信息。
3. 句子长短应随场面自然变化。禁止整章都用短句、整齐排比、同构段落或连续华丽比喻；也禁止堆叠形容词和副词。
4. “宛如、仿佛、交织、画卷、不禁、深吸一口气、嘴角勾起、倒吸一口凉气、难以言喻、百感交集”等是高风险套话，不是一律禁词；只有无法被更准确的动作或细节替代时才可偶尔使用，整章不得反复出现。
5. 情绪优先通过人物做了什么、没做什么、说话方式、视线落点和选择后果呈现；不要机械轮换“攥拳、咬唇、瞳孔一缩、心头一震”等生理反应。
6. 段落长短按阅读节奏自然变化，不强制每段相同句数。关键场面要落到可见、可听、可触的细节，但不要为“展示”而堆满无关感官。
7. 禁止在段末或章末总结主题、拔高意义、预告命运，禁止用“他终于明白……”“新的篇章……”“故事才刚刚开始……”一类句子收尾。
8. ${outputRule}

【章末硬规则】
1. 最后 150—300 字必须留在正在发生的场景中，只能落在人物动作、未获回答的对话、新出现的物件或人物、已经发生的现场变化，或者立即产生后果的决定上。
2. 禁止由旁白解释人物真实意图、阵营关系、局势意义或下一步命运；禁止用“这是在……”“这意味着……”“显然……”“无疑……”“已经没有退路”等结论句收尾。
3. 如果任务提供 readerInference，只能通过 endingBeat 的动作、对话和现场证据让读者自行得出该结论，禁止复述、改写或同义转述 readerInference。
4. 章末出现有效动作、物件、声音或对话后立即停笔，不要再补一句解释其意义。
5. 破折号或冒号后不得接作者对人物意图和局势的总结说明。

【输出前静默检查】
完成正文后，只在内部检查最后 300 字，不输出检查过程：
1. 找出所有直接解释“某人在想什么、某人的真实意图是什么、当前局势意味着什么”的旁白句。
2. 如果删掉该句后，读者仍能从动作、对话和现场变化中理解局势，就删除该句。
3. 如果最后一句是抽象判断、情绪标签、主题总结或命运预告，就改为最近一个具体动作、物件、声音或未完成对话。
4. 如果已经有一个有效画面，后面又补了解释句，停在前一个画面。`;
}

export function inspectConsumerProse(
  content: string,
): {
  length: ConsumerChapterLengthSnapshot;
  warnings: ConsumerProseQualityWarning[];
} {
  const length = measureConsumerChapter(content);
  const warnings: ConsumerProseQualityWarning[] = [];

  if (
    length.characterCount < length.minimumCharacters
    || length.characterCount > length.maximumCharacters
  ) {
    warnings.push({
      code: "length_out_of_range",
      message: `本章约 ${length.characterCount} 字，建议范围是 ${length.minimumCharacters}—${length.maximumCharacters} 字。`,
    });
  }

  const formulaicHits = FORMULAIC_PHRASES.reduce(
    (total, phrase) => total + content.split(phrase).length - 1,
    0,
  );
  if (formulaicHits >= 3) {
    warnings.push({
      code: "formulaic_phrasing",
      message: "本章出现了较多模板化表达，建议阅读时重点留意重复比喻和固定反应。",
    });
  }

  const ending = withoutQuotedDialogue(content.trim().slice(-300));
  if (EXPLANATORY_ENDING_PATTERNS.some((pattern) => pattern.test(ending))) {
    warnings.push({
      code: "explanatory_ending",
      message: "章末可能正在替读者解释人物意图或局势，建议停在前一个具体动作、物件或对话上。",
    });
  } else if (SUMMARY_ENDING_PATTERNS.some((pattern) => pattern.test(ending))) {
    warnings.push({
      code: "summary_ending",
      message: "章末可能存在总结或强行升华，建议改成具体动作、发现或未完成的互动。",
    });
  }

  return { length, warnings };
}
