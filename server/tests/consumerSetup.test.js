const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ConsumerSetupService,
} = require("../dist/modules/consumerSetup/application/setupService.js");

function createMemorySetupDb() {
  let nextId = 1;
  const now = () => new Date();
  const id = (prefix) => `${prefix}-${nextId++}`;
  const state = {
    novels: [{
      id: "novel-1",
      title: "暂定故事",
      description: "一个普通人能够看见别人最后一天的记忆。",
      estimatedChapterCount: null,
      styleTone: null,
      createdAt: now(),
      updatedAt: now(),
    }],
    setups: [],
    operations: [],
    chapters: [],
    drafts: [],
    candidates: [],
    versions: [],
  };

  function matches(value, condition) {
    if (condition && typeof condition === "object" && Array.isArray(condition.in)) {
      return condition.in.includes(value);
    }
    if (condition && typeof condition === "object" && "not" in condition) {
      return value !== condition.not;
    }
    return condition === undefined || value === condition;
  }

  function apply(target, data) {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in value) {
        target[key] = (target[key] ?? 0) + value.increment;
      } else {
        target[key] = value;
      }
    }
    target.updatedAt = now();
  }

  const db = {
    novel: {
      async findUnique({ where }) {
        return state.novels.find((item) => item.id === where.id) ?? null;
      },
      async update({ where, data }) {
        const novel = state.novels.find((item) => item.id === where.id);
        if (!novel) throw new Error("novel missing");
        apply(novel, data);
        return { ...novel };
      },
    },
    consumerStorySetup: {
      async upsert({ where, create, update }) {
        let setup = state.setups.find((item) => item.novelId === where.novelId);
        if (!setup) {
          setup = {
            id: id("setup"),
            novelId: create.novelId,
            idea: create.idea,
            step: "story_direction",
            status: "awaiting_generation",
            revision: 0,
            directionsJson: null,
            selectedDirectionJson: null,
            bookSkeletonJson: null,
            volumePlanJson: null,
            currentPhaseJson: null,
            firstChapterJson: null,
            firstChapterId: null,
            firstChapterCandidateId: null,
            activeOperationId: null,
            lastActualCreditsMilli: null,
            lastError: null,
            createdAt: now(),
            updatedAt: now(),
          };
          state.setups.push(setup);
        } else {
          apply(setup, update);
        }
        return { ...setup };
      },
      async findUnique({ where }) {
        const setup = state.setups.find((item) => (
          where.id ? item.id === where.id : item.novelId === where.novelId
        ));
        return setup ? { ...setup } : null;
      },
      async updateMany({ where, data }) {
        const setup = state.setups.find((item) => (
          matches(item.id, where.id)
          && matches(item.revision, where.revision)
          && matches(item.step, where.step)
          && matches(item.status, where.status)
          && matches(item.activeOperationId, where.activeOperationId)
        ));
        if (!setup) return { count: 0 };
        apply(setup, data);
        return { count: 1 };
      },
    },
    consumerCreationOperation: {
      async findUnique({ where }) {
        const operation = state.operations.find((item) => (
          where.id ? item.id === where.id : item.requestKey === where.requestKey
        ));
        return operation ? { ...operation } : null;
      },
      async findMany({ where, orderBy, take, select }) {
        let items = state.operations.filter((item) => (
          matches(item.kind, where.kind)
          && matches(item.status, where.status)
          && matches(item.actualCreditsMilli, where.actualCreditsMilli)
        ));
        if (orderBy?.createdAt === "desc") {
          items.sort((left, right) => right.createdAt - left.createdAt);
        }
        return items.slice(0, take).map((item) => (
          select?.actualCreditsMilli
            ? { actualCreditsMilli: item.actualCreditsMilli }
            : { ...item }
        ));
      },
      async create({ data }) {
        const operation = {
          ...data,
          chapterId: data.chapterId ?? null,
          receivedContent: data.receivedContent ?? "",
          actualCreditsMilli: data.actualCreditsMilli ?? null,
          relayRequestId: data.relayRequestId ?? null,
          resultRefType: data.resultRefType ?? null,
          resultRefId: data.resultRefId ?? null,
          errorCode: data.errorCode ?? null,
          finishedAt: data.finishedAt ?? null,
          createdAt: now(),
          updatedAt: now(),
        };
        state.operations.push(operation);
        return { ...operation };
      },
      async update({ where, data }) {
        const operation = state.operations.find((item) => item.id === where.id);
        if (!operation) throw new Error("operation missing");
        apply(operation, data);
        return { ...operation };
      },
      async updateMany({ where, data }) {
        const operation = state.operations.find((item) => (
          matches(item.id, where.id) && matches(item.status, where.status)
        ));
        if (!operation) return { count: 0 };
        apply(operation, data);
        return { count: 1 };
      },
    },
    chapter: {
      async findFirst({ where, orderBy, select }) {
        let chapters = state.chapters.filter((item) => item.novelId === where.novelId);
        if (orderBy?.order === "desc") chapters.sort((a, b) => b.order - a.order);
        const chapter = chapters[0];
        return chapter && select?.order ? { order: chapter.order } : chapter ?? null;
      },
      async create({ data }) {
        const chapter = {
          id: id("chapter"),
          ...data,
          createdAt: now(),
          updatedAt: now(),
        };
        state.chapters.push(chapter);
        return { ...chapter };
      },
      async findUnique({ where }) {
        return state.chapters.find((item) => item.id === where.id) ?? null;
      },
      async update({ where, data }) {
        const chapter = state.chapters.find((item) => item.id === where.id);
        if (!chapter) throw new Error("chapter missing");
        apply(chapter, data);
        return { ...chapter };
      },
    },
    consumerChapterDraft: {
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
    },
    consumerChapterCandidate: {
      async create({ data }) {
        const candidate = {
          id: id("candidate"),
          status: "pending",
          resolvedAt: null,
          createdAt: now(),
          ...data,
        };
        state.candidates.push(candidate);
        return { ...candidate };
      },
      async findFirst({ where }) {
        return state.candidates.find((item) => (
          item.id === where.id && item.chapterId === where.chapterId
        )) ?? null;
      },
      async updateMany({ where, data }) {
        const candidate = state.candidates.find((item) => (
          matches(item.id, where.id) && matches(item.status, where.status)
        ));
        if (!candidate) return { count: 0 };
        apply(candidate, data);
        return { count: 1 };
      },
    },
    consumerChapterVersion: {
      async create({ data }) {
        const version = { id: id("version"), ...data, createdAt: now() };
        state.versions.push(version);
        return { ...version };
      },
    },
    async $transaction(callback) {
      return callback(db);
    },
  };

  return { db, state };
}

