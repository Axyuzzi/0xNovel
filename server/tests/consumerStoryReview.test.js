const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ConsumerStoryReviewService,
} = require("../dist/modules/consumerProduction/application/storyReviewService.js");

function artifacts() {
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
      recommendedLength: "约 1 卷，30 章",
      estimatedVolumes: 1,
      estimatedChapters: 30,
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

function nextPhase() {
  return {
    name: "代价浮现",
    chapterStart: 6,
    chapterEnd: 10,
    objective: "让主角确认救援会永久损失自身记忆。",
    openingState: "主角暂时相信第一次救援没有代价。",
    beats: [1, 2, 3].map((order) => ({
      order,
      event: `代价阶段事件 ${order}`,
      purpose: `让代价升级 ${order}`,
    })),
    characterChanges: ["主角从庆幸转为警惕。"],
    endingState: "主角发现下一名目标与自己有关。",
  };
}

function createMemoryDb() {
  let nextId = 1;
  const now = () => new Date();
  const id = (prefix) => `${prefix}-${nextId++}`;
  const state = {
    novel: { id: "novel-1", title: "最后一天的记忆" },
    setup: {
      id: "setup-1",
      novelId: "novel-1",
      idea: "一个普通人能够看见别人最后一天的记忆。",
      status: "completed",
      revision: 10,
      ...artifacts(),
    },
    chapters: Array.from({ length: 5 }, (_, index) => ({
      id: `chapter-${index + 1}`,
      novelId: "novel-1",
      title: `第 ${index + 1} 章`,
      order: index + 1,
      content: `第 ${index + 1} 章已经完成的正文。`.repeat(20),
      taskSheet: `第 ${index + 1} 章任务`,
      consumerDraft: {
        content: `第 ${index + 1} 章已经完成的正文。`.repeat(20),
      },
    })),
    operations: [],
    versions: [],
  };

  function matches(value, condition) {
    if (condition === undefined) return true;
    if (condition && typeof condition === "object" && Array.isArray(condition.in)) {
      return condition.in.includes(value);
    }
    if (condition && typeof condition === "object" && "not" in condition) {
      return value !== condition.not;
    }
    if (condition && typeof condition === "object" && "gte" in condition) {
      return value >= condition.gte
        && (!("lte" in condition) || value <= condition.lte);
    }
    return value === condition;
  }

  function apply(target, data) {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in value) {
        target[key] += value.increment;
      } else {
        target[key] = value;
      }
    }
    target.updatedAt = now();
  }

  const db = {
    novel: {
      async findUnique({ where }) {
        return state.novel.id === where.id ? { ...state.novel } : null;
      },
    },
    consumerStorySetup: {
      async findUnique({ where }) {
        return state.setup.novelId === where.novelId ? { ...state.setup } : null;
      },
      async update({ where, data }) {
        if (state.setup.novelId !== where.novelId) throw new Error("setup missing");
        apply(state.setup, data);
        return { ...state.setup };
      },
    },
    chapter: {
      async findFirst({ where, orderBy, include }) {
        const items = state.chapters.filter((chapter) => (
          matches(chapter.id, where.id) && matches(chapter.novelId, where.novelId)
        ));
        if (orderBy?.order === "desc") items.sort((a, b) => b.order - a.order);
        const item = items[0];
        if (!item) return null;
        return include?.consumerDraft ? { ...item } : { ...item, consumerDraft: undefined };
      },
      async findMany({ where, orderBy, take }) {
        const items = state.chapters.filter((chapter) => (
          matches(chapter.novelId, where.novelId)
          && matches(chapter.order, where.order)
        ));
        if (orderBy?.order === "desc") items.sort((a, b) => b.order - a.order);
        return items.slice(0, take).map((item) => ({ ...item }));
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const chapter of state.chapters) {
          if (
            matches(chapter.novelId, where.novelId)
            && matches(chapter.order, where.order)
            && (!where.OR || !chapter.content)
          ) {
            apply(chapter, data);
            count += 1;
          }
        }
        return { count };
      },
    },
    consumerPlanningVersion: {
      async findFirst({ where, orderBy }) {
        const items = state.versions.filter((version) => (
          matches(version.id, where.id) && matches(version.novelId, where.novelId)
        ));
        if (orderBy?.sequence === "desc") items.sort((a, b) => b.sequence - a.sequence);
        return items[0] ? { ...items[0] } : null;
      },
      async findMany({ where, orderBy }) {
        const items = state.versions.filter((version) => version.novelId === where.novelId);
        if (orderBy?.sequence === "desc") items.sort((a, b) => b.sequence - a.sequence);
        return items.map((item) => ({ ...item }));
      },
      async create({ data }) {
        const item = { id: id("plan"), ...data, createdAt: now() };
        state.versions.push(item);
        return { ...item };
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
        const items = state.operations.filter((operation) => (
          matches(operation.id, where.id)
          && matches(operation.novelId, where.novelId)
          && matches(operation.kind, where.kind)
        ));
        if (orderBy?.createdAt === "desc") items.sort((a, b) => b.createdAt - a.createdAt);
        return items[0] ? { ...items[0] } : null;
      },
      async findMany({ where, orderBy, take, select }) {
        const items = state.operations.filter((operation) => (
          matches(operation.novelId, where.novelId)
          && matches(operation.kind, where.kind)
          && matches(operation.status, where.status)
          && matches(operation.actualCreditsMilli, where.actualCreditsMilli)
        ));
        if (orderBy?.createdAt === "desc") items.sort((a, b) => b.createdAt - a.createdAt);
        return items.slice(0, take).map((item) => (
          select?.actualCreditsMilli
            ? { actualCreditsMilli: item.actualCreditsMilli }
            : { ...item }
        ));
      },
      async create({ data }) {
        const item = {
          ...data,
          receivedContent: "",
          actualCreditsMilli: null,
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

class FakeStoryReviewGenerator {
  constructor() {
    this.calls = [];
  }

  async generate(input) {
    this.calls.push(input);
    return {
      conclusion: input.kind === "transition"
        ? "已跳过深度检查，下一段剧情可以继续。"
        : "前五章主线清楚，有一处人物动机需要后续补强。",
      affectedLocations: input.kind === "transition" ? [] : ["第 4 章：主角转变稍快"],
      impactLevel: input.kind === "adjustment" ? "high" : "low",
      changeSummary: input.kind === "adjustment"
        ? "后续目标按用户要求改变。"
        : "只在下一阶段补强人物动机。",
      futureAffected: ["第 6—10 章的推进方式"],
      preserved: ["第 1—5 章正文保持不变", "全书结局保持不变"],
      recommendedAction: "进入下一段剧情，并在第 6 章补充动机。",
      proposedBookSkeleton: null,
      proposedVolumePlan: null,
      proposedCurrentPhase: nextPhase(),
    };
  }
}

const noCreditMeter = {
  async readAvailableCredits() {
    return null;
  },
};

test("stage review creates a proposal and applies only future planning after confirmation", async () => {
  const { db, state } = createMemoryDb();
  const generator = new FakeStoryReviewGenerator();
  const service = new ConsumerStoryReviewService(db, generator, noCreditMeter, new Date(0));
  const checkpoint = await service.getCheckpoint("novel-1");
  assert.equal(checkpoint.required, true);
  assert.equal(checkpoint.kind, "phase");

  const request = { requestKey: crypto.randomUUID(), checkpointKey: checkpoint.key };
  const started = await service.startCheckpointReview("novel-1", request);
  const duplicate = await service.startCheckpointReview("novel-1", request);
  assert.equal(started.shouldExecute, true);
  assert.equal(duplicate.shouldExecute, false);

  const reviewed = await service.executeOperation(started.snapshot.operationId);
  assert.equal(reviewed.status, "succeeded");
  assert.equal(reviewed.stage, "awaiting_confirmation");
  assert.equal(JSON.parse(state.setup.currentPhaseJson).chapterStart, 1);
  const originalChapterContents = state.chapters.map((chapter) => chapter.content);

  const resolved = await service.resolveOperation(
    "novel-1",
    reviewed.operationId,
    { action: "apply_recommendation", expectedPlanningRevision: 10 },
  );
  assert.equal(resolved.stage, "completed");
  assert.equal(state.setup.revision, 11);
  assert.equal(JSON.parse(state.setup.currentPhaseJson).chapterStart, 6);
  assert.deepEqual(state.chapters.map((chapter) => chapter.content), originalChapterContents);
  assert.equal(state.versions.length, 2);
});

test("skipping review still prepares the next phase and an outdated adjustment cannot overwrite it", async () => {
  const { db, state } = createMemoryDb();
  const generator = new FakeStoryReviewGenerator();
  const service = new ConsumerStoryReviewService(db, generator, noCreditMeter, new Date(0));
  const checkpoint = await service.getCheckpoint("novel-1");
  const skipped = await service.skipCheckpointReview("novel-1", {
    requestKey: crypto.randomUUID(),
    checkpointKey: checkpoint.key,
  });
  const transitioned = await service.executeOperation(skipped.snapshot.operationId);
  assert.equal(transitioned.status, "succeeded");
  assert.equal(transitioned.stage, "completed");
  assert.equal(JSON.parse(state.setup.currentPhaseJson).chapterStart, 6);
  assert.equal(generator.calls[0].kind, "transition");

  const adjustment = await service.startAdjustment("novel-1", {
    requestKey: crypto.randomUUID(),
    instruction: "让主角决定放弃第一次救援。",
    expectedPlanningRevision: 11,
  });
  const proposed = await service.executeOperation(adjustment.snapshot.operationId);
  state.setup.revision = 12;
  await assert.rejects(
    service.resolveOperation("novel-1", proposed.operationId, {
      action: "apply_recommendation",
      expectedPlanningRevision: 11,
    }),
    /故事规划已经更新/,
  );
  assert.equal(state.chapters.every((chapter) => chapter.content.includes("已经完成")), true);
});

test("a proposal based on older chapter text cannot update future planning", async () => {
  const { db, state } = createMemoryDb();
  const service = new ConsumerStoryReviewService(
    db,
    new FakeStoryReviewGenerator(),
    noCreditMeter,
    new Date(0),
  );
  const adjustment = await service.startAdjustment("novel-1", {
    requestKey: crypto.randomUUID(),
    instruction: "让下一阶段更克制。",
    expectedPlanningRevision: 10,
  });
  const proposed = await service.executeOperation(adjustment.snapshot.operationId);
  state.chapters[4].consumerDraft.content += "用户后来补写的新事实。";

  await assert.rejects(
    service.resolveOperation("novel-1", proposed.operationId, {
      action: "apply_recommendation",
      expectedPlanningRevision: 10,
    }),
    /正文或故事规划已经更新/,
  );
  assert.equal(JSON.parse(state.setup.currentPhaseJson).chapterStart, 1);
  assert.equal(state.versions.length, 0);
});
