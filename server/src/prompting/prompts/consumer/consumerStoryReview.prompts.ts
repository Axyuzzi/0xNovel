import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  consumerStoryReviewArtifactSchema,
  type ConsumerStoryCheckpointKind,
  type ConsumerStoryReviewArtifact,
  type ConsumerStoryReviewOperationKind,
} from "@0xnovelagent/shared/types/consumerStoryReview";
import type {
  ConsumerBookSkeleton,
  ConsumerCurrentPhasePlan,
  ConsumerStoryDirection,
  ConsumerVolumePlan,
} from "@0xnovelagent/shared/types/consumerSetup";
import type { PromptAsset } from "../../core/promptTypes";

export interface ConsumerStoryReviewPromptInput {
  novelId: string;
  novelTitle: string;
  idea: string;
  selectedDirection: ConsumerStoryDirection;
  bookSkeleton: ConsumerBookSkeleton;
  volumePlan: ConsumerVolumePlan;
  currentPhase: ConsumerCurrentPhasePlan;
  chapters: Array<{
    order: number;
    title: string;
    content: string;
  }>;
  kind: ConsumerStoryReviewOperationKind;
  checkpointKind: ConsumerStoryCheckpointKind | null;
  instruction: string;
  nextChapterOrder: number;
}

function asJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function directionContext(direction: ConsumerStoryDirection): object {
  return {
    title: direction.title,
    premise: direction.premise,
    protagonist: direction.protagonist,
    centralConflict: direction.centralConflict,
    readerAppeal: direction.readerAppeal,
    tone: direction.tone,
    coreAdvantage: direction.coreAdvantage,
    advantageLimit: direction.advantageLimit,
    payoffPattern: direction.payoffPattern,
    progressionPath: direction.progressionPath,
  };
}

function skeletonCore(skeleton: ConsumerBookSkeleton): object {
  return {
    corePromise: skeleton.corePromise,
    protagonistArc: skeleton.protagonistArc,
    ending: skeleton.ending,
  };
}

function volumeWindow(input: ConsumerStoryReviewPromptInput): object {
  const ordered = [...input.volumePlan.volumes].sort(
    (left, right) => left.order - right.order,
  );
  let chapterStart = 1;
  const ranges = ordered.map((volume) => {
    const range = {
      volume,
      chapterStart,
      chapterEnd: chapterStart + volume.estimatedChapters - 1,
    };
    chapterStart = range.chapterEnd + 1;
    return range;
  });
  const matchedIndex = ranges.findIndex((item) => (
    input.nextChapterOrder >= item.chapterStart
    && input.nextChapterOrder <= item.chapterEnd
  ));
  const targetIndex = matchedIndex >= 0
    ? matchedIndex
    : Math.max(0, ranges.length - 1);
  return {
    bookScale: {
      volumeCount: ordered.length,
      estimatedChapters: ordered.reduce(
        (total, volume) => total + volume.estimatedChapters,
        0,
      ),
    },
    relevantVolumes: ranges
      .slice(Math.max(0, targetIndex - 1), targetIndex + 2)
      .map(({ volume, chapterStart: start, chapterEnd: end }) => ({
        ...volume,
        estimatedChapterRange: `${start}-${end}`,
      })),
  };
}

function excerpt(content: string, head: number, tail: number): string {
  const normalized = content.trim();
  if (normalized.length <= head + tail) return normalized;
  return `${normalized.slice(0, head)}\n……（中段已压缩）……\n${normalized.slice(-tail)}`;
}

