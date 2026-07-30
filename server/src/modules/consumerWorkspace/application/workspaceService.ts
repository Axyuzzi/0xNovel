import { createHash } from "node:crypto";
import {
  countConsumerChapterCharacters,
  type ConsumerChapterCandidate,
  type ConsumerChapterDraft,
  type ConsumerChapterSummary,
  type ConsumerChapterVersion,
  type ConsumerChapterWorkspace,
  type ConsumerCommitDraftRequest,
  type ConsumerCreateCandidateRequest,
  type ConsumerCreateChapterRequest,
  type ConsumerCreateNovelRequest,
  type ConsumerNovelSummary,
  type ConsumerNovelWorkspace,
  type ConsumerResolveCandidateRequest,
  type ConsumerSaveDraftRequest,
} from "@0xnovelagent/shared/types/consumerWorkspace";
import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../../../middleware/errorHandler";

type WorkspaceDb = PrismaClient | Prisma.TransactionClient;

const chapterWorkspaceInclude = {
  consumerDraft: true,
  consumerCandidates: { orderBy: { createdAt: "desc" as const } },
  consumerVersions: { orderBy: { sequence: "desc" as const } },
} satisfies Prisma.ChapterInclude;

type ChapterWorkspaceRecord = Prisma.ChapterGetPayload<{
  include: typeof chapterWorkspaceInclude;
}>;

function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function serializeNovel(
  novel: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    _count?: { chapters: number };
  },
): ConsumerNovelSummary {
  return {
    id: novel.id,
    title: novel.title,
    description: novel.description,
    status: novel.status,
    chapterCount: novel._count?.chapters ?? 0,
    createdAt: novel.createdAt.toISOString(),
    updatedAt: novel.updatedAt.toISOString(),
  };
}

function serializeChapter(
  chapter: {
    id: string;
    novelId: string;
    title: string;
    order: number;
    content: string | null;
    consumerDraft?: { content: string } | null;
    createdAt: Date;
    updatedAt: Date;
  },
): ConsumerChapterSummary {
  return {
    id: chapter.id,
    novelId: chapter.novelId,
    title: chapter.title,
    order: chapter.order,
    content: chapter.content ?? "",
    wordCount: countConsumerChapterCharacters(
      chapter.consumerDraft?.content ?? chapter.content ?? "",
    ),
    createdAt: chapter.createdAt.toISOString(),
    updatedAt: chapter.updatedAt.toISOString(),
  };
}

function serializeDraft(
  draft: {
    id: string;
    chapterId: string;
    content: string;
    revision: number;
    cursorStart: number | null;
    cursorEnd: number | null;
    baseVersionId: string | null;
    source: string;
    updatedAt: Date;
  },
): ConsumerChapterDraft {
  return {
    ...draft,
    updatedAt: draft.updatedAt.toISOString(),
  };
}

function serializeCandidate(
  candidate: {
    id: string;
    chapterId: string;
    content: string;
    instruction: string | null;
    source: string;
    status: string;
    operationId: string | null;
    resolvedAt: Date | null;
    createdAt: Date;
  },
): ConsumerChapterCandidate {
  if (!["pending", "adopted", "rejected"].includes(candidate.status)) {
    throw new AppError("候选稿状态无效。", 500);
  }
  return {
    ...candidate,
    status: candidate.status as ConsumerChapterCandidate["status"],
    resolvedAt: candidate.resolvedAt?.toISOString() ?? null,
    createdAt: candidate.createdAt.toISOString(),
  };
}

function serializeVersion(
  version: {
    id: string;
    chapterId: string;
    sequence: number;
    title: string;
    content: string;
    contentHash: string;
    reason: string;
    sourceCandidateId: string | null;
    operationId: string | null;
    createdAt: Date;
  },
): ConsumerChapterVersion {
  return {
    ...version,
    createdAt: version.createdAt.toISOString(),
  };
}

function serializeChapterWorkspace(chapter: ChapterWorkspaceRecord): ConsumerChapterWorkspace {
  if (!chapter.consumerDraft) {
    throw new AppError("章节草稿尚未准备好。", 500);
  }
  return {
    chapter: serializeChapter(chapter),
    draft: serializeDraft(chapter.consumerDraft),
    candidates: chapter.consumerCandidates.map(serializeCandidate),
    versions: chapter.consumerVersions.map(serializeVersion),
  };
}

