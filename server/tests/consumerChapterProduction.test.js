const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ConsumerChapterProductionService,
} = require("../dist/modules/consumerProduction/application/chapterProductionService.js");
const {
  buildConsumerProsePolicy,
  inspectConsumerProse,
  normalizeConsumerChapterTask,
} = require("../dist/prompting/prompts/consumer/consumerProsePolicy.js");
const {
  parseConsumerChapterWritingTask,
} = require("../../shared/dist/types/consumerChapterProduction.js");

function setupArtifacts() {
  return {
    selectedDirectionJson: JSON.stringify({
      id: "memory",
      title: "最后一天的记忆",
      premise: "普通人试图阻止记忆中的事故。",
      protagonist: "档案管理员",
      centralConflict: "救人会失去自己的记忆。",
      readerAppeal: "倒计时救援与选择。",
      tone: "悬疑、克制",
      development: "追查记忆灾难的源头。",
      coreAdvantage: "能看见他人最后一天的记忆。",
      advantageLimit: "每次使用都会失去自己的一段记忆。",
      payoffPattern: "利用记忆线索抢在事故发生前救人。",
      progressionPath: "从读取零散记忆到追查记忆灾难的源头。",
      recommendedLength: "约 5 卷，150 章",
      estimatedVolumes: 5,
      estimatedChapters: 150,
    }),
    bookSkeletonJson: JSON.stringify({
      corePromise: "每次救援都揭开更大的真相。",
      protagonistArc: "从旁观者成为承担代价的人。",
      ending: "主角公开真相并保住重要记忆。",
      acts: [1, 2, 3].map((order) => ({
        order,
        name: `第${order}幕`,
        goal: `完成第${order}阶段`,
        turningPoint: `发生第${order}次转折`,
        outcome: `进入第${order + 1}阶段`,
      })),
      majorCharacters: [{ name: "林默", role: "主角", arc: "承担责任" }],
    }),
    volumePlanJson: JSON.stringify({
      volumes: [{
        order: 1,
        title: "雨夜来信",
        goal: "发现能力并完成第一次救援。",
        mainConflict: "记忆与现实证据冲突。",
        turningPoint: "主角自己的记忆被改写。",
        endingHook: "下一名目标是亲近的人。",
        estimatedChapters: 30,
      }],
    }),
    currentPhaseJson: JSON.stringify({
      name: "第一次救援",
      chapterStart: 1,
      chapterEnd: 5,
      objective: "让主角决定相信预警并行动。",
      openingState: "主角认为记忆只是幻觉。",
      beats: [1, 2, 3].map((order) => ({
        order,
        event: `第${order}个推进事件`,
        purpose: `完成第${order}次认知变化`,
      })),
      characterChanges: ["主角从怀疑转为验证。"],
      endingState: "救援成功但主角失去一段记忆。",
    }),
  };
}

