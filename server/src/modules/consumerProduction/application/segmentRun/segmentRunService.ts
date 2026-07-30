import { randomUUID } from "node:crypto";
import {
  consumerSegmentRunStatusSchema,
  type ConsumerSegmentRunSnapshot,
  type ConsumerStartSegmentRunRequest,
} from "@0xnovelagent/shared/types/consumerSegmentRun";
import type { ConsumerChapterProductionSnapshot } from "@0xnovelagent/shared/types/consumerChapterProduction";
import { consumerCurrentPhasePlanSchema } from "@0xnovelagent/shared/types/consumerSetup";
import type {
  ConsumerSegmentRun,
  PrismaClient,
} from "@prisma/client";
import { AppError } from "../../../../middleware/errorHandler";
import type { ConsumerWorkspaceService } from "../../../consumerWorkspace/application/workspaceService";
import type {
  ConsumerChapterProductionService,
  StartedChapterProduction,
} from "../chapterProductionService";

export interface StartedSegmentRun {
  snapshot: ConsumerSegmentRunSnapshot;
  shouldExecute: boolean;
}

const ACTIVE_STATUSES = ["created", "running", "pausing", "paused"] as const;

function parseOperationIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && Boolean(item))
      : [];
  } catch {
    return [];
  }
}

function safeRunError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.slice(0, 500)
    : "连续创作已暂停，请确认当前章节后再继续。";
}

function isPlanningChangedError(error: unknown): boolean {
  if (!(error instanceof AppError) || !error.details || typeof error.details !== "object") {
    return false;
  }
  return (error.details as { code?: unknown }).code === "segment_planning_changed";
}

export class ConsumerSegmentRunService {
  constructor(
    private readonly db: PrismaClient,
    private readonly chapterProduction: ConsumerChapterProductionService,
    private readonly workspace: Pick<ConsumerWorkspaceService, "commitDraft">,
    private readonly serviceStartedAt = new Date(),
  ) {}