async function requireNovel(db: WorkspaceDb, novelId: string) {
  const novel = await db.novel.findUnique({ where: { id: novelId } });
  if (!novel) {
    throw new AppError("作品不存在。", 404);
  }
  return novel;
}

async function requireChapter(db: WorkspaceDb, novelId: string, chapterId: string) {
  const chapter = await db.chapter.findFirst({
    where: { id: chapterId, novelId },
  });
  if (!chapter) {
    throw new AppError("章节不存在。", 404);
  }
  return chapter;
}

async function ensureDraft(
  db: WorkspaceDb,
  chapter: { id: string; content: string | null },
) {
  return db.consumerChapterDraft.upsert({
    where: { chapterId: chapter.id },
    create: {
      chapterId: chapter.id,
      content: chapter.content ?? "",
      source: "manual",
    },
    update: {},
  });
}

async function createVersion(
  tx: Prisma.TransactionClient,
  input: {
    chapterId: string;
    title: string;
    content: string;
    reason: string;
    sourceCandidateId?: string;
    operationId?: string;
  },
) {
  const hash = contentHash(input.content);
  const latest = await tx.consumerChapterVersion.findFirst({
    where: { chapterId: input.chapterId },
    orderBy: { sequence: "desc" },
  });
  if (latest?.contentHash === hash && latest.title === input.title) {
    return latest;
  }
  return tx.consumerChapterVersion.create({
    data: {
      chapterId: input.chapterId,
      sequence: (latest?.sequence ?? 0) + 1,
      title: input.title,
      content: input.content,
      contentHash: hash,
      reason: input.reason,
      sourceCandidateId: input.sourceCandidateId,
      operationId: input.operationId,
    },
  });
}

export class ConsumerWorkspaceService {
  constructor(private readonly db: PrismaClient) {}