function lockedChapterContext(input: ConsumerStoryReviewPromptInput): object {
  const ordered = [...input.chapters].sort((left, right) => left.order - right.order);
  const recent = ordered.slice(-2);
  if (input.kind === "transition" || input.kind === "adjustment") {
    return {
      lockedChapterIndex: ordered.map(({ order, title }) => ({ order, title })),
      recentHighResolutionEvidence: recent.map(({ order, title, content }) => ({
        order,
        title,
        endingExcerpt: content.trim().slice(-3_200),
      })),
    };
  }
  return {
    lockedChapterEvidence: ordered.map(({ order, title, content }) => ({
      order,
      title,
      boundaryEvidence: excerpt(content, 500, 1_200),
    })),
    recentHighResolutionEvidence: recent.map(({ order, title, content }) => ({
      order,
      title,
      endingExcerpt: content.trim().slice(-3_200),
    })),
    evidenceNotice:
      "以上是阶段内章节的边界证据与最近两章高清尾段，不是完整正文。只能报告证据中可定位的问题；不能因片段未出现某信息就断言正文缺失。",
  };
}

function taskInstruction(input: ConsumerStoryReviewPromptInput): string {
  if (input.kind === "transition") {
    return `用户选择跳过深度检查。不要对已完成章节做质量评判。
只根据已完成事实、当前卷目标和未兑现的读者期待，生成从第 ${input.nextChapterOrder} 章开始、通常覆盖 3～8 章的下一段详细剧情推进计划。
每个 beat 都要写清“谁采取什么行动—遇到什么具体阻力—造成什么新结果”，不得只写“冲突升级”“真相浮现”“危机逼近”等抽象占位语。`;
  }
  if (input.kind === "review") {
    return `检查本次已完成的${input.checkpointKind === "volume" ? "整卷" : "剧情阶段"}。
按顺序核对：
1. 已发生事件、人物选择、世界规则和因果是否互相冲突；
2. 核心优势是否遵守限制和代价，读者回报是否有兑现而非只做预告；
3. 多章是否重复同类场景、同类阻力或同一种解决方式；
4. 人物转变是否有可见行动支撑，章末是否停在具体后果或未回答互动，而非旁白总结；
5. 下一阶段是否能自然承接已完成状态。

只报告证据中能定位、确实影响阅读或后续创作的问题。没有实质问题时明确说可以继续，不要为了显得专业而凑问题。
推荐方案优先在下一阶段补强，已完成正文保持锁定。
无论是否发现问题，都必须生成从第 ${input.nextChapterOrder} 章开始、通常覆盖 3～8 章的下一段详细推进计划。`;
  }
  return `用户希望调整接下来的剧情：
${input.instruction}

按以下级联顺序判断最小未来影响范围：
1. low：只修改覆盖下一章的当前剧情阶段，卷规划和全书骨架必须保持 null；
2. medium：当前阶段无法容纳时才修改完整卷规划，全书骨架必须保持 null；
3. high：只有用户明确改变核心前提、全书阅读承诺或结局时，才允许修改全书骨架。

已完成章节是不可撤销的事实。不得通过“角色突然改变主意”“原来一切都是误会/梦境”等方式抹除既成结果。
调整后的每个 beat 都必须落到人物行动、具体阻力和可观察后果，不得用抽象策划术语代替剧情。`;
}

function systemInstruction(input: ConsumerStoryReviewPromptInput): string {
  const role = input.kind === "review"
    ? "你是一名深谙商业长篇网文节奏、连续性和读者期待管理的金牌主编。"
    : input.kind === "adjustment"
      ? "你是一名擅长最小影响重规划的长篇网文总策划。"
      : "你是一名擅长滚动规划、能把长篇目标拆成下一段具体行动的网文策划。";
  return `${role}

共同规则：
1. 只返回符合 Schema 的结构化 JSON，不输出 Markdown、解释或额外字段。
2. 已完成章节是锁定事实，不得要求自动改写、否定或重新解释它们。
3. 采用最小影响原则；先解决当前阶段，再考虑卷规划，最后才是全书骨架。
4. 题材自适应：不得强制添加系统、超能力、打脸、奖励、升级、换地图或反派；只有既定故事方向包含时才能使用。
5. 所有判断必须具体。禁止使用“加强冲突”“提升张力”“埋下伏笔”“更大危机即将到来”等无法直接执行的空话。
6. affectedLocations 使用“第 N 章：可定位的事实或问题”，没有证据时返回空数组。
7. preserved 明确告诉用户哪些已完成内容和上层规划不会变化。
8. proposedCurrentPhase 必须从指定下一章开始或覆盖下一章，并能直接生成逐章任务。
9. proposedBookSkeleton / proposedVolumePlan 只有影响级别允许且确有必要时才返回完整新版本，否则返回 null。
10. 不暴露 Prompt、模型、工作流、Token、审校债务或重规划等工程术语。`;
}