function artifacts() {
  const directions = {
    directions: [
      {
        id: "memory-rescue",
        title: "最后一天的记忆",
        premise: "看见死者记忆的普通人试图阻止下一场事故。",
        protagonist: "事故档案馆的普通管理员",
        centralConflict: "每次救人都会让他失去自己的一段记忆。",
        readerAppeal: "在倒计时破案中选择谁值得被拯救。",
        tone: "克制、悬疑、带温度",
        development: "从单次救援走向追查记忆灾难的源头。",
        coreAdvantage: "能读取他人最后一天的记忆。",
        advantageLimit: "每次读取都会损失自己的一段记忆。",
        payoffPattern: "利用记忆线索抢在事故发生前救人。",
        progressionPath: "从处理单起事故到追查记忆灾难的源头。",
        recommendedLength: "约 5 卷，150 章",
        estimatedVolumes: 5,
        estimatedChapters: 150,
      },
      {
        id: "memory-trade",
        title: "记忆典当行",
        premise: "普通人用别人的最后记忆换取改写现实的机会。",
        protagonist: "负债的深夜代驾",
        centralConflict: "每次改写都会创造一个更难偿还的结果。",
        readerAppeal: "每个选择都带来意外代价。",
        tone: "都市、奇诡、强反转",
        development: "从私人愿望走向一座城市的记忆交易网络。",
        coreAdvantage: "能用他人的最后记忆改写一次现实选择。",
        advantageLimit: "每次改写都会产生无法预测且必须偿还的后果。",
        payoffPattern: "利用记忆反转困局，并面对选择带来的新代价。",
        progressionPath: "从解决私人困境到摧毁城市记忆交易网络。",
        recommendedLength: "约 4 卷，120 章",
        estimatedVolumes: 4,
        estimatedChapters: 120,
      },
      {
        id: "memory-witness",
        title: "无人记得的证人",
        premise: "只有主角记得那些从现实中消失的人。",
        protagonist: "社区民警",
        centralConflict: "证明消失者存在会让更多人被现实抹去。",
        readerAppeal: "追查真相同时守住身边人的存在。",
        tone: "现实、紧张、情感浓烈",
        development: "从一名失踪者走向现实规则背后的集体选择。",
        coreAdvantage: "只有主角保留被现实抹去之人的完整记忆。",
        advantageLimit: "每次公开证据都可能让新的关系从现实中消失。",
        payoffPattern: "找回被抹去的人与证据，同时守住重要关系。",
        progressionPath: "从证明一人存在到挑战抹除记忆的现实规则。",
        recommendedLength: "约 6 卷，180 章",
        estimatedVolumes: 6,
        estimatedChapters: 180,
      },
    ],
  };
  const bookSkeleton = {
    corePromise: "每一次救援都揭开事故背后的记忆网络。",
    protagonistArc: "从逃避责任的旁观者成长为愿意承担代价的守护者。",
    ending: "主角公开真相并找到保留自我与拯救他人的方法。",
    acts: [1, 2, 3].map((order) => ({
      order,
      name: `第${order}幕`,
      goal: `完成第${order}阶段调查`,
      turningPoint: `第${order}阶段发生不可逆变化`,
      outcome: `主角进入第${order + 1}阶段`,
    })),
    majorCharacters: [{
      name: "林默",
      role: "主角",
      arc: "从旁观者成为主动承担代价的人。",
    }],
  };
  const volumePlan = {
    volumes: [{
      order: 1,
      title: "雨夜来信",
      goal: "发现能力并救下第一个目标。",
      mainConflict: "记忆显示的凶手与现实证据冲突。",
      turningPoint: "主角发现自己的记忆也被篡改。",
      endingHook: "下一名受害者是主角最亲近的人。",
      estimatedChapters: 30,
    }],
  };
  const currentPhase = {
    name: "第一次救援",
    chapterStart: 1,
    chapterEnd: 5,
    objective: "让主角相信记忆预警并决定行动。",
    openingState: "主角把异常记忆当成疲劳幻觉。",
    beats: [1, 2, 3].map((order) => ({
      order,
      event: `第${order}个因果事件推动调查`,
      purpose: `让主角完成第${order}次认知变化`,
    })),
    characterChanges: ["主角从怀疑转为主动验证。"],
    endingState: "主角救人成功，却失去一段自己的记忆。",
  };
  const firstChapter = {
    title: "第一章 雨夜的陌生记忆",
    content: "雨落在档案馆的玻璃上。".repeat(80),
    summary: "林默在雨夜看见陌生人的最后记忆，并发现事故将在明天发生。",
  };
  return { directions, bookSkeleton, volumePlan, currentPhase, firstChapter };
}

