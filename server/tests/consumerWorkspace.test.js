const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  ConsumerWorkspaceService,
} = require("../dist/modules/consumerWorkspace/application/workspaceService.js");

function createMemoryWorkspaceDb() {
  let nextId = 1;
  const state = {
    novels: [],
    chapters: [],
    drafts: [],
    candidates: [],
    versions: [],
    operations: [],
  };
  const id = (prefix) => `${prefix}-${nextId++}`;
  const now = () => new Date();
  const findNovel = (novelId) => state.novels.find((item) => item.id === novelId) ?? null;
  const findChapter = (chapterId) => state.chapters.find((item) => item.id === chapterId) ?? null;

  const db = {
    novel: {
      async create({ data, include }) {
        const novel = {
          id: id("novel"),
          title: data.title,
          description: data.description ?? null,
          status: "draft",
          writingMode: data.writingMode ?? "original",
          postGenerationStyleReviewEnabled: data.postGenerationStyleReviewEnabled ?? true,
          createdAt: now(),
          updatedAt: now(),
        };
        state.novels.push(novel);
        return include?._count
          ? { ...novel, _count: { chapters: 0 } }
          : { ...novel };
      },
      async findMany({ orderBy, include } = {}) {
        const novels = [...state.novels];
        if (orderBy?.updatedAt === "desc") {
          novels.sort((a, b) => b.updatedAt - a.updatedAt);
        }
        return novels.map((novel) => ({
          ...novel,
          ...(include?._count
            ? { _count: { chapters: state.chapters.filter((item) => item.novelId === novel.id).length } }
            : {}),
        }));
      },
      async findUnique({ where, include }) {
        const novel = findNovel(where.id);
        if (!novel) return null;
        if (!include) return { ...novel };
        const chapters = state.chapters
          .filter((item) => item.novelId === novel.id)
          .sort((a, b) => a.order - b.order)
          .map((item) => ({
            ...item,
            ...(include.chapters?.include?.consumerDraft
              ? {
                  consumerDraft: state.drafts.find((draft) => draft.chapterId === item.id) ?? null,
                }
              : {}),
          }));
        return {
          ...novel,
          chapters,
          _count: { chapters: chapters.length },
        };
      },
    },
    chapter: {
      async findFirst({ where, orderBy, select }) {
        let chapters = state.chapters.filter((chapter) => (
          (where.id == null || chapter.id === where.id)
          && (where.novelId == null || chapter.novelId === where.novelId)
        ));
        if (orderBy?.order === "desc") {
          chapters = chapters.sort((a, b) => b.order - a.order);
        }
        const chapter = chapters[0];
        if (!chapter) return null;
        return select?.order ? { order: chapter.order } : { ...chapter };
      },
      async create({ data }) {
        const chapter = {
          id: id("chapter"),
          novelId: data.novelId,
          title: data.title,
          content: data.content ?? "",
          order: data.order,
          createdAt: now(),
          updatedAt: now(),
        };
        state.chapters.push(chapter);
        return { ...chapter };
      },
      async findUnique({ where, include }) {
        const chapter = findChapter(where.id);
        if (!chapter) return null;
        if (!include) return { ...chapter };
        return {
          ...chapter,
          consumerDraft: state.drafts.find((item) => item.chapterId === chapter.id) ?? null,
          consumerCandidates: state.candidates
            .filter((item) => item.chapterId === chapter.id)
            .sort((a, b) => b.createdAt - a.createdAt),
          consumerVersions: state.versions
            .filter((item) => item.chapterId === chapter.id)
            .sort((a, b) => b.sequence - a.sequence),
        };
      },
      async update({ where, data }) {
        const chapter = findChapter(where.id);
        if (!chapter) throw new Error("chapter missing");
        Object.assign(chapter, data, { updatedAt: now() });
        return { ...chapter };
      },
    },
    consumerChapterDraft: {
      async create({ data }) {
        const draft = {
          id: id("draft"),
          chapterId: data.chapterId,
          content: data.content ?? "",
          revision: data.revision ?? 0,
          cursorStart: data.cursorStart ?? null,
          cursorEnd: data.cursorEnd ?? null,
          baseVersionId: data.baseVersionId ?? null,
          source: data.source ?? "manual",
          createdAt: now(),
          updatedAt: now(),
        };
        state.drafts.push(draft);
        return { ...draft };
      },
      async upsert({ where, create, update }) {
        const draft = state.drafts.find((item) => item.chapterId === where.chapterId);
        if (!draft) return this.create({ data: create });
        Object.assign(draft, update);
        return { ...draft };
      },
      async updateMany({ where, data }) {
        const draft = state.drafts.find((item) => (
          item.chapterId === where.chapterId && item.revision === where.revision
        ));
        if (!draft) return { count: 0 };
        Object.assign(draft, data, {
          revision: draft.revision + (data.revision?.increment ?? 0),
          updatedAt: now(),
        });
        return { count: 1 };
      },
      async findUnique({ where }) {
        const draft = state.drafts.find((item) => item.chapterId === where.chapterId);
        return draft ? { ...draft } : null;
      },
      async update({ where, data }) {
        const draft = state.drafts.find((item) => item.chapterId === where.chapterId);
        if (!draft) throw new Error("draft missing");
        Object.assign(draft, data, {
          revision: data.revision?.increment
            ? draft.revision + data.revision.increment
            : data.revision ?? draft.revision,
          updatedAt: now(),
        });
        return { ...draft };
      },
    },
    consumerChapterCandidate: {
      async create({ data }) {
        const candidate = {
          id: id("candidate"),
          chapterId: data.chapterId,
          content: data.content,
          instruction: data.instruction ?? null,
          source: data.source ?? "ai_revision",
          status: "pending",
          operationId: data.operationId ?? null,
          resolvedAt: null,
          createdAt: now(),
        };
        state.candidates.push(candidate);
        return { ...candidate };
      },
      async findFirst({ where }) {
        const candidate = state.candidates.find((item) => (
          item.id === where.id && item.chapterId === where.chapterId
        ));
        return candidate ? { ...candidate } : null;
      },
      async updateMany({ where, data }) {
        const candidate = state.candidates.find((item) => (
          item.id === where.id && item.status === where.status
        ));
        if (!candidate) return { count: 0 };
        Object.assign(candidate, data);
        return { count: 1 };
      },
    },
    consumerChapterVersion: {
      async findFirst({ where, orderBy }) {
        const versions = state.versions.filter((item) => item.chapterId === where.chapterId);
        if (where.id) {
          return versions.find((item) => item.id === where.id) ?? null;
        }
        if (orderBy?.sequence === "desc") {
          versions.sort((a, b) => b.sequence - a.sequence);
        }
        return versions[0] ? { ...versions[0] } : null;
      },
      async create({ data }) {
        const version = {
          id: id("version"),
          chapterId: data.chapterId,
          sequence: data.sequence,
          title: data.title,
          content: data.content,
          contentHash: data.contentHash,
          reason: data.reason,
          sourceCandidateId: data.sourceCandidateId ?? null,
          operationId: data.operationId ?? null,
          createdAt: now(),
        };
        state.versions.push(version);
        return { ...version };
      },
      async findMany({ where, orderBy }) {
        const versions = state.versions.filter((item) => item.chapterId === where.chapterId);
        if (orderBy?.sequence === "asc") versions.sort((a, b) => a.sequence - b.sequence);
        return versions.map((item) => ({ ...item }));
      },
    },
    consumerCreationOperation: {
      async findFirst({ where }) {
        return state.operations.find((operation) => (
          operation.id === where.id
          && operation.novelId === where.novelId
          && (
            where.OR
              ? operation.chapterId === where.OR[0].chapterId || operation.chapterId == null
              : where.chapterId == null || operation.chapterId === where.chapterId
          )
        )) ?? null;
      },
    },
    async $transaction(operation) {
      return operation(db);
    },
  };
  return { db, state };
}

