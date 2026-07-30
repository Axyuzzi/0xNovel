const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const {
  ConsumerSegmentRunService,
} = require("../dist/modules/consumerProduction/application/segmentRun/segmentRunService.js");

function createFixture({ pauseAfterFirst = false, failFinalCommitOnce = false } = {}) {
  let sequence = 1;
  const now = () => new Date();
  const state = {
    setup: {
      novelId: "novel-1",
      status: "completed",
      revision: 4,
      currentPhaseJson: JSON.stringify({
        name: "长安破局",
        chapterStart: 7,
        chapterEnd: 9,
        objective: "主角查明账册来源并取得第一份证据。",
        openingState: "主角刚刚找到可疑账册。",
        beats: [
          { order: 1, event: "追查账册", purpose: "建立目标" },
          { order: 2, event: "遭遇阻拦", purpose: "提升压力" },
          { order: 3, event: "取得证据", purpose: "完成阶段" },
        ],
        characterChanges: ["主角决定主动反击。"],
        endingState: "主角带着证据离开长安。",
      }),
    },
    chapters: [{
      id: "chapter-6",
      novelId: "novel-1",
      order: 6,
      title: "第六章",
      consumerDraft: {
        chapterId: "chapter-6",
        content: "已经完成的第六章正文。",
        revision: 2,
      },
    }],
    runs: [],
    operations: [],
    commits: [],
  };

  const matches = (value, condition) => {
    if (condition === undefined) return true;
    if (condition && typeof condition === "object" && Array.isArray(condition.in)) {
      return condition.in.includes(value);
    }
    return value === condition;
  };
  const update = (record, data) => {
    Object.assign(record, data, { updatedAt: now() });
    return { ...record };
  };
  const findRun = (where) => state.runs.find((run) => (
    matches(run.id, where.id)
    && matches(run.novelId, where.novelId)
    && matches(run.requestKey, where.requestKey)
    && matches(run.status, where.status)
  ));

  const db = {
    consumerStorySetup: {
      async findUnique({ where }) {
        return state.setup.novelId === where.novelId ? { ...state.setup } : null;
      },
    },
    chapter: {
      async findFirst({ where, orderBy }) {
        const chapters = state.chapters.filter((chapter) => (
          matches(chapter.id, where.id)
          && matches(chapter.novelId, where.novelId)
          && matches(chapter.order, where.order)
        ));
        if (orderBy?.order === "desc") chapters.sort((a, b) => b.order - a.order);
        return chapters[0] ? structuredClone(chapters[0]) : null;
      },
    },
    consumerSegmentRun: {
      async findUnique({ where }) {
        const run = findRun(where);
        return run ? { ...run } : null;
      },
      async findFirst({ where, orderBy }) {
        const runs = state.runs.filter((run) => (
          matches(run.id, where.id)
          && matches(run.novelId, where.novelId)
          && matches(run.status, where.status)
        ));
        if (orderBy?.createdAt === "desc") {
          runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return runs[0] ? { ...runs[0] } : null;
      },
      async create({ data }) {
        const run = {
          operationIdsJson: "[]",
          status: "created",
          currentChapterId: null,
          currentChapterOrder: null,
          currentOperationId: null,
          pauseRequestedAt: null,
          errorMessage: null,
          startedAt: null,
          finishedAt: null,
          createdAt: now(),
          updatedAt: now(),
          ...data,
        };
        state.runs.push(run);
        return { ...run };
      },
      async update({ where, data }) {
        const run = findRun(where);
        if (!run) throw new Error("segment run missing");
        return update(run, data);
      },
      async updateMany({ where, data }) {
        const runs = state.runs.filter((run) => (
          matches(run.id, where.id)
          && matches(run.novelId, where.novelId)
          && matches(run.status, where.status)
        ));
        runs.forEach((run) => update(run, data));
        return { count: runs.length };
      },
    },
    consumerCreationOperation: {
      async findMany({ where }) {
        return state.operations
          .filter((operation) => where.id.in.includes(operation.id))
          .map((operation) => ({ ...operation }));
      },
    },
  };

  let service;
  let executeCount = 0;
  const snapshot = (operation) => ({
    operationId: operation.id,
    chapterId: operation.chapterId,
    status: operation.status,
    errorMessage: operation.errorMessage ?? null,
  });
  const chapterProduction = {
    async startNextChapter(novelId, sourceChapterId) {
      const source = state.chapters.find((chapter) => chapter.id === sourceChapterId);
      const order = source.order + 1;
      const chapter = {
        id: `chapter-${order}`,
        novelId,
        order,
        title: `第${order}章`,
        consumerDraft: {
          chapterId: `chapter-${order}`,
          content: "",
          revision: 0,
        },
      };
      state.chapters.push(chapter);
      const operation = {
        id: `operation-${sequence++}`,
        chapterId: chapter.id,
        status: "created",
        errorMessage: null,
        actualCreditsMilli: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        llmCallCount: null,
      };
      state.operations.push(operation);
      return { snapshot: snapshot(operation), shouldExecute: true };
    },
    async resumeChapter() {
      throw new Error("test should not resume a completed chapter");
    },
    async getLatestForChapter(novelId, chapterId) {
      const operation = [...state.operations].reverse().find((item) => (
        item.chapterId === chapterId
        && state.chapters.some((chapter) => chapter.id === chapterId && chapter.novelId === novelId)
      ));
      return operation ? snapshot(operation) : null;
    },
    async executeOperation(operationId) {
      executeCount += 1;
      const operation = state.operations.find((item) => item.id === operationId);
      const chapter = state.chapters.find((item) => item.id === operation.chapterId);
      chapter.consumerDraft.content = `第${chapter.order}章正文`;
      chapter.consumerDraft.revision += 1;
      Object.assign(operation, {
        status: "succeeded",
        actualCreditsMilli: 10,
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
        llmCallCount: 3,
      });
      if (pauseAfterFirst && executeCount === 1) {
        await service.requestPause("novel-1", state.runs[0].id);
      }
      return snapshot(operation);
    },
  };
  const workspace = {
    async commitDraft(novelId, chapterId, input) {
      if (failFinalCommitOnce) {
        failFinalCommitOnce = false;
        throw new Error("simulated final commit failure");
      }
      const chapter = state.chapters.find((item) => item.id === chapterId);
      chapter.content = chapter.consumerDraft.content;
      chapter.consumerDraft.revision += 1;
      state.commits.push({ novelId, chapterId, input });
    },
  };
  service = new ConsumerSegmentRunService(
    db,
    chapterProduction,
    workspace,
    new Date(0),
  );
  return { service, state, db, chapterProduction, workspace };
}

async function startRun(service) {
  return service.start("novel-1", {
    requestKey: randomUUID(),
    sourceChapterId: "chapter-6",
    expectedRevision: 2,
    expectedPlanningRevision: 4,
  });
}

test("segment run writes each remaining phase chapter and aggregates usage", async () => {
  const { service, state } = createFixture();
  const started = await startRun(service);
  assert.equal(started.shouldExecute, true);

  const completed = await service.execute(started.snapshot.id);

  assert.equal(completed.status, "completed");
  assert.equal(completed.completedChapters, 3);
  assert.equal(completed.totalChapters, 3);
  assert.equal(completed.completedThroughOrder, 9);
  assert.equal(completed.actualCredits, 0.03);
  assert.deepEqual(completed.tokenUsage, {
    promptTokens: 300,
    completionTokens: 600,
    totalTokens: 900,
    callCount: 9,
  });
  assert.deepEqual(
    state.chapters.map((chapter) => chapter.order),
    [6, 7, 8, 9],
  );
  assert.equal(state.commits.length, 1);
  assert.equal(state.commits[0].chapterId, "chapter-9");
});

test("segment run pauses after the current chapter and resumes from the next one", async () => {
  const { service } = createFixture({ pauseAfterFirst: true });
  const started = await startRun(service);

  const paused = await service.execute(started.snapshot.id);
  assert.equal(paused.status, "paused");
  assert.equal(paused.completedThroughOrder, 7);
  assert.equal(paused.completedChapters, 1);

  const resumed = await service.resume("novel-1", paused.id);
  assert.equal(resumed.shouldExecute, true);
  const completed = await service.execute(paused.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.completedThroughOrder, 9);
  assert.equal(completed.completedChapters, 3);
});

test("segment run reuses a target chapter created before child-operation tracking", async () => {
  const { service, state, chapterProduction } = createFixture();
  const started = await startRun(service);
  await chapterProduction.startNextChapter("novel-1", "chapter-6");

  const completed = await service.execute(started.snapshot.id);

  assert.equal(completed.status, "completed");
  assert.deepEqual(
    state.chapters.map((chapter) => chapter.order),
    [6, 7, 8, 9],
  );
  assert.equal(state.operations.length, 3);
});

test("segment run retries only the local final commit after a commit failure", async () => {
  const { service, state } = createFixture({ failFinalCommitOnce: true });
  const started = await startRun(service);

  const paused = await service.execute(started.snapshot.id);
  assert.equal(paused.status, "paused");
  assert.equal(paused.completedThroughOrder, 9);
  assert.equal(state.operations.length, 3);

  const resumed = await service.resume("novel-1", paused.id);
  assert.equal(resumed.shouldExecute, true);
  const completed = await service.execute(paused.id);
  assert.equal(completed.status, "completed");
  assert.equal(state.operations.length, 3);
  assert.equal(state.commits.length, 1);
});

test("segment run from an older process is recovered as paused", async () => {
  const { service, state, db, chapterProduction, workspace } = createFixture();
  await startRun(service);
  state.runs[0].status = "running";
  const restartedService = new ConsumerSegmentRunService(
    db,
    chapterProduction,
    workspace,
    new Date(state.runs[0].createdAt.getTime() + 1),
  );

  const recovered = await restartedService.getLatest("novel-1");

  assert.equal(recovered.status, "paused");
  assert.ok(recovered.pauseRequestedAt);
});

test("segment run recovered after restart can resume into a new execution epoch", async () => {
  const { service, state, db, chapterProduction, workspace } = createFixture();
  const started = await startRun(service);
  state.runs[0].status = "running";
  const restartedService = new ConsumerSegmentRunService(
    db,
    chapterProduction,
    workspace,
    new Date(state.runs[0].createdAt.getTime() + 1),
  );
  const recovered = await restartedService.getLatest("novel-1");
  assert.equal(recovered.status, "paused");

  const resumed = await restartedService.resume("novel-1", started.snapshot.id);
  assert.equal(resumed.shouldExecute, true);
  assert.equal(resumed.snapshot.status, "created");

  const completed = await restartedService.execute(started.snapshot.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.completedThroughOrder, 9);
});