function createMemoryProductionDb() {
  let nextId = 1;
  const now = () => new Date();
  const id = (prefix) => `${prefix}-${nextId++}`;
  const state = {
    novels: [{
      id: "novel-1",
      title: "最后一天的记忆",
      description: "普通人试图阻止记忆中的事故。",
      createdAt: now(),
      updatedAt: now(),
    }],
    setups: [{
      id: "setup-1",
      novelId: "novel-1",
      idea: "一个普通人能够看见别人最后一天的记忆。",
      status: "completed",
      step: "completed",
      ...setupArtifacts(),
    }],
    chapters: [{
      id: "chapter-1",
      novelId: "novel-1",
      title: "第一章 雨夜记忆",
      content: "第一章旧正文",
      order: 1,
      taskSheet: null,
      createdAt: now(),
      updatedAt: now(),
    }],
    drafts: [{
      id: "draft-1",
      chapterId: "chapter-1",
      content: "第一章用户确认正文",
      revision: 0,
      source: "manual",
      baseVersionId: null,
      createdAt: now(),
      updatedAt: now(),
    }],
    versions: [],
    operations: [],
  };

  function matches(value, condition) {
    if (condition === undefined) return true;
    if (condition && typeof condition === "object" && Array.isArray(condition.in)) {
      return condition.in.includes(value);
    }
    if (condition && typeof condition === "object" && "lte" in condition) {
      return value <= condition.lte;
    }
    if (condition && typeof condition === "object" && "not" in condition) {
      return value !== condition.not;
    }
    return value === condition;
  }

  function apply(target, data) {
    for (const [key, value] of Object.entries(data)) {
      target[key] = value && typeof value === "object" && "increment" in value
        ? (target[key] ?? 0) + value.increment
        : value;
    }
    target.updatedAt = now();
  }

  const db = {
    novel: {
      async findUnique({ where }) {
        return state.novels.find((item) => item.id === where.id) ?? null;
      },
    },
    consumerStorySetup: {
      async findUnique({ where }) {
        return state.setups.find((item) => item.novelId === where.novelId) ?? null;
      },
    },
    chapter: {
      async findFirst({ where, orderBy }) {
        let items = state.chapters.filter((item) => (
          matches(item.id, where.id) && matches(item.novelId, where.novelId)
        ));
        if (orderBy?.order === "desc") items.sort((a, b) => b.order - a.order);
        return items[0] ?? null;
      },
      async findUnique({ where }) {
        return state.chapters.find((item) => item.id === where.id) ?? null;
      },
      async findMany({ where, orderBy, take }) {
        let items = state.chapters.filter((item) => (
          matches(item.novelId, where.novelId)
          && matches(item.id, where.id)
          && matches(item.order, where.order)
        ));
        if (orderBy?.order === "desc") items.sort((a, b) => b.order - a.order);
        const limited = typeof take === "number" ? items.slice(0, take) : items;
        return limited.map((item) => ({ ...item }));
      },
      async create({ data }) {
        const chapter = {
          id: id("chapter"),
          taskSheet: null,
          ...data,
          createdAt: now(),
          updatedAt: now(),
        };
        state.chapters.push(chapter);
        return { ...chapter };
      },
      async update({ where, data }) {
        const chapter = state.chapters.find((item) => item.id === where.id);
        if (!chapter) throw new Error("chapter missing");
        apply(chapter, data);
        return { ...chapter };
      },
    },
    consumerChapterDraft: {
      async findUnique({ where }) {
        const draft = state.drafts.find((item) => item.chapterId === where.chapterId);
        return draft ? { ...draft } : null;
      },
      async create({ data }) {
        const draft = {
          id: id("draft"),
          revision: 0,
          baseVersionId: null,
          ...data,
          createdAt: now(),
          updatedAt: now(),
        };
        state.drafts.push(draft);
        return { ...draft };
      },
      async update({ where, data }) {
        const draft = state.drafts.find((item) => item.chapterId === where.chapterId);
        if (!draft) throw new Error("draft missing");
        apply(draft, data);
        return { ...draft };
      },
      async updateMany({ where, data }) {
        const draft = state.drafts.find((item) => (
          item.chapterId === where.chapterId && item.revision === where.revision
        ));
        if (!draft) return { count: 0 };
        apply(draft, data);
        return { count: 1 };
      },
    },
    consumerChapterVersion: {
      async findFirst({ where, orderBy }) {
        const items = state.versions.filter((item) => item.chapterId === where.chapterId);
        if (orderBy?.sequence === "desc") items.sort((a, b) => b.sequence - a.sequence);
        return items[0] ?? null;
      },
      async create({ data }) {
        const version = { id: id("version"), ...data, createdAt: now() };
        state.versions.push(version);
        return { ...version };
      },
    },
    consumerCreationOperation: {
      async findUnique({ where }) {
        const item = state.operations.find((operation) => (
          where.id ? operation.id === where.id : operation.requestKey === where.requestKey
        ));
        return item ? { ...item } : null;
      },
      async findFirst({ where, orderBy }) {
        let items = state.operations.filter((item) => (
          matches(item.id, where.id)
          && matches(item.novelId, where.novelId)
          && matches(item.chapterId, where.chapterId)
          && matches(item.kind, where.kind)
        ));
        if (orderBy?.createdAt === "desc") items.sort((a, b) => b.createdAt - a.createdAt);
        return items[0] ? { ...items[0] } : null;
      },
      async findMany({ where, orderBy, take, select }) {
        let items = state.operations.filter((item) => (
          matches(item.novelId, where.novelId)
          && matches(item.chapterId, where.chapterId)
          && matches(item.kind, where.kind)
          && matches(item.status, where.status)
          && matches(item.actualCreditsMilli, where.actualCreditsMilli)
        ));
        if (orderBy?.createdAt === "desc") items.sort((a, b) => b.createdAt - a.createdAt);
        const limited = typeof take === "number" ? items.slice(0, take) : items;
        return limited.map((item) => {
          if (!select) return { ...item };
          return Object.fromEntries(
            Object.entries(select)
              .filter(([, included]) => included)
              .map(([key]) => [key, item[key]]),
          );
        });
      },
      async create({ data }) {
        const item = {
          ...data,
          receivedContent: data.receivedContent ?? "",
          actualCreditsMilli: data.actualCreditsMilli ?? null,
          promptTokens: data.promptTokens ?? 0,
          completionTokens: data.completionTokens ?? 0,
          totalTokens: data.totalTokens ?? 0,
          llmCallCount: data.llmCallCount ?? 0,
          relayRequestId: null,
          resultRefType: null,
          resultRefId: null,
          errorCode: null,
          errorMessage: null,
          startedAt: null,
          finishedAt: null,
          createdAt: now(),
          updatedAt: now(),
        };
        state.operations.push(item);
        return { ...item };
      },
      async update({ where, data }) {
        const item = state.operations.find((operation) => operation.id === where.id);
        if (!item) throw new Error("operation missing");
        apply(item, data);
        return { ...item };
      },
      async updateMany({ where, data }) {
        const item = state.operations.find((operation) => (
          matches(operation.id, where.id) && matches(operation.status, where.status)
        ));
        if (!item) return { count: 0 };
        apply(item, data);
        return { count: 1 };
      },
    },
    async $transaction(callback) {
      return callback(db);
    },
  };
  return { db, state };
}