test("consumer workspace keeps drafts, candidates and immutable versions separate", async () => {
  const { db } = createMemoryWorkspaceDb();
  const service = new ConsumerWorkspaceService(db);

  const novel = await service.createNovel({
    title: "雾城来信",
    description: "一个普通人收到未来寄来的信。",
  });
  const initial = await service.createChapter(novel.id, {
    title: "第一章 雨夜",
    content: "旧正文",
  });

  const savedDraft = await service.saveDraft(novel.id, initial.chapter.id, {
    content: "用户正在编辑的新正文",
    expectedRevision: initial.draft.revision,
    cursorStart: 10,
    cursorEnd: 10,
  });
  assert.equal(savedDraft.revision, 1);

  const beforeCommit = await service.getChapterWorkspace(novel.id, initial.chapter.id);
  assert.equal(beforeCommit.chapter.content, "旧正文");
  assert.equal(beforeCommit.draft.content, "用户正在编辑的新正文");
  assert.equal(beforeCommit.versions.length, 0);
  const exportedBeforeCommit = await service.exportNovel(novel.id, "txt");
  assert.match(exportedBeforeCommit.content, /用户正在编辑的新正文/);
  assert.doesNotMatch(exportedBeforeCommit.content, /旧正文/);

  await assert.rejects(
    () => service.saveDraft(novel.id, initial.chapter.id, {
      content: "来自过期窗口的内容",
      expectedRevision: 0,
    }),
    (error) => error?.statusCode === 409,
  );

  const committed = await service.commitDraft(novel.id, initial.chapter.id, {
    expectedRevision: savedDraft.revision,
    reason: "chapter_confirm",
  });
  assert.equal(committed.chapter.content, "用户正在编辑的新正文");
  assert.equal(committed.versions.length, 1);
  assert.match(committed.versions[0].contentHash, /^[a-f0-9]{64}$/);

  const candidate = await service.createCandidate(novel.id, initial.chapter.id, {
    content: "AI 给出的候选修改",
    instruction: "增强雨夜的紧张感",
    source: "ai_revision",
  });
  const beforeAdopt = await service.getChapterWorkspace(novel.id, initial.chapter.id);
  assert.equal(beforeAdopt.chapter.content, "用户正在编辑的新正文");
  assert.equal(beforeAdopt.draft.content, "用户正在编辑的新正文");
  assert.equal(beforeAdopt.candidates[0].status, "pending");

  const adopted = await service.resolveCandidate(
    novel.id,
    initial.chapter.id,
    candidate.id,
    {
      action: "adopt",
      expectedRevision: beforeAdopt.draft.revision,
    },
  );
  assert.equal(adopted.chapter.content, "AI 给出的候选修改");
  assert.equal(adopted.draft.content, "AI 给出的候选修改");
  assert.equal(adopted.candidates[0].status, "adopted");
  assert.equal(adopted.versions.length, 2);

  const restored = await service.restoreVersion(
    novel.id,
    initial.chapter.id,
    committed.versions[0].id,
    adopted.draft.revision,
  );
  assert.equal(restored.chapter.content, "用户正在编辑的新正文");
  assert.equal(restored.draft.content, "用户正在编辑的新正文");
  assert.equal(restored.versions.length, 3);
  assert.equal(restored.versions[0].reason, "restored_from_1");

  const storedVersions = await db.consumerChapterVersion.findMany({
    where: { chapterId: initial.chapter.id },
    orderBy: { sequence: "asc" },
  });
  assert.deepEqual(
    storedVersions.map((version) => [version.sequence, version.content]),
    [
      [1, "用户正在编辑的新正文"],
      [2, "AI 给出的候选修改"],
      [3, "用户正在编辑的新正文"],
    ],
  );
});