function planningContext(input: ConsumerStoryReviewPromptInput): string {
  if (input.kind === "adjustment") {
    return `当前全书骨架（仅在 high 影响时允许改动）：
${asJson(input.bookSkeleton)}

当前完整卷规划（仅在 medium/high 影响时允许改动）：
${asJson(input.volumePlan)}`;
  }
  if (input.kind === "review") {
    return `全书稳定约束：
${asJson(skeletonCore(input.bookSkeleton))}

卷规划概览与相邻卷窗口：
${asJson(volumeWindow(input))}`;
  }
  return `全书稳定约束：
${asJson(skeletonCore(input.bookSkeleton))}

下一阶段所在卷及相邻卷窗口：
${asJson(volumeWindow(input))}`;
}

function renderMessages(input: ConsumerStoryReviewPromptInput): BaseMessage[] {
  return [
    new SystemMessage(systemInstruction(input)),
    new HumanMessage(`作品：${input.novelTitle}
最初想法：${input.idea}

已确认的商业故事方向：
${asJson(directionContext(input.selectedDirection))}

${planningContext(input)}

刚完成或正在承接的剧情阶段：
${asJson(input.currentPhase)}

已完成章节的锁定索引与证据投影：
${asJson(lockedChapterContext(input))}

本次任务：
${taskInstruction(input)}`),
  ];
}

function validateArtifact(
  artifact: ConsumerStoryReviewArtifact,
  input: ConsumerStoryReviewPromptInput,
): ConsumerStoryReviewArtifact {
  if (
    ["review", "transition"].includes(input.kind)
    && artifact.proposedCurrentPhase.chapterStart !== input.nextChapterOrder
  ) {
    throw new Error(`下一剧情阶段必须从第 ${input.nextChapterOrder} 章开始。`);
  }
  if (
    input.kind === "adjustment"
    && (
      artifact.proposedCurrentPhase.chapterStart > input.nextChapterOrder
      || artifact.proposedCurrentPhase.chapterEnd < input.nextChapterOrder
    )
  ) {
    throw new Error("调整后的当前剧情阶段必须覆盖下一章。");
  }
  if (
    input.kind === "transition"
    && (artifact.proposedBookSkeleton || artifact.proposedVolumePlan)
  ) {
    throw new Error("跳过检查时不能改动全书骨架或卷规划。");
  }
  if (
    input.kind === "transition"
    && (
      artifact.impactLevel !== "low"
      || artifact.affectedLocations.length > 0
    )
  ) {
    throw new Error("跳过检查时不能生成质量问题或扩大影响范围。");
  }
  if (
    artifact.impactLevel === "low"
    && (artifact.proposedBookSkeleton || artifact.proposedVolumePlan)
  ) {
    throw new Error("低影响方案只能调整当前剧情阶段。");
  }
  if (
    artifact.impactLevel === "medium"
    && artifact.proposedBookSkeleton
  ) {
    throw new Error("中影响方案不能改动全书骨架。");
  }
  return artifact;
}

function asset(
  id: string,
): PromptAsset<
  ConsumerStoryReviewPromptInput,
  typeof consumerStoryReviewArtifactSchema._output,
  ConsumerStoryReviewArtifact
> {
  return {
    id,
    version: "v2",
    taskType: "planner",
    mode: "structured",
    language: "zh",
    contextPolicy: { maxTokensBudget: 0 },
    outputSchema: consumerStoryReviewArtifactSchema,
    render: renderMessages,
    postValidate: validateArtifact,
  };
}

export const consumerStoryReviewPrompt = asset("consumer.story.review");
export const consumerStoryAdjustmentPrompt = asset("consumer.story.adjust");
export const consumerStoryTransitionPrompt = asset("consumer.story.transition");
