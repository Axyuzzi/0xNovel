import { createHash, randomUUID } from "node:crypto";
import {
  consumerChapterProductionStageSchema,
  consumerChapterProductionStatusSchema,
  consumerChapterWritingTaskSchema,
  type ConsumerChapterProductionSnapshot,
  type ConsumerChapterWritingTask,
  type ConsumerResumeChapterRequest,
  type ConsumerStartNextChapterRequest,
} from "@0xnovelagent/shared/types/consumerChapterProduction";
import {
  consumerBookSkeletonSchema,
  consumerCurrentPhasePlanSchema,
  consumerStoryDirectionSchema,
  consumerVolumePlanSchema,
  type ConsumerCreditEstimate,
} from "@0xnovelagent/shared/types/consumerSetup";
import type {
  ConsumerCreationOperation,
  ConsumerStorySetup,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { AppError } from "../../../middleware/errorHandler";
import type { ConsumerChapterProductionPromptInput } from "../../../prompting/prompts/consumer/consumerChapterProduction.prompts";
import type { ConsumerChapterProductionCreditMeter } from "./chapterProductionCreditMeter";
import type { ConsumerChapterProductionGenerator } from "./chapterProductionGenerator";
import { StreamingDraftWriter } from "./streamingDraftWriter";

interface ProductionPayload {
  mode: "next_chapter" | "continue_chapter";
  sourceChapterId: string;
  task: ConsumerChapterWritingTask | null;
}

export interface StartedChapterProduction {
  snapshot: ConsumerChapterProductionSnapshot;
  shouldExecute: boolean;
}

function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function parseJson(value: string | null, label: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    throw new AppError(`${label}数据损坏，请从本地备份恢复后重试。`, 500);
  }
}

function parsePayload(operation: ConsumerCreationOperation): ProductionPayload {
  const raw = parseJson(operation.inputJson, "章节生成记录");
  if (!raw || typeof raw !== "object") {
    throw new AppError("章节生成记录缺少必要信息。", 500);
  }
  const record = raw as Record<string, unknown>;
  const mode = record.mode === "continue_chapter" ? "continue_chapter" : "next_chapter";
  if (typeof record.sourceChapterId !== "string" || !record.sourceChapterId) {
    throw new AppError("章节生成记录缺少来源章节。", 500);
  }
  return {
    mode,
    sourceChapterId: record.sourceChapterId,
    task: record.task ? consumerChapterWritingTaskSchema.parse(record.task) : null,
  };
}

function safeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }
  return "章节没有生成完成。";
}

function measuredCredits(before: number | null, after: number | null): number | null {
  if (before === null || after === null) return null;
  return Math.max(0, Math.round((before - after) * 1_000));
}