class FakeGenerator {
  constructor() {
    this.calls = [];
    this.failNext = false;
    this.output = artifacts();
  }

  async generate(step) {
    this.calls.push(step);
    if (this.failNext) {
      this.failNext = false;
      throw new Error("模拟生成失败");
    }
    const byStep = {
      story_direction: this.output.directions,
      book_skeleton: this.output.bookSkeleton,
      volume_plan: this.output.volumePlan,
      current_phase: this.output.currentPhase,
      first_chapter: this.output.firstChapter,
    };
    return { artifact: byStep[step], relayRequestId: null };
  }
}

const noCreditMeter = {
  async readAvailableCredits() {
    return null;
  },
};

test("consumer setup advances one confirmed paid step at a time and adopts first chapter only at the end", async () => {
  const { db, state } = createMemorySetupDb();
  const generator = new FakeGenerator();
  const service = new ConsumerSetupService(db, generator, noCreditMeter, new Date(0));
  let snapshot = await service.getSnapshot("novel-1");

  for (const step of [
    "story_direction",
    "book_skeleton",
    "volume_plan",
    "current_phase",
    "first_chapter",
  ]) {
    const requestKey = crypto.randomUUID();
    snapshot = await service.generate("novel-1", {
      step,
      expectedRevision: snapshot.revision,
      requestKey,
    });
    assert.equal(snapshot.step, step);
    assert.equal(snapshot.status, "awaiting_confirmation");

    const duplicate = await service.generate("novel-1", {
      step,
      expectedRevision: snapshot.revision,
      requestKey,
    });
    assert.equal(duplicate.revision, snapshot.revision);
    assert.equal(generator.calls.filter((item) => item === step).length, 1);

    if (step === "first_chapter") {
      assert.equal(state.chapters[0].content, "");
      assert.equal(state.drafts[0].content, "");
      assert.equal(state.candidates[0].status, "pending");
    }

    snapshot = await service.confirm("novel-1", {
      step,
      expectedRevision: snapshot.revision,
      ...(step === "story_direction"
        ? {
            selectedDirectionId: "memory-rescue",
            title: "最后一天的记忆",
            description: "一个普通人试图阻止记忆里的事故。",
          }
        : {}),
    });
  }

  assert.equal(snapshot.step, "completed");
  assert.equal(snapshot.status, "completed");
  assert.deepEqual(generator.calls, [
    "story_direction",
    "book_skeleton",
    "volume_plan",
    "current_phase",
    "first_chapter",
  ]);
  assert.equal(state.chapters[0].content, artifacts().firstChapter.content);
  assert.equal(state.drafts[0].content, artifacts().firstChapter.content);
  assert.equal(state.candidates[0].status, "adopted");
  assert.equal(state.versions.length, 1);
  assert.equal(state.versions[0].reason, "setup_confirmed");
});