  async listNovels(): Promise<ConsumerNovelSummary[]> {
    const novels = await this.db.novel.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { chapters: true } } },
    });
    return novels.map(serializeNovel);
  }

  async createNovel(input: ConsumerCreateNovelRequest): Promise<ConsumerNovelSummary> {
    const novel = await this.db.novel.create({
      data: {
        title: input.title,
        description: input.description,
        writingMode: "original",
        postGenerationStyleReviewEnabled: false,
      },
      include: { _count: { select: { chapters: true } } },
    });
    return serializeNovel(novel);
  }

  async getNovelWorkspace(novelId: string): Promise<ConsumerNovelWorkspace> {
    const novel = await this.db.novel.findUnique({
      where: { id: novelId },
      include: {
        chapters: {
          orderBy: { order: "asc" },
          include: { consumerDraft: true },
        },
        _count: { select: { chapters: true } },
      },
    });
    if (!novel) {
      throw new AppError("作品不存在。", 404);
    }
    return {
      novel: serializeNovel(novel),
      chapters: novel.chapters.map(serializeChapter),
    };
  }

  async exportNovel(
    novelId: string,
    format: "txt" | "markdown",
  ): Promise<{ content: string; fileName: string; contentType: string }> {
    const novel = await this.db.novel.findUnique({
      where: { id: novelId },
      include: {
        chapters: {
          orderBy: { order: "asc" },
          include: {
            consumerDraft: true,
          },
        },
      },
    });
    if (!novel) {
      throw new AppError("作品不存在。", 404);
    }
    const content = format === "markdown"
      ? [
          `# ${novel.title}`,
          novel.description?.trim() || "",
          ...novel.chapters.flatMap((chapter) => [
            `## ${chapter.title}`,
            chapter.consumerDraft?.content ?? chapter.content ?? "",
          ]),
        ].filter(Boolean).join("\n\n")
      : [
          novel.title,
          novel.description?.trim() || "",
          ...novel.chapters.flatMap((chapter) => [
            chapter.title,
            chapter.consumerDraft?.content ?? chapter.content ?? "",
          ]),
        ].filter(Boolean).join("\n\n");
    const safeTitle = novel.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 80) || "我的作品";
    return {
      content,
      fileName: `${safeTitle}.${format === "markdown" ? "md" : "txt"}`,
      contentType: format === "markdown"
        ? "text/markdown; charset=utf-8"
        : "text/plain; charset=utf-8",
    };
  }

  async createChapter(
    novelId: string,
    input: ConsumerCreateChapterRequest,
  ): Promise<ConsumerChapterWorkspace> {
    await requireNovel(this.db, novelId);
    const chapterId = await this.db.$transaction(async (tx) => {
      const latest = await tx.chapter.findFirst({
        where: { novelId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const chapter = await tx.chapter.create({
        data: {
          novelId,
          title: input.title,
          content: input.content ?? "",
          order: (latest?.order ?? 0) + 1,
        },
      });
      await tx.consumerChapterDraft.create({
        data: {
          chapterId: chapter.id,
          content: chapter.content ?? "",
          source: "manual",
        },
      });
      return chapter.id;
    });
    return this.getChapterWorkspace(novelId, chapterId);
  }

  async getChapterWorkspace(
    novelId: string,
    chapterId: string,
  ): Promise<ConsumerChapterWorkspace> {
    const baseChapter = await requireChapter(this.db, novelId, chapterId);
    await ensureDraft(this.db, baseChapter);
    const chapter = await this.db.chapter.findUnique({
      where: { id: chapterId },
      include: chapterWorkspaceInclude,
    });
    if (!chapter) {
      throw new AppError("章节不存在。", 404);
    }
    return serializeChapterWorkspace(chapter);
  }

  async saveDraft(
    novelId: string,
    chapterId: string,
    input: ConsumerSaveDraftRequest,
  ): Promise<ConsumerChapterDraft> {
    const chapter = await requireChapter(this.db, novelId, chapterId);
    await ensureDraft(this.db, chapter);
    const result = await this.db.consumerChapterDraft.updateMany({
      where: { chapterId, revision: input.expectedRevision },
      data: {
        content: input.content,
        cursorStart: input.cursorStart,
        cursorEnd: input.cursorEnd,
        source: "manual",
        revision: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      const current = await this.db.consumerChapterDraft.findUnique({
        where: { chapterId },
      });
      throw new AppError("这段内容已在其他窗口更新，请重新打开后再继续。", 409, {
        currentDraft: current ? serializeDraft(current) : null,
      });
    }
    const draft = await this.db.consumerChapterDraft.findUnique({
      where: { chapterId },
    });
    if (!draft) {
      throw new AppError("草稿保存失败。", 500);
    }
    return serializeDraft(draft);
  }

  async commitDraft(
    novelId: string,
    chapterId: string,
    input: ConsumerCommitDraftRequest,
  ): Promise<ConsumerChapterWorkspace> {
    await this.db.$transaction(async (tx) => {
      const chapter = await requireChapter(tx, novelId, chapterId);
      const draft = await ensureDraft(tx, chapter);
      if (draft.revision !== input.expectedRevision) {
        throw new AppError("草稿已更新，请确认最新内容后再保存为版本。", 409);
      }
      const version = await createVersion(tx, {
        chapterId,
        title: chapter.title,
        content: draft.content,
        reason: input.reason,
      });
      await tx.chapter.update({
        where: { id: chapterId },
        data: { content: draft.content },
      });
      await tx.consumerChapterDraft.update({
        where: { chapterId },
        data: {
          baseVersionId: version.id,
          revision: { increment: 1 },
        },
      });
    });
    return this.getChapterWorkspace(novelId, chapterId);
  }

  async createCandidate(
    novelId: string,
    chapterId: string,
    input: ConsumerCreateCandidateRequest,
  ): Promise<ConsumerChapterCandidate> {
    await requireChapter(this.db, novelId, chapterId);
    if (input.operationId) {
      const operation = await this.db.consumerCreationOperation.findFirst({
        where: {
          id: input.operationId,
          novelId,
          OR: [{ chapterId }, { chapterId: null }],
        },
      });
      if (!operation) {
        throw new AppError("本次创作记录不存在。", 404);
      }
    }
    const candidate = await this.db.consumerChapterCandidate.create({
      data: {
        chapterId,
        content: input.content,
        instruction: input.instruction,
        source: input.source,
        operationId: input.operationId,
      },
    });
    return serializeCandidate(candidate);
  }

  async resolveCandidate(
    novelId: string,
    chapterId: string,
    candidateId: string,
    input: ConsumerResolveCandidateRequest,
  ): Promise<ConsumerChapterWorkspace> {
    await this.db.$transaction(async (tx) => {
      const chapter = await requireChapter(tx, novelId, chapterId);
      const candidate = await tx.consumerChapterCandidate.findFirst({
        where: { id: candidateId, chapterId },
      });
      if (!candidate) {
        throw new AppError("候选稿不存在。", 404);
      }
      const draft = input.action === "adopt"
        ? await ensureDraft(tx, chapter)
        : null;
      if (
        input.action === "adopt"
        && draft
        && draft.revision !== input.expectedRevision
      ) {
        throw new AppError("正文已经修改，这份建议基于旧内容，不能直接采用。", 409);
      }
      if (input.action === "adopt" && draft && candidate.operationId) {
        const operation = await tx.consumerCreationOperation.findFirst({
          where: { id: candidate.operationId, novelId, chapterId },
        });
        if (
          operation
          && ["consumer_chapter_revision", "consumer_chapter_rewrite"].includes(operation.kind)
        ) {
          const operationInput = parseJsonObject(operation.inputJson);
          const baseRevision = operationInput?.baseRevision;
          const baseContentHash = operationInput?.baseContentHash;
          if (
            typeof baseRevision !== "number"
            || typeof baseContentHash !== "string"
            || baseRevision !== draft.revision
            || baseContentHash !== contentHash(draft.content)
          ) {
            throw new AppError("正文已经修改，这份建议基于旧内容，不能直接采用。", 409);
          }
        }
      }
      const claimed = await tx.consumerChapterCandidate.updateMany({
        where: { id: candidateId, status: "pending" },
        data: {
          status: input.action === "adopt" ? "adopted" : "rejected",
          resolvedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new AppError("这份候选稿已经处理过。", 409);
      }
      if (input.action === "reject") {
        return;
      }
      if (!draft) {
        throw new AppError("当前正文不存在。", 500);
      }
      await createVersion(tx, {
        chapterId,
        title: chapter.title,
        content: draft.content,
        reason: "before_candidate_adopt",
      });
      const version = await createVersion(tx, {
        chapterId,
        title: chapter.title,
        content: candidate.content,
        reason: "candidate_adopted",
        sourceCandidateId: candidate.id,
        operationId: candidate.operationId ?? undefined,
      });
      await tx.chapter.update({
        where: { id: chapterId },
        data: { content: candidate.content },
      });
      await tx.consumerChapterDraft.upsert({
        where: { chapterId },
        create: {
          chapterId,
          content: candidate.content,
          baseVersionId: version.id,
          source: "candidate",
          revision: 1,
        },
        update: {
          content: candidate.content,
          baseVersionId: version.id,
          source: "candidate",
          cursorStart: null,
          cursorEnd: null,
          revision: { increment: 1 },
        },
      });
      await tx.consumerChapterCandidate.updateMany({
        where: {
          chapterId,
          status: "pending",
          id: { not: candidate.id },
        },
        data: {
          status: "rejected",
          resolvedAt: new Date(),
        },
      });
    });
    return this.getChapterWorkspace(novelId, chapterId);
  }

  async restoreVersion(
    novelId: string,
    chapterId: string,
    versionId: string,
    expectedRevision: number,
  ): Promise<ConsumerChapterWorkspace> {
    await this.db.$transaction(async (tx) => {
      const chapter = await requireChapter(tx, novelId, chapterId);
      const draft = await ensureDraft(tx, chapter);
      if (draft.revision !== expectedRevision) {
        throw new AppError("正文已更新，请确认最新内容后再恢复历史版本。", 409);
      }
      const sourceVersion = await tx.consumerChapterVersion.findFirst({
        where: { id: versionId, chapterId },
      });
      if (!sourceVersion) {
        throw new AppError("历史版本不存在。", 404);
      }
      const restoredVersion = await createVersion(tx, {
        chapterId,
        title: sourceVersion.title,
        content: sourceVersion.content,
        reason: `restored_from_${sourceVersion.sequence}`,
      });
      await tx.chapter.update({
        where: { id: chapterId },
        data: {
          title: sourceVersion.title,
          content: sourceVersion.content,
        },
      });
      await tx.consumerChapterDraft.update({
        where: { chapterId },
        data: {
          content: sourceVersion.content,
          baseVersionId: restoredVersion.id,
          source: "version_restore",
          cursorStart: null,
          cursorEnd: null,
          revision: { increment: 1 },
        },
      });
    });
    return this.getChapterWorkspace(novelId, chapterId);
  }
}