class FakeProductionGenerator {
  constructor() {
    this.failAfterFirstChunk = false;
    this.taskCalls = 0;
    this.writeCalls = 0;
    this.continueCalls = 0;
    this.lastTaskInput = null;
  }

  async createTask(input, _operationId, onUsage) {
    this.taskCalls += 1;
    this.lastTaskInput = input;
    await onUsage?.({
      promptTokens: 800,
      completionTokens: 200,
      totalTokens: 1_000,
    });
    return {
      title: "第二章 倒计时",
      startState: "林默开始验证记忆。",
      goal: "找到事故目标。",
      mustHappen: ["确认事故地点", "第一次主动干预"],
      characters: ["林默"],
      carryOver: "承接第一章的陌生记忆。",
      mustNotHappen: ["不能揭开最终真相"],
      endState: "林默确认能力真实存在。",
      endingHook: "记忆中的时间只剩一小时。",
      openingBeat: "林默把记忆中的事故时间写到纸上，开始逐项核对。",
      endingBeat: "纸上的倒计时只剩一小时，林默抓起外套冲出门。",
      readerInference: "林默已经相信能力真实存在，而且必须立刻行动。",
      forbiddenExplanation: "不要直接写林默终于相信能力，也不要总结他已经没有退路。",
      suggestedWords: 2_000,
    };
  }

  async writeChapter(_input, _operationId, onDelta, onUsage) {
    this.writeCalls += 1;
    await onDelta("第二章第一段。".repeat(40));
    if (this.failAfterFirstChunk) {
      this.failAfterFirstChunk = false;
      throw new Error("模拟网络中断");
    }
    await onDelta("第二章结尾。".repeat(40));
    await onUsage?.({
      promptTokens: 1_200,
      completionTokens: 2_400,
      totalTokens: 3_600,
    });
    return "第二章第一段。".repeat(40) + "第二章结尾。".repeat(40);
  }