export class ConsumerChapterProductionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly generator: ConsumerChapterProductionGenerator,
    private readonly creditMeter: ConsumerChapterProductionCreditMeter,
    private readonly serviceStartedAt = new Date(),
  ) {}

  async startNextChapter(
    novelId: string,
    sourceChapterId: string,
    input: ConsumerStartNextChapterRequest,
  ): Promise<StartedChapterProduction> {
    const duplicate = await this.findDuplicate(input.requestKey, novelId, {
      allowedKinds: ["consumer_next_chapter"],
      sourceChapterId,
    });
    if (duplicate) {
      return {
        snapshot: await this.serializeOperation(await this.reconcileOperation(duplicate)),
        shouldExecute: false,
      };
    }
    const estimate = await this.getCreditEstimate("consumer_next_chapter");
    const operationId = randomUUID();
    await this.db.$transaction(async (tx) => {
      const setup = await tx.consumerStorySetup.findUnique({ where: { novelId } });
      if (!setup || setup.status !== "completed") {
        throw new AppError("请先完成作品准备，再继续下一章。", 409);
      }
      const source = await tx.chapter.findFirst({
        where: { id: sourceChapterId, novelId },
      });
      if (!source) {
        throw new AppError("当前章节不存在。", 404);
      }
      const unresolvedStoryChange = await tx.consumerCreationOperation.findFirst({
        where: {
          novelId,
          kind: "consumer_story_adjustment",
          OR: [
            { status: { in: ["created", "running"] } },
            { status: "succeeded", stage: "awaiting_confirmation" },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
      if (unresolvedStoryChange) {
        throw new AppError(
          "后续剧情的调整方案还没有确认，请先采用或放弃这份方案。",
          409,
          { code: "story_adjustment_confirmation_required" },
        );
      }
      const currentPhase = consumerCurrentPhasePlanSchema.parse(
        parseJson(setup.currentPhaseJson, "当前剧情阶段"),
      );
      if (source.order >= currentPhase.chapterEnd) {
        throw new AppError(
          "这一段剧情已经完成，请先选择检查后继续或暂不检查。",
          409,
          { code: "story_checkpoint_required" },
        );
      }
      const latestChapter = await tx.chapter.findFirst({
        where: { novelId },
        orderBy: { order: "desc" },
      });
      if (!latestChapter || latestChapter.id !== source.id) {
        throw new AppError("请从作品的最新章节继续创作。", 409);
      }
      const draft = await tx.consumerChapterDraft.findUnique({
        where: { chapterId: source.id },
      });
      if (!draft || draft.revision !== input.expectedRevision) {
        throw new AppError("正文有新的修改，请保存后再继续下一章。", 409);
      }
      if (!draft.content.trim()) {
        throw new AppError("当前章节还没有正文。", 400);
      }
      const version = await this.createVersion(tx, {
        chapterId: source.id,
        title: source.title,
        content: draft.content,
        reason: "chapter_confirm",
      });
      await tx.chapter.update({
        where: { id: source.id },
        data: { content: draft.content },
      });
      await tx.consumerChapterDraft.update({
        where: { chapterId: source.id },
        data: {
          baseVersionId: version.id,
          revision: { increment: 1 },
        },
      });
      const target = await tx.chapter.create({
        data: {
          novelId,
          title: `第 ${source.order + 1} 章`,
          content: "",
          order: source.order + 1,
        },
      });
      await tx.consumerChapterDraft.create({
        data: {
          chapterId: target.id,
          content: "",
          source: "ai_stream",
        },
      });
      await tx.consumerCreationOperation.create({
        data: {
          id: operationId,
          requestKey: input.requestKey,
          novelId,
          chapterId: target.id,
          kind: "consumer_next_chapter",
          status: "created",
          stage: "preparing_task",
          inputJson: JSON.stringify({
            mode: "next_chapter",
            sourceChapterId,
            task: null,
          } satisfies ProductionPayload),
          estimatedCreditsMilli: estimate
            ? Math.round(estimate.typical * 1_000)
            : null,
        },
      });
    });
    const operation = await this.requireOperation(operationId, novelId);
    return {
      snapshot: await this.serializeOperation(operation),
      shouldExecute: true,
    };
  }

  async resumeChapter(
    novelId: string,
    chapterId: string,
    input: ConsumerResumeChapterRequest,
  ): Promise<StartedChapterProduction> {
    const duplicate = await this.findDuplicate(input.requestKey, novelId, {
      allowedKinds: ["consumer_next_chapter", "consumer_continue_chapter"],
      chapterId,
    });
    if (duplicate) {
      return {
        snapshot: await this.serializeOperation(await this.reconcileOperation(duplicate)),
        shouldExecute: false,
      };
    }
    const previous = await this.db.consumerCreationOperation.findFirst({
      where: {
        novelId,
        chapterId,
        kind: { in: ["consumer_next_chapter", "consumer_continue_chapter"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!previous) {
      throw new AppError("没有可恢复的章节生成记录。", 404);
    }
    const reconciled = await this.reconcileOperation(previous);
    if (!["failed", "outcome_unknown"].includes(reconciled.status)) {
      throw new AppError("当前章节不需要恢复生成。", 409);
    }
    const previousPayload = parsePayload(reconciled);
    const draft = await this.db.consumerChapterDraft.findUnique({ where: { chapterId } });
    if (!draft || draft.revision !== input.expectedRevision) {
      throw new AppError("正文有新的修改，请确认最新内容后再继续。", 409);
    }
    const mode = draft.content.trim() ? "continue_chapter" : "next_chapter";
    const kind = mode === "continue_chapter"
      ? "consumer_continue_chapter"
      : "consumer_next_chapter";
    const estimate = await this.getCreditEstimate(kind);
    const operation = await this.db.consumerCreationOperation.create({
      data: {
        id: randomUUID(),
        requestKey: input.requestKey,
        novelId,
        chapterId,
        kind,
        status: "created",
        stage: mode === "continue_chapter" ? "continuing" : "preparing_task",
        inputJson: JSON.stringify({
          mode,
          sourceChapterId: previousPayload.sourceChapterId,
          task: previousPayload.task,
        } satisfies ProductionPayload),
        receivedContent: draft.content,
        estimatedCreditsMilli: estimate
          ? Math.round(estimate.typical * 1_000)
          : null,
      },
    });
    return {
      snapshot: await this.serializeOperation(operation),
      shouldExecute: true,
    };
  }

  async getOperation(
    novelId: string,
    operationId: string,
  ): Promise<ConsumerChapterProductionSnapshot> {
    return this.serializeOperation(
      await this.reconcileOperation(await this.requireOperation(operationId, novelId)),
    );
  }

  async getLatestForChapter(
    novelId: string,
    chapterId: string,
  ): Promise<ConsumerChapterProductionSnapshot | null> {
    const operation = await this.db.consumerCreationOperation.findFirst({
      where: {
        novelId,
        chapterId,
        kind: { in: ["consumer_next_chapter", "consumer_continue_chapter"] },
      },
      orderBy: { createdAt: "desc" },
    });
    return operation
      ? this.serializeOperation(await this.reconcileOperation(operation))
      : null;
  }

  async listProgress(novelId: string): Promise<ConsumerChapterProductionSnapshot[]> {
    const operations = await this.db.consumerCreationOperation.findMany({
      where: {
        novelId,
        kind: { in: ["consumer_next_chapter", "consumer_continue_chapter"] },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const reconciled = await Promise.all(operations.map((item) => this.reconcileOperation(item)));
    return Promise.all(reconciled.map((item) => this.serializeOperation(item)));
  }

  async getNextChapterEstimate(): Promise<ConsumerCreditEstimate | null> {
    return this.getCreditEstimate("consumer_next_chapter");
  }

  async executeOperation(operationId: string): Promise<ConsumerChapterProductionSnapshot> {
    const claimed = await this.db.consumerCreationOperation.updateMany({
      where: { id: operationId, status: "created" },
      data: {
        status: "running",
        startedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });
    const operation = await this.db.consumerCreationOperation.findUnique({
      where: { id: operationId },
    });
    if (!operation) {
      throw new AppError("章节生成记录不存在。", 404);
    }
    if (claimed.count !== 1) {
      return this.serializeOperation(await this.reconcileOperation(operation));
    }

    const beforeCredits = await this.creditMeter.readAvailableCredits();
    let writer: StreamingDraftWriter | null = null;
    try {
      const payload = parsePayload(operation);
      const context = await this.buildPromptInput(operation, payload);
      let task = payload.task;
      if (!task) {
        task = await this.generator.createTask(context, operation.id);
        await this.db.$transaction(async (tx) => {
          await tx.chapter.update({
            where: { id: operation.chapterId ?? "" },
            data: {
              title: task!.title,
              taskSheet: JSON.stringify(task),
            },
          });
          await tx.consumerCreationOperation.update({
            where: { id: operation.id },
            data: {
              stage: "writing",
              inputJson: JSON.stringify({ ...payload, task }),
            },
          });
        });
      }
      const draft = await this.db.consumerChapterDraft.findUnique({
        where: { chapterId: operation.chapterId ?? "" },
      });
      if (!draft || !operation.chapterId) {
        throw new AppError("目标章节草稿不存在。", 404);
      }
      const continuing = payload.mode === "continue_chapter" && draft.content.trim().length > 0;
      writer = new StreamingDraftWriter(
        this.db,
        operation.id,
        operation.chapterId,
        continuing ? `${draft.content.trimEnd()}\n\n` : "",
        draft.revision,
        continuing ? "continuing" : "writing",
      );
      const promptInput = {
        ...context,
        task,
        existingContent: continuing ? draft.content : "",
      };
      const generated = continuing
        ? await this.generator.continueChapter(
            promptInput,
            operation.id,
            (delta) => writer!.append(delta),
          )
        : await this.generator.writeChapter(
            promptInput,
            operation.id,
            (delta) => writer!.append(delta),
          );
      await writer.flush();
      const finalContent = continuing
        ? `${draft.content.trimEnd()}\n\n${generated.trim()}`
        : generated.trim();
      await writer.finish(finalContent);
      const afterCredits = await this.creditMeter.readAvailableCredits();
      await this.db.consumerCreationOperation.update({
        where: { id: operation.id },
        data: {
          status: "succeeded",
          stage: "completed",
          receivedContent: finalContent,
          actualCreditsMilli: measuredCredits(beforeCredits, afterCredits),
          resultRefType: "chapter_draft",
          resultRefId: draft.id,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      await writer?.flush().catch(() => undefined);
      const afterCredits = await this.creditMeter.readAvailableCredits();
      await this.db.consumerCreationOperation.updateMany({
        where: { id: operation.id, status: "running" },
        data: {
          status: "failed",
          actualCreditsMilli: measuredCredits(beforeCredits, afterCredits),
          errorCode: "generation_failed",
          errorMessage: safeError(error),
          finishedAt: new Date(),
          receivedContent: writer?.currentContent() ?? operation.receivedContent,
        },
      });
    }
    return this.getOperation(operation.novelId, operation.id);
  }

  private async findDuplicate(
    requestKey: string,
    novelId: string,
    expectation: {
      allowedKinds: string[];
      chapterId?: string;
      sourceChapterId?: string;
    },
  ): Promise<ConsumerCreationOperation | null> {
    const duplicate = await this.db.consumerCreationOperation.findUnique({
      where: { requestKey },
    });
    if (duplicate && duplicate.novelId !== novelId) {
      throw new AppError("本次操作标识已被其他作品使用。", 409);
    }
    if (
      duplicate
      && !expectation.allowedKinds.includes(duplicate.kind)
    ) {
      throw new AppError("本次操作标识已被其他创作步骤使用。", 409);
    }
    if (
      duplicate
      && expectation.chapterId
      && duplicate.chapterId !== expectation.chapterId
    ) {
      throw new AppError("本次操作标识已被其他章节使用。", 409);
    }
    if (
      duplicate
      && expectation.sourceChapterId
      && parsePayload(duplicate).sourceChapterId !== expectation.sourceChapterId
    ) {
      throw new AppError("本次操作标识已被其他章节使用。", 409);
    }
    return duplicate;
  }

  private async requireOperation(
    operationId: string,
    novelId: string,
  ): Promise<ConsumerCreationOperation> {
    const operation = await this.db.consumerCreationOperation.findFirst({
      where: { id: operationId, novelId },
    });
    if (!operation) {
      throw new AppError("章节生成记录不存在。", 404);
    }
    if (!["consumer_next_chapter", "consumer_continue_chapter"].includes(operation.kind)) {
      throw new AppError("这不是章节生成记录。", 409);
    }
    return operation;
  }

  private async reconcileOperation(
    operation: ConsumerCreationOperation,
  ): Promise<ConsumerCreationOperation> {
    const createdByPreviousProcess = operation.status === "created"
      && operation.createdAt < this.serviceStartedAt;
    const runningInPreviousProcess = operation.status === "running"
      && (!operation.startedAt || operation.startedAt < this.serviceStartedAt);
    if (!createdByPreviousProcess && !runningInPreviousProcess) {
      return operation;
    }
    const status = runningInPreviousProcess ? "outcome_unknown" : "failed";
    const message = runningInPreviousProcess
      ? "上一次生成在返回结果前中断，已保留收到的正文。再次续写会产生新的消费。"
      : "上一次生成尚未发起，可以重新开始。";
    await this.db.consumerCreationOperation.updateMany({
      where: { id: operation.id, status: operation.status },
      data: {
        status,
        errorCode: runningInPreviousProcess ? "process_interrupted" : "process_not_started",
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
    return (await this.db.consumerCreationOperation.findUnique({
      where: { id: operation.id },
    })) ?? operation;
  }

  /**
   * 换账号 / 主动登出前调用：把所有仍在 running 的创作操作标为 outcome_unknown，
   * 避免停服务杀掉在途的流式写入后，这些操作永远卡在 running、用户无法重试。
   * outcome_unknown 复用 reconcileOperation 的语义：明确告知“可能已产生消费，
   * 续写会形成新的消费”，而不是静默 failed。返回被排空的在途操作数。
   */
  async drainInFlightOperations(): Promise<{ drainedCount: number }> {
    const running = await this.db.consumerCreationOperation.findMany({
      where: { status: "running" },
      select: { id: true },
    });
    if (running.length === 0) {
      return { drainedCount: 0 };
    }
    const result = await this.db.consumerCreationOperation.updateMany({
      where: { status: "running" },
      data: {
        status: "outcome_unknown",
        errorCode: "process_interrupted",
        errorMessage: "换账号或退出前已暂停生成，已保留收到的正文。再次续写会产生新的消费。",
        finishedAt: new Date(),
      },
    });
    return { drainedCount: result.count };
  }

  private async buildPromptInput(
    operation: ConsumerCreationOperation,
    payload: ProductionPayload,
  ): Promise<ConsumerChapterProductionPromptInput> {
    if (!operation.chapterId) {
      throw new AppError("章节生成记录缺少目标章节。", 500);
    }
    const source = await this.db.chapter.findFirst({
      where: { id: payload.sourceChapterId, novelId: operation.novelId },
    });
    if (!source) {
      throw new AppError("作品规划或来源章节不存在。", 404);
    }
    const [novel, setup, recent] = await Promise.all([
      this.db.novel.findUnique({ where: { id: operation.novelId } }),
      this.db.consumerStorySetup.findUnique({ where: { novelId: operation.novelId } }),
      this.db.chapter.findMany({
        where: {
          novelId: operation.novelId,
          id: { not: operation.chapterId },
          order: { lte: source.order },
        },
        orderBy: { order: "desc" },
        take: 3,
      }),
    ]);
    if (!novel || !setup) {
      throw new AppError("作品规划或来源章节不存在。", 404);
    }
    const setupContext = this.parseSetupContext(setup);
    return {
      novelId: novel.id,
      targetChapterId: operation.chapterId,
      novelTitle: novel.title,
      idea: setup.idea,
      ...setupContext,
      sourceChapter: {
        order: source.order,
        title: source.title,
        content: source.content ?? "",
      },
      recentChapters: recent
        .sort((left, right) => left.order - right.order)
        .map((chapter) => ({
          order: chapter.order,
          title: chapter.title,
          content: chapter.content ?? "",
        })),
      task: payload.task,
      existingContent: operation.receivedContent,
    };
  }

  private parseSetupContext(setup: ConsumerStorySetup) {
    const selectedDirection = consumerStoryDirectionSchema.parse(
      parseJson(setup.selectedDirectionJson, "故事方向"),
    );
    const bookSkeleton = consumerBookSkeletonSchema.parse(
      parseJson(setup.bookSkeletonJson, "全书骨架"),
    );
    const volumePlan = consumerVolumePlanSchema.parse(
      parseJson(setup.volumePlanJson, "全部卷规划"),
    );
    const currentPhase = consumerCurrentPhasePlanSchema.parse(
      parseJson(setup.currentPhaseJson, "当前剧情阶段"),
    );
    return { selectedDirection, bookSkeleton, volumePlan, currentPhase };
  }

  private async createVersion(
    tx: Prisma.TransactionClient,
    input: {
      chapterId: string;
      title: string;
      content: string;
      reason: string;
    },
  ) {
    const latest = await tx.consumerChapterVersion.findFirst({
      where: { chapterId: input.chapterId },
      orderBy: { sequence: "desc" },
    });
    const hash = contentHash(input.content);
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
      },
    });
  }

  private async getCreditEstimate(kind: string): Promise<ConsumerCreditEstimate | null> {
    const history = await this.db.consumerCreationOperation.findMany({
      where: {
        kind,
        status: "succeeded",
        actualCreditsMilli: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { actualCreditsMilli: true },
    });
    const values = history
      .map((item) => item.actualCreditsMilli)
      .filter((value): value is number => value !== null)
      .map((value) => value / 1_000);
    if (!values.length) return null;
    return {
      typical: values.reduce((sum, value) => sum + value, 0) / values.length,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      sampleSize: values.length,
    };
  }

  /**
   * 汇总某一章所有创作操作（任务+正文+续写）的累计消费，转成 0x积分。
   * 用于在工作台展示“本章一共花了多少”，而不是只看最近一次操作。
   * 只统计已经计费完成（actualCreditsMilli 非空）的操作；没有任何已计费操作时返回 null。
   */
  private async getChapterTotalCredits(chapterId: string): Promise<number | null> {
    const rows = await this.db.consumerCreationOperation.findMany({
      where: { chapterId, actualCreditsMilli: { not: null } },
      select: { actualCreditsMilli: true },
    });
    if (rows.length === 0) {
      return null;
    }
    const sumMilli = rows.reduce((total, row) => total + (row.actualCreditsMilli ?? 0), 0);
    return sumMilli / 1_000;
  }

  private async serializeOperation(
    operation: ConsumerCreationOperation,
  ): Promise<ConsumerChapterProductionSnapshot> {
    if (!operation.chapterId) {
      throw new AppError("章节生成记录缺少目标章节。", 500);
    }
    const payload = parsePayload(operation);
    return {
      operationId: operation.id,
      novelId: operation.novelId,
      sourceChapterId: payload.sourceChapterId,
      chapterId: operation.chapterId,
      requestKey: operation.requestKey,
      mode: payload.mode,
      status: consumerChapterProductionStatusSchema.parse(operation.status),
      stage: consumerChapterProductionStageSchema.parse(
        operation.stage ?? (payload.mode === "continue_chapter" ? "continuing" : "preparing_task"),
      ),
      task: payload.task,
      receivedContent: operation.receivedContent,
      creditEstimate: await this.getCreditEstimate(operation.kind),
      actualCredits: operation.actualCreditsMilli === null
        ? null
        : operation.actualCreditsMilli / 1_000,
      chapterTotalCredits: await this.getChapterTotalCredits(operation.chapterId),
      errorMessage: operation.errorMessage,
      startedAt: operation.startedAt?.toISOString() ?? null,
      finishedAt: operation.finishedAt?.toISOString() ?? null,
      updatedAt: operation.updatedAt.toISOString(),
    };
  }
}