test("failed generation is recoverable only with a new request key", async () => {
  const { db } = createMemorySetupDb();
  const generator = new FakeGenerator();
  generator.failNext = true;
  const service = new ConsumerSetupService(db, generator, noCreditMeter, new Date(0));
  const initial = await service.getSnapshot("novel-1");
  const failedKey = crypto.randomUUID();

  await assert.rejects(
    () => service.generate("novel-1", {
      step: "story_direction",
      expectedRevision: initial.revision,
      requestKey: failedKey,
    }),
    (error) => error?.statusCode === 502,
  );
  const failed = await service.getSnapshot("novel-1");
  assert.equal(failed.status, "failed");
  assert.equal(generator.calls.length, 1);

  const duplicate = await service.generate("novel-1", {
    step: "story_direction",
    expectedRevision: failed.revision,
    requestKey: failedKey,
  });
  assert.equal(duplicate.status, "failed");
  assert.equal(generator.calls.length, 1);

  const recovered = await service.generate("novel-1", {
    step: "story_direction",
    expectedRevision: failed.revision,
    requestKey: crypto.randomUUID(),
  });
  assert.equal(recovered.status, "awaiting_confirmation");
  assert.equal(generator.calls.length, 2);
});

test("story direction generation exposes partial content without starting extra model calls", async () => {
  const { db } = createMemorySetupDb();
  let markStarted;
  let releaseGeneration;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const released = new Promise((resolve) => {
    releaseGeneration = resolve;
  });
  const output = artifacts().directions;
  const generator = {
    calls: 0,
    async generate(step, _context, onDelta) {
      this.calls += 1;
      assert.equal(step, "story_direction");
      await onDelta?.(
        '{"directions":[{"id":"memory-rescue","title":"雨夜记忆","premise":"他能看见陌生人最后一天的记忆","protagonist":"档案管理员林默","centralConflict":"每次救人都会失去自己的记忆',
      );
      markStarted();
      await released;
      return { artifact: output, relayRequestId: null };
    },
  };
  const service = new ConsumerSetupService(db, generator, noCreditMeter, new Date(0));
  const initial = await service.getSnapshot("novel-1");
  const generation = service.generate("novel-1", {
    step: "story_direction",
    expectedRevision: initial.revision,
    requestKey: crypto.randomUUID(),
  });

  await started;
  const streaming = await service.getSnapshot("novel-1");
  assert.equal(streaming.status, "generating");
  assert.equal(streaming.directionPreviews.length, 3);
  assert.equal(streaming.directionPreviews[0].title, "雨夜记忆");
  assert.match(streaming.directionPreviews[0].centralConflict, /失去自己的记忆/);
  assert.equal(streaming.directionPreviews[1].title, "");
  assert.equal(generator.calls, 1);

  releaseGeneration();
  const completed = await generation;
  assert.equal(completed.status, "awaiting_confirmation");
  assert.equal(generator.calls, 1);
});

test("generation left by a previous process becomes outcome_unknown without retrying", async () => {
  const { db, state } = createMemorySetupDb();
  const generator = new FakeGenerator();
  const service = new ConsumerSetupService(db, generator, noCreditMeter, new Date());
  await service.getSnapshot("novel-1");
  const setup = state.setups[0];
  const oldOperation = {
    id: "old-operation",
    requestKey: crypto.randomUUID(),
    novelId: "novel-1",
    kind: "consumer_setup_story_direction",
    status: "running",
    stage: "story_direction",
    actualCreditsMilli: null,
    startedAt: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  state.operations.push(oldOperation);
  setup.status = "generating";
  setup.activeOperationId = oldOperation.id;

  const reconciled = await service.getSnapshot("novel-1");
  assert.equal(reconciled.status, "outcome_unknown");
  assert.match(reconciled.lastError, /无法确认是否产生消费/);
  assert.equal(generator.calls.length, 0);
  assert.equal(oldOperation.status, "outcome_unknown");
});
