const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ConsumerChapterRevisionService,
} = require("../dist/modules/consumerProduction/application/chapterRevisionService.js");
const {
  consumerChapterRevisePrompt,
  consumerChapterRewritePrompt,
} = require("../dist/prompting/prompts/consumer/consumerChapterRevision.prompts.js");

function promptText(asset, input) {
  return asset.render(input)
    .map((message) => String(message.content))
    .join("\n");
}

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

function createMemoryRevisionDb() {
  let nextId = 1;
  const now = () => new Date();
  const id = (prefix) => `${prefix}-${nextId++}`;
  const state = {
    novels: [{
      id: "novel-1",
      title: "最后一天的记忆",
      createdAt: now(),
      updatedAt: now(),
    }],
    setups: [{
      id: "setup-1",
      novelId: "novel-1",
      idea: "一个普通人能够看见别人最后一天的记忆。",
      status: "completed",
      ...setupArtifacts(),
    }],
    chapters: [{
      id: "chapter-1",
      novelId: "novel-1",
      title: "第一章 雨夜记忆",
      content: "已经确认的正式正文",
      order: 1,
      taskSheet: "本章需要让林默第一次看见事故记忆。",
      createdAt: now(),
      updatedAt: now(),
    }],
    drafts: [{
      id: "draft-1",
      chapterId: "chapter-1",
      content: "用户正在编辑的正文。".repeat(30),
      revision: 4,
      source: "manual",
      createdAt: now(),
      updatedAt: now(),
    }],
    candidates: [],
    operations: [],
  };

  function matches(value, condition) {
    if (condition === undefined) return true;
    if (condition && typeof condition === "object" && Array.isArray(condition.in)) {
      return condition.in.includes(value);
    }
    if (condition && typeof condition === "object" && "not" in condition) {
      return value !== condition.not;
    }
    if (condition && typeof condition === "object" && "lt" in condition) {
      return value < condition.lt;
    }
    return value === condition;
  }

  function apply(target, data) {
    Object.assign(target, data, { updatedAt: now() });
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
      async findFirst({ where }) {
        return state.chapters.find((item) => (
          matches(item.id, where.id) && matches(item.novelId, where.novelId)
        )) ?? null;
      },
      async findMany({ where, orderBy, take }) {
        const items = state.chapters.filter((item) => (
          matches(item.novelId, where.novelId) && matches(item.order, where.order)
        ));
        if (orderBy?.order === "desc") items.sort((a, b) => b.order - a.order);
        return items.slice(0, take).map((item) => ({ ...item }));
      },
    },
    consumerChapterDraft: {
      async findUnique({ where }) {
        const item = state.drafts.find((draft) => draft.chapterId === where.chapterId);
        return item ? { ...item } : null;
      },
    },
    consumerChapterCandidate: {
      async findFirst({ where }) {
        const item = state.candidates.find((candidate) => (
          matches(candidate.id, where.id)
          && matches(candidate.chapterId, where.chapterId)
          && matches(candidate.status, where.status)
        ));
        return item ? { ...item } : null;
      },
      async create({ data }) {
        const item = {
          id: id("candidate"),
          ...data,
          status: "pending",
          resolvedAt: null,
          createdAt: now(),
        };
        state.candidates.push(item);
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
        const items = state.operations.filter((item) => (
          matches(item.id, where.id)
          && matches(item.novelId, where.novelId)
          && matches(item.chapterId, where.chapterId)
          && matches(item.kind, where.kind)
        ));
        if (orderBy?.createdAt === "desc") items.sort((a, b) => b.createdAt - a.createdAt);
        return items[0] ? { ...items[0] } : null;
      },
      async findMany({ where, orderBy, take, select }) {
        const items = state.operations.filter((item) => (
          matches(item.kind, where.kind)
          && matches(item.status, where.status)
          && matches(item.actualCreditsMilli, where.actualCreditsMilli)
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

class FakeRevisionGenerator {
  constructor() {
    this.calls = 0;
    this.fail = false;
    this.lastInput = null;
  }

  async generate(input, _operationId, onDelta) {
    this.calls += 1;
    this.lastInput = input;
    await onDelta("修改后的正文第一段。".repeat(30));
    if (this.fail) throw new Error("模拟修改中断");
    const tail = "修改后的正文结尾。".repeat(30);
    await onDelta(tail);
    return "修改后的正文第一段。".repeat(30) + tail;
  }
}

function promptInput() {
  const setup = setupArtifacts();
  const volumePlan = JSON.parse(setup.volumePlanJson);
  volumePlan.volumes.push({
    order: 2,
    title: "远期卷不应进入修改上下文",
    goal: "进入记忆网络核心。",
    mainConflict: "最终敌人公开身份。",
    turningPoint: "揭露全书终局答案。",
    endingHook: "进入结局。",
    estimatedChapters: 30,
  });
  return {
    novelId: "novel-1",
    chapterId: "chapter-15",
    novelTitle: "最后一天的记忆",
    idea: "一个普通人能够看见别人最后一天的记忆。",
    selectedDirection: JSON.parse(setup.selectedDirectionJson),
    bookSkeleton: JSON.parse(setup.bookSkeletonJson),
    volumePlan,
    currentPhase: JSON.parse(setup.currentPhaseJson),
    chapter: {
      order: 15,
      title: "雨夜追踪",
      content: "林默沿着记忆里的路线追到旧车站。".repeat(150),
      taskSheet: "本章让林默确认事故线索，但不能揭露幕后身份。",
    },
    previousChapters: [{
      order: 14,
      title: "失踪的站牌",
      content: `极早内容不应进入上下文。${"普通的上一章中段内容。".repeat(250)}上一章最后，林默在站牌背面找到血迹。`,
    }],
    mode: "revise",
    preset: "natural_language",
    instruction: "让对话更克制，保持事件顺序不变。",
  };
}

test("revision prompts focus on the current volume and distinguish revise from rewrite", () => {
  const input = promptInput();
  const reviseText = promptText(consumerChapterRevisePrompt, input);
  const rewriteText = promptText(consumerChapterRewritePrompt, {
    ...input,
    mode: "rewrite",
  });

  assert.equal(consumerChapterRevisePrompt.version, "v4");
  assert.equal(consumerChapterRewritePrompt.version, "v4");
  assert.match(reviseText, /雨夜来信/);
  assert.match(reviseText, /上一章最后，林默在站牌背面找到血迹/);
  assert.match(reviseText, /尽量保留用户没有要求改变的段落/);
  assert.doesNotMatch(reviseText, /远期卷不应进入修改上下文/);
  assert.doesNotMatch(reviseText, /主角公开真相并保住重要记忆/);
  assert.doesNotMatch(reviseText, /极早内容不应进入上下文/);

  assert.match(rewriteText, /可以重组场景、行动、对话、信息顺序和节奏/);
  assert.match(rewriteText, /不强制每章都卡在冲突爆发前/);
});

test("revision candidate validation strips an outer code fence and rejects truncation", () => {
  const input = promptInput();
  const content = "雨落在车站顶棚上，林默顺着血迹往前走。\n\n".repeat(50);
  const cleaned = consumerChapterRevisePrompt.postValidate(
    `\`\`\`markdown\n${content}\n\`\`\``,
    input,
    {},
  );
  assert.equal(cleaned, content.trim());
  assert.doesNotMatch(cleaned, /```/);
  assert.throws(
    () => consumerChapterRewritePrompt.postValidate(
      "只有几句话，模型随后中断。",
      { ...input, mode: "rewrite" },
      {},
    ),
    /疑似输出中断/,
  );
});

const noCreditMeter = {
  async readAvailableCredits() {
    return null;
  },
};

test("AI revision creates a candidate without overwriting draft or canonical content", async () => {
  const { db, state } = createMemoryRevisionDb();
  const generator = new FakeRevisionGenerator();
  const service = new ConsumerChapterRevisionService(db, generator, noCreditMeter, new Date(0));
  const request = {
    expectedRevision: 4,
    requestKey: crypto.randomUUID(),
    mode: "revise",
    preset: "natural_language",
    instruction: "让语言更自然，保持情节不变。",
  };

  const started = await service.startRevision("novel-1", "chapter-1", request);
  const duplicate = await service.startRevision("novel-1", "chapter-1", request);
  assert.equal(started.shouldExecute, true);
  assert.equal(duplicate.shouldExecute, false);

  const completed = await service.executeOperation(started.snapshot.operationId);
  assert.equal(completed.status, "succeeded");
  assert.equal(state.chapters[0].content, "已经确认的正式正文");
  assert.equal(state.drafts[0].content, "用户正在编辑的正文。".repeat(30));
  assert.equal(state.drafts[0].revision, 4);
  assert.equal(state.candidates.length, 1);
  assert.equal(state.candidates[0].operationId, started.snapshot.operationId);
  assert.match(state.candidates[0].content, /修改后的正文结尾/);
  assert.equal(generator.calls, 1);
});

test("continue adjustment uses the selected candidate and failed generation preserves the current draft", async () => {
  const { db, state } = createMemoryRevisionDb();
  state.candidates.push({
    id: "candidate-source",
    chapterId: "chapter-1",
    content: "第一版修改建议。".repeat(30),
    instruction: "增强情绪",
    source: "ai_revision",
    status: "pending",
    operationId: null,
    resolvedAt: null,
    createdAt: new Date(),
  });
  const generator = new FakeRevisionGenerator();
  generator.fail = true;
  const service = new ConsumerChapterRevisionService(db, generator, noCreditMeter, new Date(0));

  const started = await service.startRevision("novel-1", "chapter-1", {
    expectedRevision: 4,
    requestKey: crypto.randomUUID(),
    mode: "revise",
    preset: "custom",
    instruction: "保留这一版结构，让结尾更克制。",
    sourceCandidateId: "candidate-source",
  });
  const failed = await service.executeOperation(started.snapshot.operationId);
  assert.equal(failed.status, "failed");
  assert.equal(generator.lastInput.chapter.content, "第一版修改建议。".repeat(30));
  assert.equal(state.drafts[0].content, "用户正在编辑的正文。".repeat(30));
  assert.equal(state.candidates.length, 1);
  assert.match(failed.receivedContent, /修改后的正文第一段/);
});