  async continueChapter(_input, _operationId, onDelta, onUsage) {
    this.continueCalls += 1;
    await onDelta("从断点继续并完成本章。".repeat(40));
    await onUsage?.({
      promptTokens: 1_100,
      completionTokens: 1_600,
      totalTokens: 2_700,
    });
    return "从断点继续并完成本章。".repeat(40);
  }
}

const noCreditMeter = {
  async readAvailableCredits() {
    return null;
  },
};

test("next chapter confirms source, streams into a new draft and never overwrites canonical target content", async () => {
  const { db, state } = createMemoryProductionDb();
  const generator = new FakeProductionGenerator();
  const service = new ConsumerChapterProductionService(db, generator, noCreditMeter, new Date(0));
  const requestKey = crypto.randomUUID();

  const started = await service.startNextChapter("novel-1", "chapter-1", {
    expectedRevision: 0,
    requestKey,
  });
  assert.equal(started.shouldExecute, true);
  assert.equal(state.chapters.length, 2);
  assert.equal(state.chapters[0].content, "第一章用户确认正文");
  assert.equal(state.versions.length, 1);

  const duplicate = await service.startNextChapter("novel-1", "chapter-1", {
    expectedRevision: 0,
    requestKey,
  });
  assert.equal(duplicate.shouldExecute, false);
  assert.equal(state.chapters.length, 2);

  const completed = await service.executeOperation(started.snapshot.operationId);
  assert.equal(completed.status, "succeeded");
  const target = state.chapters[1];
  const targetDraft = state.drafts.find((item) => item.chapterId === target.id);
  assert.equal(target.title, "倒计时");
  assert.equal(target.content, "");
  assert.match(targetDraft.content, /第二章第一段/);
  assert.match(targetDraft.content, /第二章结尾/);
  assert.equal(generator.taskCalls, 1);
  assert.equal(generator.writeCalls, 1);
  assert.deepEqual(completed.tokenUsage, {
    promptTokens: 2_000,
    completionTokens: 2_600,
    totalTokens: 4_600,
    callCount: 2,
  });
  assert.deepEqual(completed.chapterTokenUsage, completed.tokenUsage);
  assert.equal(completed.length.targetCharacters, 2_600);
  assert.ok(completed.length.characterCount > 0);
  assert.equal(completed.qualityWarnings[0].code, "length_out_of_range");
  assert.equal(JSON.parse(target.taskSheet).suggestedWords, 2_600);
});

test("consumer prose policy normalizes length and only reports local non-blocking warnings", () => {
  const normalized = normalizeConsumerChapterTask({
    title: "第二章",
    startState: "主角站在门外。",
    goal: "拿到钥匙。",
    mustHappen: ["主角进入房间。"],
    characters: ["主角"],
    carryOver: "上一章的敲门声仍在继续。",
    mustNotHappen: ["不能揭晓最终真相。"],
    endState: "主角看见空房间。",
    endingHook: "桌上的电话突然响起。",
    openingBeat: "主角推门进入房间。",
    endingBeat: "空房间里的电话突然响起。",
    readerInference: "有人知道主角已经到达。",
    forbiddenExplanation: "不要直接解释幕后的人正在监视主角。",
    suggestedWords: 8_000,
  });
  assert.equal(normalized.suggestedWords, 2_600);
  const policy = buildConsumerProsePolicy({ task: normalized });
  assert.match(policy, /读者应该自行推断/);
  assert.match(policy, /最后 150—300 字/);
  assert.match(policy, /只在内部检查最后 300 字/);

  const inspected = inspectConsumerProse(
    "他终于明白，一切宛如交织的画卷。新的篇章才刚刚开始。",
  );
  assert.equal(inspected.length.targetCharacters, 2_600);
  assert.deepEqual(
    inspected.warnings.map((warning) => warning.code),
    ["length_out_of_range", "formulaic_phrasing", "summary_ending"],
  );

  const explanatoryEnding = inspectConsumerProse(
    "崔绍宗脸色铁青，李衡却若有所思——郑观音这是在逼他公开对决，而崔绍宗刚刚被拖下水，已经没有退路。",
  );
  assert.deepEqual(
    explanatoryEnding.warnings.map((warning) => warning.code),
    ["length_out_of_range", "formulaic_phrasing", "explanatory_ending"],
  );

  const dialogueEnding = inspectConsumerProse(
    "郑观音盯着他，问：“这意味着你已经没有退路？”",
  );
  assert.equal(
    dialogueEnding.warnings.some((warning) => warning.code === "explanatory_ending"),
    false,
  );
});