  async start(
    novelId: string,
    input: ConsumerStartSegmentRunRequest,
  ): Promise<StartedSegmentRun> {
    const duplicate = await this.db.consumerSegmentRun.findUnique({
      where: { requestKey: input.requestKey },
    });
    if (duplicate) {
      if (duplicate.novelId !== novelId || duplicate.sourceChapterId !== input.sourceChapterId) {
        throw new AppError("本次操作标识已被其他连续创作使用。", 409);
      }
      return {
        snapshot: await this.serialize(await this.reconcile(duplicate)),
        shouldExecute: false,
      };
    }

    const active = await this.db.consumerSegmentRun.findFirst({
      where: { novelId, status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { createdAt: "desc" },
    });
    if (active) {
      throw new AppError(
        active.status === "paused"
          ? "这段连续创作已暂停，请继续现有进度。"
          : "这段剧情正在连续创作，请不要重复开始。",
        409,
        { code: "segment_run_exists", runId: active.id },
      );
    }

    const [setup, source, latestChapter] = await Promise.all([
      this.db.consumerStorySetup.findUnique({ where: { novelId } }),
      this.db.chapter.findFirst({
        where: { id: input.sourceChapterId, novelId },
        include: { consumerDraft: true },
      }),
      this.db.chapter.findFirst({
        where: { novelId },
        orderBy: { order: "desc" },
      }),
    ]);
    if (!setup || setup.status !== "completed" || !setup.currentPhaseJson) {
      throw new AppError("当前剧情规划还没有准备好。", 409);
    }
    if (!source || !source.consumerDraft) {
      throw new AppError("当前章节不存在或草稿尚未准备好。", 404);
    }
    if (!latestChapter || latestChapter.id !== source.id) {
      throw new AppError("请从作品的最新章节开始连续创作。", 409);
    }
    if (source.consumerDraft.revision !== input.expectedRevision) {
      throw new AppError("正文有新的修改，请保存后再开始连续创作。", 409);
    }
    if (!source.consumerDraft.content.trim()) {
      throw new AppError("当前章节还没有正文。", 400);
    }
    if (setup.revision !== input.expectedPlanningRevision) {
      throw new AppError("后续规划已经更新，请查看最新规划后再继续。", 409);
    }

    const phase = consumerCurrentPhasePlanSchema.parse(
      JSON.parse(setup.currentPhaseJson),
    );
    const firstTargetOrder = source.order + 1;
    if (
      firstTargetOrder < phase.chapterStart
      || firstTargetOrder > phase.chapterEnd
    ) {
      throw new AppError("当前章节不在可连续创作的剧情段内。", 409);
    }

    const run = await this.db.consumerSegmentRun.create({
      data: {
        id: randomUUID(),
        requestKey: input.requestKey,
        novelId,
        sourceChapterId: source.id,
        planningRevision: setup.revision,
        phaseName: phase.name,
        phaseObjective: phase.objective,
        phaseStartOrder: phase.chapterStart,
        phaseEndOrder: phase.chapterEnd,
        firstTargetOrder,
        completedThroughOrder: source.order,
      },
    });
    return {
      snapshot: await this.serialize(run),
      shouldExecute: true,
    };
  }

  async getLatest(novelId: string): Promise<ConsumerSegmentRunSnapshot | null> {
    const run = await this.db.consumerSegmentRun.findFirst({
      where: { novelId },
      orderBy: { createdAt: "desc" },
    });
    return run ? this.serialize(await this.reconcile(run)) : null;
  }

  async get(novelId: string, runId: string): Promise<ConsumerSegmentRunSnapshot> {
    return this.serialize(await this.reconcile(await this.requireRun(novelId, runId)));
  }

  async requestPause(
    novelId: string,
    runId: string,
  ): Promise<ConsumerSegmentRunSnapshot> {
    const run = await this.requireRun(novelId, runId);
    if (!["created", "running", "pausing"].includes(run.status)) {
      return this.serialize(run);
    }
    const pausedImmediately = run.status === "created";
    await this.db.consumerSegmentRun.updateMany({
      where: { id: run.id, status: run.status },
      data: {
        status: pausedImmediately ? "paused" : "pausing",
        pauseRequestedAt: new Date(),
        errorMessage: null,
      },
    });
    return this.get(novelId, runId);
  }

  async resume(novelId: string, runId: string): Promise<StartedSegmentRun> {
    const run = await this.requireRun(novelId, runId);
    if (run.status !== "paused") {
      return {
        snapshot: await this.serialize(run),
        shouldExecute: false,
      };
    }
    await this.assertPlanningStillMatches(run);
    const resumedAt = new Date(Math.max(Date.now(), this.serviceStartedAt.getTime()));
    const claimed = await this.db.consumerSegmentRun.updateMany({
      where: { id: run.id, status: "paused" },
      data: {
        status: "created",
        pauseRequestedAt: null,
        errorMessage: null,
        startedAt: resumedAt,
        finishedAt: null,
      },
    });
    return {
      snapshot: await this.get(novelId, runId),
      shouldExecute: claimed.count === 1,
    };
  }

  async execute(runId: string): Promise<ConsumerSegmentRunSnapshot> {
    const run = await this.db.consumerSegmentRun.findUnique({ where: { id: runId } });
    if (!run) throw new AppError("连续创作记录不存在。", 404);
    const claimed = await this.db.consumerSegmentRun.updateMany({
      where: { id: run.id, status: "created" },
      data: {
        status: "running",
        startedAt: run.startedAt ?? new Date(),
        errorMessage: null,
      },
    });
    if (claimed.count !== 1) {
      return this.get(run.novelId, run.id);
    }

    try {
      for (let guard = 0; guard < 500; guard += 1) {
        const current = await this.requireRun(run.novelId, run.id);
        if (await this.pauseIfRequested(current)) {
          return this.get(run.novelId, run.id);
        }
        await this.assertPlanningStillMatches(current);
        if (current.completedThroughOrder >= current.phaseEndOrder) {
          await this.commitFinalChapterIfNeeded(current);
          await this.finishRun(current);
          return this.get(run.novelId, run.id);
        }

        const latestChapter = await this.db.chapter.findFirst({
          where: { novelId: current.novelId },
          orderBy: { order: "desc" },
          include: { consumerDraft: true },
        });
        if (!latestChapter?.consumerDraft) {
          throw new AppError("最新章节草稿不存在，连续创作已暂停。", 409);
        }

        const pendingLatestChapter = latestChapter.order > current.completedThroughOrder;
        let started: StartedChapterProduction | null = null;
        let completed: ConsumerChapterProductionSnapshot | null = null;
        if (pendingLatestChapter) {
          const existing = await this.chapterProduction.getLatestForChapter(
            current.novelId,
            latestChapter.id,
          );
          if (!existing) {
            throw new AppError("待恢复章节缺少生成记录，连续创作已暂停。", 409);
          }
          if (existing.status === "succeeded") {
            completed = existing;
          } else if (existing.status === "created") {
            started = { snapshot: existing, shouldExecute: true };
          } else if (["failed", "outcome_unknown"].includes(existing.status)) {
            started = await this.chapterProduction.resumeChapter(
              current.novelId,
              latestChapter.id,
              {
                expectedRevision: latestChapter.consumerDraft.revision,
                requestKey: randomUUID(),
              },
            );
          } else {
            await this.pauseAfterFailure(
              current.id,
              "当前章节的生成状态尚未确认，请稍后查看正文再继续。",
            );
            return this.get(current.novelId, current.id);
          }
        } else {
          started = await this.chapterProduction.startNextChapter(
            current.novelId,
            latestChapter.id,
            {
              expectedRevision: latestChapter.consumerDraft.revision,
              requestKey: randomUUID(),
            },
          );
        }

        await this.trackOperation(
          current,
          (started?.snapshot ?? completed!).operationId,
          (started?.snapshot ?? completed!).chapterId,
          latestChapter.order + (pendingLatestChapter ? 0 : 1),
        );
        completed ??= started!.shouldExecute
          ? await this.chapterProduction.executeOperation(started!.snapshot.operationId)
          : started!.snapshot;
        if (completed.status !== "succeeded") {
          await this.pauseAfterFailure(
            current.id,
            completed.errorMessage || "这一章没有生成完成，请确认正文后继续。",
          );
          return this.get(current.novelId, current.id);
        }

        const completedChapter = await this.db.chapter.findFirst({
          where: { id: completed.chapterId, novelId: current.novelId },
          include: { consumerDraft: true },
        });
        if (!completedChapter?.consumerDraft) {
          throw new AppError("生成结果已返回，但章节草稿不存在。", 500);
        }
        await this.db.consumerSegmentRun.update({
          where: { id: current.id },
          data: {
            completedThroughOrder: completedChapter.order,
            currentChapterId: completedChapter.id,
            currentChapterOrder: completedChapter.order,
            currentOperationId: completed.operationId,
          },
        });
        if (completedChapter.order >= current.phaseEndOrder) {
          const finalRun = await this.requireRun(current.novelId, current.id);
          await this.commitFinalChapterIfNeeded(finalRun);
          await this.finishRun(finalRun);
          return this.get(current.novelId, current.id);
        }
      }
      throw new AppError("连续创作超过了安全章节上限，已暂停。", 409);
    } catch (error) {
      await this.db.consumerSegmentRun.updateMany({
        where: {
          id: run.id,
          status: { in: ["created", "running", "pausing"] },
        },
        data: {
          status: isPlanningChangedError(error) ? "failed" : "paused",
          errorMessage: safeRunError(error),
          finishedAt: new Date(),
        },
      });
      return this.get(run.novelId, run.id);
    }
  }

  async pauseInFlightRuns(): Promise<{ pausedCount: number }> {
    const result = await this.db.consumerSegmentRun.updateMany({
      where: { status: { in: ["created", "running", "pausing"] } },
      data: {
        status: "paused",
        pauseRequestedAt: new Date(),
        errorMessage: "连续创作已暂停，重新登录后可从当前进度继续。",
        finishedAt: new Date(),
      },
    });
    return { pausedCount: result.count };
  }

  private async trackOperation(
    run: ConsumerSegmentRun,
    operationId: string,
    chapterId: string,
    chapterOrder: number,
  ): Promise<void> {
    const ids = parseOperationIds(run.operationIdsJson);
    if (!ids.includes(operationId)) ids.push(operationId);
    await this.db.consumerSegmentRun.update({
      where: { id: run.id },
      data: {
        operationIdsJson: JSON.stringify(ids),
        currentOperationId: operationId,
        currentChapterId: chapterId,
        currentChapterOrder: chapterOrder,
      },
    });
  }

  private async pauseIfRequested(run: ConsumerSegmentRun): Promise<boolean> {
    if (!run.pauseRequestedAt && run.status !== "pausing" && run.status !== "paused") {
      return false;
    }
    await this.db.consumerSegmentRun.updateMany({
      where: { id: run.id, status: { in: ["running", "pausing"] } },
      data: {
        status: "paused",
        finishedAt: new Date(),
      },
    });
    return true;
  }

  private async pauseAfterFailure(runId: string, message: string): Promise<void> {
    await this.db.consumerSegmentRun.update({
      where: { id: runId },
      data: {
        status: "paused",
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
  }

  private async finishRun(run: ConsumerSegmentRun): Promise<void> {
    await this.db.consumerSegmentRun.updateMany({
      where: {
        id: run.id,
        status: { in: ["running", "pausing"] },
      },
      data: {
        status: "completed",
        pauseRequestedAt: null,
        errorMessage: null,
        finishedAt: new Date(),
      },
    });
  }

  private async commitFinalChapterIfNeeded(run: ConsumerSegmentRun): Promise<void> {
    const chapter = await this.db.chapter.findFirst({
      where: { novelId: run.novelId, order: run.phaseEndOrder },
      include: { consumerDraft: true },
    });
    if (!chapter?.consumerDraft) {
      throw new AppError("本段最后一章的草稿不存在，连续创作已暂停。", 409);
    }
    if ((chapter.content ?? "") === chapter.consumerDraft.content) return;
    await this.workspace.commitDraft(run.novelId, chapter.id, {
      expectedRevision: chapter.consumerDraft.revision,
      reason: "chapter_confirm",
    });
  }

  private async assertPlanningStillMatches(run: ConsumerSegmentRun): Promise<void> {
    const setup = await this.db.consumerStorySetup.findUnique({
      where: { novelId: run.novelId },
    });
    if (!setup?.currentPhaseJson || setup.revision !== run.planningRevision) {
      throw new AppError(
        "后续规划已经更新，这次连续创作不能继续。",
        409,
        { code: "segment_planning_changed" },
      );
    }
    const phase = consumerCurrentPhasePlanSchema.parse(JSON.parse(setup.currentPhaseJson));
    if (
      phase.chapterStart !== run.phaseStartOrder
      || phase.chapterEnd !== run.phaseEndOrder
    ) {
      throw new AppError(
        "当前剧情段范围已经变化，请按最新规划重新开始。",
        409,
        { code: "segment_planning_changed" },
      );
    }
  }

  private async reconcile(run: ConsumerSegmentRun): Promise<ConsumerSegmentRun> {
    const currentExecutionStartedAt = run.startedAt ?? run.createdAt;
    if (
      !["created", "running", "pausing"].includes(run.status)
      || currentExecutionStartedAt >= this.serviceStartedAt
    ) {
      return run;
    }
    await this.db.consumerSegmentRun.updateMany({
      where: { id: run.id, status: run.status },
      data: {
        status: "paused",
        pauseRequestedAt: new Date(),
        errorMessage: "软件关闭时连续创作已暂停，已收到的正文仍保存在本机。",
        finishedAt: new Date(),
      },
    });
    return (await this.db.consumerSegmentRun.findUnique({ where: { id: run.id } })) ?? run;
  }

  private async requireRun(novelId: string, runId: string): Promise<ConsumerSegmentRun> {
    const run = await this.db.consumerSegmentRun.findFirst({
      where: { id: runId, novelId },
    });
    if (!run) throw new AppError("连续创作记录不存在。", 404);
    return run;
  }

  private async serialize(run: ConsumerSegmentRun): Promise<ConsumerSegmentRunSnapshot> {
    const operationIds = parseOperationIds(run.operationIdsJson);
    const operations = operationIds.length
      ? await this.db.consumerCreationOperation.findMany({
          where: { id: { in: operationIds } },
          select: {
            actualCreditsMilli: true,
            promptTokens: true,
            completionTokens: true,
            totalTokens: true,
            llmCallCount: true,
          },
        })
      : [];
    const creditsMilli = operations.reduce(
      (sum, operation) => sum + (operation.actualCreditsMilli ?? 0),
      0,
    );
    const completedChapters = Math.max(
      0,
      Math.min(
        run.phaseEndOrder,
        run.completedThroughOrder,
      ) - run.firstTargetOrder + 1,
    );
    return {
      id: run.id,
      requestKey: run.requestKey,
      novelId: run.novelId,
      sourceChapterId: run.sourceChapterId,
      status: consumerSegmentRunStatusSchema.parse(run.status),
      phaseName: run.phaseName,
      phaseObjective: run.phaseObjective,
      phaseStartOrder: run.phaseStartOrder,
      phaseEndOrder: run.phaseEndOrder,
      firstTargetOrder: run.firstTargetOrder,
      completedThroughOrder: run.completedThroughOrder,
      currentChapterId: run.currentChapterId,
      currentChapterOrder: run.currentChapterOrder,
      currentOperationId: run.currentOperationId,
      completedChapters,
      totalChapters: run.phaseEndOrder - run.firstTargetOrder + 1,
      actualCredits: creditsMilli > 0 ? creditsMilli / 1_000 : null,
      tokenUsage: {
        promptTokens: operations.reduce(
          (sum, operation) => sum + (operation.promptTokens ?? 0),
          0,
        ),
        completionTokens: operations.reduce(
          (sum, operation) => sum + (operation.completionTokens ?? 0),
          0,
        ),
        totalTokens: operations.reduce(
          (sum, operation) => sum + (operation.totalTokens ?? 0),
          0,
        ),
        callCount: operations.reduce(
          (sum, operation) => sum + (operation.llmCallCount ?? 0),
          0,
        ),
      },
      pauseRequestedAt: run.pauseRequestedAt?.toISOString() ?? null,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
      updatedAt: run.updatedAt.toISOString(),
    };
  }
}
