const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ConsumerChapterProductionService,
} = require("../dist/modules/consumerProduction/application/chapterProductionService.js");

// drainInFlightOperations 是换账号/退出前的数据安全操作：把所有 running 的创作操作
// 标为 outcome_unknown，避免停服务杀掉在途的流式写入后这些操作永远卡在 running。
// 这个测试专门验证 drain 的多行语义，因此用独立的内存 DB（updateMany 支持多行匹配），
// 不复用 consumerChapterProduction.test.js 里只能命中第一行的 mock。

function now() {
  return new Date();
}

function apply(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && "increment" in value) {
      target[key] = (target[key] ?? 0) + value.increment;
    } else {
      target[key] = value;
    }
  }
}

function matches(actual, expected) {
  return expected === undefined || expected === null || actual === expected;
}

function createDrainTestDb(initialOperations) {
  const state = {
    operations: initialOperations.map((item) => ({
      receivedContent: "",
      actualCreditsMilli: null,
      errorCode: null,
      errorMessage: null,
      finishedAt: null,
      createdAt: now(),
      updatedAt: now(),
      ...item,
    })),
  };

  const db = {
    consumerCreationOperation: {
      async findMany({ where, select }) {
        const items = state.operations.filter((item) => (
          matches(item.status, where.status)
        ));
        return items.map((item) => (
          select?.id ? { id: item.id } : { ...item }
        ));
      },
      // 关键：这里要支持多行更新，真实 Prisma 的 updateMany({ where: { status } })
      // 会更新所有匹配行并返回 count。
      async updateMany({ where, data }) {
        let count = 0;
        for (const item of state.operations) {
          if (matches(item.status, where.status)) {
            apply(item, data);
            count += 1;
          }
        }
        return { count };
      },
    },
    async $transaction(callback) {
      return callback(db);
    },
  };
  return { db, state };
}

function makeOperation(overrides) {
  return {
    id: `op_${Math.random().toString(36).slice(2, 10)}`,
    requestKey: `rk_${Math.random().toString(36).slice(2, 10)}`,
    novelId: "novel_1",
    chapterId: "ch_1",
    kind: "consumer_next_chapter",
    status: "running",
    stage: "writing",
    inputJson: JSON.stringify({ mode: "next_chapter", sourceChapterId: "ch_0", task: null }),
    ...overrides,
  };
}

function buildService(db) {
  // generator 和 creditMeter 对 drain 流程无影响，传最小桩。
  const noopGenerator = {
    async createTask() { return null; },
    async writeChapter() {},
    async continueChapter() {},
  };
  const noopCreditMeter = { async readAvailableCredits() { return null; } };
  return new ConsumerChapterProductionService(db, noopGenerator, noopCreditMeter, new Date());
}

test("drainInFlightOperations 把所有 running 操作标为 outcome_unknown", async () => {
  const initial = [
    makeOperation({ id: "op_running_1" }),
    makeOperation({ id: "op_running_2" }),
    makeOperation({ id: "op_created", status: "created" }),
    makeOperation({ id: "op_done", status: "succeeded" }),
  ];
  const { db, state } = createDrainTestDb(initial);
  const service = buildService(db);

  const result = await service.drainInFlightOperations();

  assert.equal(result.drainedCount, 2, "应该排空 2 个 running 操作");
  const drained1 = state.operations.find((item) => item.id === "op_running_1");
  const drained2 = state.operations.find((item) => item.id === "op_running_2");
  assert.equal(drained1.status, "outcome_unknown");
  assert.equal(drained2.status, "outcome_unknown");
  assert.equal(drained1.errorCode, "process_interrupted");
  assert.ok(drained1.errorMessage.includes("换账号"));
  assert.ok(drained1.finishedAt instanceof Date, "应记录结束时间");
});

test("drainInFlightOperations 不影响非 running 操作", async () => {
  const initial = [
    makeOperation({ id: "op_created", status: "created" }),
    makeOperation({ id: "op_succeeded", status: "succeeded" }),
    makeOperation({ id: "op_failed", status: "failed" }),
    makeOperation({ id: "op_already_unknown", status: "outcome_unknown" }),
  ];
  const { db, state } = createDrainTestDb(initial);
  const service = buildService(db);

  const result = await service.drainInFlightOperations();

  assert.equal(result.drainedCount, 0, "没有 running 操作时应返回 0");
  // 确认 created/succeeded/failed/已 outcome_unknown 保持原状，drain 不触碰它们
  assert.equal(state.operations.find((item) => item.id === "op_created").status, "created");
  assert.equal(state.operations.find((item) => item.id === "op_succeeded").status, "succeeded");
  assert.equal(state.operations.find((item) => item.id === "op_failed").status, "failed");
  assert.equal(state.operations.find((item) => item.id === "op_already_unknown").status, "outcome_unknown");
});

test("drainInFlightOperations 在没有操作时安全返回 0", async () => {
  const { db } = createDrainTestDb([]);
  const service = buildService(db);

  const result = await service.drainInFlightOperations();
  assert.equal(result.drainedCount, 0);
});

test("drainInFlightOperations 幂等：重复调用只第一次排空", async () => {
  const initial = [makeOperation({ id: "op_running_1" })];
  const { db } = createDrainTestDb(initial);
  const service = buildService(db);

  const first = await service.drainInFlightOperations();
  const second = await service.drainInFlightOperations();

  assert.equal(first.drainedCount, 1);
  assert.equal(second.drainedCount, 0, "第二次调用时已无 running 操作");
});