test("legacy chapter tasks derive the observable ending contract when restored", () => {
  const task = parseConsumerChapterWritingTask({
    title: "第七章",
    startState: "崔绍宗刚被卷入争端。",
    goal: "迫使双方公开表态。",
    mustHappen: ["郑观音递上战帖。"],
    characters: ["崔绍宗", "李衡", "郑观音"],
    carryOver: "上一章留下了一封未拆的战帖。",
    mustNotHappen: ["不得替任何一方解释真实意图。"],
    endState: "崔绍宗不得不回应公开对决。",
    endingHook: "郑观音把战帖压在崔绍宗手边。",
    suggestedWords: 2_600,
  });

  assert.equal(task.openingBeat, "上一章留下了一封未拆的战帖。");
  assert.equal(task.endingBeat, "郑观音把战帖压在崔绍宗手边。");
  assert.equal(task.readerInference, "崔绍宗不得不回应公开对决。");
  assert.match(task.forbiddenExplanation, /不要直接解释/);
});

test("chapter text becomes readable before the model finishes the full response", async () => {
  const { db, state } = createMemoryProductionDb();
  let markChunkSaved;
  let releaseGeneration;
  const chunkSaved = new Promise((resolve) => {
    markChunkSaved = resolve;
  });
  const released = new Promise((resolve) => {
    releaseGeneration = resolve;
  });
  const firstChunk = "模型刚返回的正文片段，会先显示在编辑器里。".repeat(8);
  const finalChunk = "随后返回的内容继续接在后面。".repeat(12);
  const generator = new FakeProductionGenerator();
  generator.writeChapter = async (_input, _operationId, onDelta, onUsage) => {
    generator.writeCalls += 1;
    await onDelta(firstChunk);
    markChunkSaved();
    await released;
    await onDelta(finalChunk);
    await onUsage?.({
      promptTokens: 1_200,
      completionTokens: 2_400,
      totalTokens: 3_600,
    });
    return firstChunk + finalChunk;
  };
  const service = new ConsumerChapterProductionService(
    db,
    generator,
    noCreditMeter,
    new Date(0),
  );
  const started = await service.startNextChapter("novel-1", "chapter-1", {
    expectedRevision: 0,
    requestKey: crypto.randomUUID(),
  });
  const execution = service.executeOperation(started.snapshot.operationId);

  await chunkSaved;
  const operation = state.operations.find((item) => item.id === started.snapshot.operationId);
  const draft = state.drafts.find((item) => item.chapterId === started.snapshot.chapterId);
  assert.match(operation.receivedContent, /模型刚返回的正文片段/);
  assert.match(draft.content, /模型刚返回的正文片段/);
  assert.doesNotMatch(draft.content, /随后返回的内容/);

  releaseGeneration();
  const completed = await execution;
  assert.equal(completed.status, "succeeded");
  assert.match(draft.content, /随后返回的内容/);
});

test("request key replay is rejected when it targets a different chapter", async () => {
  const { db, state } = createMemoryProductionDb();
  const generator = new FakeProductionGenerator();
  const service = new ConsumerChapterProductionService(db, generator, noCreditMeter, new Date(0));
  const requestKey = crypto.randomUUID();

  const started = await service.startNextChapter("novel-1", "chapter-1", {
    expectedRevision: 0,
    requestKey,
  });
  const target = state.chapters.find((item) => item.id === started.snapshot.chapterId);

  await assert.rejects(
    service.startNextChapter("novel-1", target.id, {
      expectedRevision: 0,
      requestKey,
    }),
    /本次操作标识已被其他章节使用/,
  );
  await assert.rejects(
    service.resumeChapter("novel-1", "chapter-1", {
      expectedRevision: 1,
      requestKey,
    }),
    /本次操作标识已被其他章节使用/,
  );
});