test("stale AI candidate cannot overwrite a newer user draft", async () => {
  const { db, state } = createMemoryWorkspaceDb();
  const service = new ConsumerWorkspaceService(db);
  const novel = await service.createNovel({ title: "雾城来信" });
  const initial = await service.createChapter(novel.id, {
    title: "第一章",
    content: "候选生成时的正文",
  });
  const operationId = "revision-operation";
  state.operations.push({
    id: operationId,
    novelId: novel.id,
    chapterId: initial.chapter.id,
    kind: "consumer_chapter_revision",
    inputJson: JSON.stringify({
      baseRevision: initial.draft.revision,
      baseContentHash: createHash("sha256")
        .update(initial.draft.content, "utf8")
        .digest("hex"),
    }),
  });
  const candidate = await service.createCandidate(novel.id, initial.chapter.id, {
    content: "基于旧正文生成的修改建议",
    source: "ai_revision",
    operationId,
  });
  const newerDraft = await service.saveDraft(novel.id, initial.chapter.id, {
    content: "用户后来重新修改过的正文",
    expectedRevision: initial.draft.revision,
  });

  await assert.rejects(
    service.resolveCandidate(novel.id, initial.chapter.id, candidate.id, {
      action: "adopt",
      expectedRevision: newerDraft.revision,
    }),
    (error) => error?.statusCode === 409,
  );
  const workspace = await service.getChapterWorkspace(novel.id, initial.chapter.id);
  assert.equal(workspace.draft.content, "用户后来重新修改过的正文");
  assert.equal(workspace.candidates[0].status, "pending");
});
