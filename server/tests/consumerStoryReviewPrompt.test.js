const test = require("node:test");
const assert = require("node:assert/strict");
const {
  consumerStoryAdjustmentPrompt,
  consumerStoryReviewPrompt,
  consumerStoryTransitionPrompt,
} = require("../dist/prompting/prompts/consumer/consumerStoryReview.prompts.js");

function textOf(prompt, input) {
  return prompt.render(input).map((message) => String(message.content)).join("\n");
}

function promptInput(kind) {
  const middleOnly = "旧章中段内容不应进入提示词";
  const oldContent = [
    "旧章边界证据。",
    "普通中段。".repeat(250),
    middleOnly,
    "继续发生普通事件。".repeat(250),
    "旧章结尾证据。",
  ].join("");
  return {
    novelId: "novel-review-prompt",
    novelTitle: "最后一天的记忆",
    idea: "一个普通人能够看见别人最后一天的记忆。",
    selectedDirection: {
      id: "memory",
      title: "最后一天的记忆",
      premise: "普通人试图阻止记忆中的事故。",
      protagonist: "档案管理员林默",
      centralConflict: "救人会失去自己的记忆。",
      readerAppeal: "倒计时救援与选择。",
      tone: "悬疑、克制",
      development: "追查记忆灾难的源头。",
      coreAdvantage: "能看见他人最后一天的记忆。",
      advantageLimit: "每次使用都会失去自己的一段记忆。",
      payoffPattern: "利用记忆线索抢在事故发生前救人。",
      progressionPath: "从读取零散记忆到追查灾难源头。",
      recommendedLength: "约 3 卷，30 章",
      estimatedVolumes: 3,
      estimatedChapters: 30,
    },
    bookSkeleton: {
      corePromise: "每次救援都揭开更大的真相。",
      protagonistArc: "从旁观者成为承担代价的人。",
      ending: "主角公开真相并保住重要记忆。",
      acts: [1, 2, 3].map((order) => ({
        order,
        name: `第${order}阶段`,
        goal: `完成阶段目标 ${order}`,
        turningPoint: `发生不可逆转折 ${order}`,
        outcome: `进入下一阶段 ${order}`,
      })),
      majorCharacters: [{ name: "林默", role: "主角", arc: "承担选择的代价" }],
    },
    volumePlan: {
      volumes: [
        {
          order: 1,
          title: "雨夜来信",
          goal: "完成第一次救援。",
          mainConflict: "记忆与现实证据冲突。",
          turningPoint: "主角自己的记忆被改写。",
          endingHook: "下一名目标是亲近的人。",
          estimatedChapters: 10,
        },
        {
          order: 2,
          title: "空白档案",
          goal: "追查记忆交易。",
          mainConflict: "主角无法确认自己的过去。",
          turningPoint: "档案来源指向主角本人。",
          endingHook: "主角发现被删除的身份。",
          estimatedChapters: 10,
        },
        {
          order: 3,
          title: "远期终局卷不应进入局部提示词",
          goal: "公开全部真相。",
          mainConflict: "最终敌人控制整座城市的记忆。",
          turningPoint: "主角牺牲最后一段私人记忆。",
          endingHook: "故事完结。",
          estimatedChapters: 10,
        },
      ],
    },
    currentPhase: {
      name: "第一次救援",
      chapterStart: 1,
      chapterEnd: 5,
      objective: "让主角决定相信预警并行动。",
      openingState: "主角认为记忆只是幻觉。",
      beats: [1, 2, 3].map((order) => ({
        order,
        event: `推进事件 ${order}`,
        purpose: `完成认知变化 ${order}`,
      })),
      characterChanges: ["主角从怀疑转为验证。"],
      endingState: "救援成功但主角失去一段记忆。",
    },
    chapters: [
      { order: 1, title: "雨夜预警", content: oldContent },
      { order: 2, title: "失效的监控", content: "第二章正文。".repeat(500) },
      { order: 3, title: "倒计时", content: "第三章正文。".repeat(500) },
      {
        order: 4,
        title: "记忆代价",
        content: `${"第四章正文。".repeat(500)}第四章最近证据：林默忘记母亲的生日。`,
      },
      {
        order: 5,
        title: "救援之后",
        content: `${"第五章正文。".repeat(500)}第五章最近证据：获救者说出下一名目标。`,
      },
    ],
    kind,
    checkpointKind: "phase",
    instruction: kind === "adjustment" ? "让下一阶段改为追查记忆交易。" : "",
    nextChapterOrder: 6,
  };
}