test("chapter task context excludes target and future chapters", async () => {
  const { db, state } = createMemoryProductionDb();
  const generator = new FakeProductionGenerator();
  const service = new ConsumerChapterProductionService(db, generator, noCreditMeter, new Date(0));

  const started = await service.startNextChapter("novel-1", "chapter-1", {
    expectedRevision: 0,
    requestKey: crypto.randomUUID(),
  });
  state.chapters.push({
    id: "chapter-future",
    novelId: "novel-1",
    title: "尚未发生的章节",
    content: "这段内容不能进入下一章上下文。",
    order: 99,
    taskSheet: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await service.executeOperation(started.snapshot.operationId);
  assert.deepEqual(
    generator.lastTaskInput.recentChapters.map((chapter) => chapter.order),
    [1],
  );
});

test("interrupted chapter keeps partial draft and resumes with a new paid operation", async () => {
  const { db, state } = createMemoryProductionDb();
  const generator = new FakeProductionGenerator();
  generator.failAfterFirstChunk = true;
  const service = new ConsumerChapterProductionService(db, generator, noCreditMeter, new Date(0));

  const started = await service.startNextChapter("novel-1", "chapter-1", {
    expectedRevision: 0,
    requestKey: crypto.randomUUID(),
  });
  const failed = await service.executeOperation(started.snapshot.operationId);
  assert.equal(failed.status, "failed");
  const draft = state.drafts.find((item) => item.chapterId === failed.chapterId);
  assert.match(draft.content, /第二章第一段/);
  const partialContent = draft.content;

  const resumed = await service.resumeChapter("novel-1", failed.chapterId, {
    expectedRevision: draft.revision,
    requestKey: crypto.randomUUID(),
  });
  assert.equal(resumed.shouldExecute, true);
  assert.equal(resumed.snapshot.mode, "continue_chapter");
  const completed = await service.executeOperation(resumed.snapshot.operationId);
  assert.equal(completed.status, "succeeded");
  assert.match(draft.content, new RegExp(partialContent.slice(0, 20)));
  assert.match(draft.content, /从断点继续并完成本章/);
  assert.equal(generator.taskCalls, 1);
  assert.equal(generator.continueCalls, 1);
});

test("next chapter is blocked at a story checkpoint until the user chooses how to continue", async () => {
  const { db, state } = createMemoryProductionDb();
  const currentPhase = JSON.parse(state.setups[0].currentPhaseJson);
  state.setups[0].currentPhaseJson = JSON.stringify({
    ...currentPhase,
    chapterEnd: 1,
  });
  const service = new ConsumerChapterProductionService(
    db,
    new FakeProductionGenerator(),
    noCreditMeter,
    new Date(0),
  );

  await assert.rejects(
    service.startNextChapter("novel-1", "chapter-1", {
      expectedRevision: 0,
      requestKey: crypto.randomUUID(),
    }),
    /这一段剧情已经完成/,
  );
  assert.equal(state.chapters.length, 1);
  assert.equal(state.operations.length, 0);
});

test("next chapter is blocked while a future-story adjustment is waiting for confirmation", async () => {
  const { db, state } = createMemoryProductionDb();
  state.operations.push({
    id: "adjustment-1",
    requestKey: crypto.randomUUID(),
    novelId: "novel-1",
    chapterId: null,
    kind: "consumer_story_adjustment",
    status: "succeeded",
    stage: "awaiting_confirmation",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const service = new ConsumerChapterProductionService(
    db,
    new FakeProductionGenerator(),
    noCreditMeter,
    new Date(0),
  );

  await assert.rejects(
    service.startNextChapter("novel-1", "chapter-1", {
      expectedRevision: 0,
      requestKey: crypto.randomUUID(),
    }),
    /调整方案还没有确认/,
  );
  assert.equal(state.chapters.length, 1);
});