function validArtifact() {
  return {
    conclusion: "当前阶段可以继续。",
    affectedLocations: [],
    impactLevel: "low",
    changeSummary: "只准备下一阶段。",
    futureAffected: ["第 6—10 章"],
    preserved: ["第 1—5 章正文与全书结局保持不变"],
    recommendedAction: "从第 6 章继续追查线索。",
    proposedBookSkeleton: null,
    proposedVolumePlan: null,
    proposedCurrentPhase: {
      name: "代价浮现",
      chapterStart: 6,
      chapterEnd: 10,
      objective: "确认能力代价并追查来源。",
      openingState: "主角刚刚失去一段私人记忆。",
      beats: [1, 2, 3].map((order) => ({
        order,
        event: `林默执行具体调查行动 ${order}`,
        purpose: `产生可观察结果 ${order}`,
      })),
      characterChanges: ["林默从庆幸转为警惕。"],
      endingState: "林默找到记忆交易的入口。",
    },
  };
}

test("story review v2 prunes distant plans and chapter middles while preserving evidence", () => {
  const input = promptInput("review");
  const rendered = textOf(consumerStoryReviewPrompt, input);

  assert.equal(consumerStoryReviewPrompt.version, "v2");
  assert.match(rendered, /第四章最近证据：林默忘记母亲的生日/);
  assert.match(rendered, /只能报告证据中可定位的问题/);
  assert.doesNotMatch(rendered, /旧章中段内容不应进入提示词/);
  assert.doesNotMatch(rendered, /远期终局卷不应进入局部提示词/);
});

test("transition uses only recent locked evidence while adjustment receives full planning", () => {
  const transitionText = textOf(
    consumerStoryTransitionPrompt,
    promptInput("transition"),
  );
  const adjustmentText = textOf(
    consumerStoryAdjustmentPrompt,
    promptInput("adjustment"),
  );

  assert.equal(consumerStoryTransitionPrompt.version, "v2");
  assert.equal(consumerStoryAdjustmentPrompt.version, "v2");
  assert.match(transitionText, /第五章最近证据：获救者说出下一名目标/);
  assert.doesNotMatch(transitionText, /旧章边界证据/);
  assert.doesNotMatch(transitionText, /远期终局卷不应进入局部提示词/);
  assert.match(adjustmentText, /远期终局卷不应进入局部提示词/);
  assert.match(adjustmentText, /low：只修改覆盖下一章的当前剧情阶段/);
});

test("story review v2 enforces cascading impact levels and transition boundaries", () => {
  const adjustmentInput = promptInput("adjustment");
  const lowWithVolumeChange = validArtifact();
  lowWithVolumeChange.proposedVolumePlan = adjustmentInput.volumePlan;
  assert.throws(
    () => consumerStoryAdjustmentPrompt.postValidate(
      lowWithVolumeChange,
      adjustmentInput,
    ),
    /低影响方案只能调整当前剧情阶段/,
  );

  const transitionInput = promptInput("transition");
  const transitionWithIssue = validArtifact();
  transitionWithIssue.affectedLocations = ["第 5 章：虚构问题"];
  assert.throws(
    () => consumerStoryTransitionPrompt.postValidate(
      transitionWithIssue,
      transitionInput,
    ),
    /跳过检查时不能生成质量问题/,
  );
});
