import { createHash, randomUUID } from "node:crypto";
import {
  consumerChapterRevisionModeSchema,
  consumerChapterRevisionPresetSchema,
  consumerChapterRevisionStageSchema,
  type ConsumerChapterRevisionMode,
  type ConsumerChapterRevisionSnapshot,
  type ConsumerStartChapterRevisionRequest,
} from "@0xnovelagent/shared/types/consumerChapterRevision";
import { consumerChapterProductionStatusSchema } from "@0xnovelagent/shared/types/consumerChapterProduction";
import {
  consumerBookSkeletonSchema,
  consumerCurrentPhasePlanSchema,
  consumerStoredStoryDirectionSchema,
  consumerVolumePlanSchema,
  type ConsumerCreditEstimate,
} from "@0xnovelagent/shared/types/consumerSetup";
import type {
  ConsumerCreationOperation,
  ConsumerStorySetup,
  PrismaClient,
} from "@prisma/client";
import { AppError } from "../../../middleware/errorHandler";
import type { ConsumerChapterRevisionPromptInput } from "../../../prompting/prompts/consumer/consumerChapterRevision.prompts";
import type { ConsumerChapterProductionCreditMeter } from "./chapterProductionCreditMeter";
import type { ConsumerChapterRevisionGenerator } from "./chapterRevisionGenerator";
import { StreamingOperationWriter } from "./streamingOperationWriter";

interface RevisionPayload {
  mode: ConsumerChapterRevisionMode;
  preset: ConsumerStartChapterRevisionRequest["preset"];
  instruction: string;
  sourceCandidateId: string | null;
  sourceContent: string;
  baseRevision: number;
  baseContentHash: string;
}

export interface StartedChapterRevision {
  snapshot: ConsumerChapterRevisionSnapshot;
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

function parsePayload(operation: ConsumerCreationOperation): RevisionPayload {
  const raw = parseJson(operation.inputJson, "AI 修改记录");
  if (!raw || typeof raw !== "object") {
    throw new AppError("AI 修改记录缺少必要信息。", 500);
  }
  const value = raw as Record<string, unknown>;
  const mode = consumerChapterRevisionModeSchema.parse(value.mode);
  if (
    typeof value.instruction !== "string"
    || typeof value.sourceContent !== "string"
    || typeof value.baseRevision !== "number"
    || typeof value.baseContentHash !== "string"
  ) {
    throw new AppError("AI 修改记录缺少必要信息。", 500);
  }
  return {
    mode,
    preset: consumerChapterRevisionPresetSchema.parse(value.preset),
    instruction: value.instruction,
    sourceCandidateId: typeof value.sourceCandidateId === "string"
      ? value.sourceCandidateId
      : null,
    sourceContent: value.sourceContent,
    baseRevision: value.baseRevision,
    baseContentHash: value.baseContentHash,
  };
}

function safeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }
  return "修改稿没有生成完成。";
}

function measuredCredits(before: number | null, after: number | null): number | null {
  if (before === null || after === null) return null;
  return Math.max(0, Math.round((before - after) * 1_000));
}

function operationKind(mode: ConsumerChapterRevisionMode): string {
  return mode === "rewrite"
    ? "consumer_chapter_rewrite"
    : "consumer_chapter_revision";
}

export class ConsumerChapterRevisionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly generator: ConsumerChapterRevisionGenerator,
    private readonly creditMeter: ConsumerChapterProductionCreditMeter,
    private readonly serviceStartedAt = new Date(),
  ) {}

  async startRevision(
    novelId: string,
    chapterId: string,
    input: ConsumerStartChapterRevisionRequest,
  ): Promise<StartedChapterRevision> {
    const duplicate = await this.findDuplicate(input.requestKey, novelId, chapterId, input);
    if (duplicate) {
      return {
        snapshot: await this.serializeOperation(await this.reconcileOperation(duplicate)),
        shouldExecute: false,
      };
    }

    const kind = operationKind(input.mode);
    const estimate = await this.getCreditEstimate(input.mode);
    const operation = await this.db.$transaction(async (tx) => {
      const chapter = await tx.chapter.findFirst({ where: { id: chapterId, novelId } });
      if (!chapter) throw new AppError("当前章节不存在。", 404);
      const setup = await tx.consumerStorySetup.findUnique({ where: { novelId } });
      if (!setup || setup.status !== "completed") {
        throw new AppError("作品准备尚未完成，暂时不能使用 AI 修改。", 409);
      }
      const draft = await tx.consumerChapterDraft.findUnique({ where: { chapterId } });
      if (!draft || draft.revision !== input.expectedRevision) {
        throw new AppError("正文有新的修改，请保存后再生成修改建议。", 409);
      }
      if (!draft.content.trim()) {
        throw new AppError("当前章节还没有正文。", 400);
      }
      let sourceContent = draft.content;
      if (input.sourceCandidateId) {
        if (input.mode !== "revise") {
          throw new AppError("整章重新生成不能以修改建议作为来源。", 400);
        }
        const sourceCandidate = await tx.consumerChapterCandidate.findFirst({
          where: {
            id: input.sourceCandidateId,
            chapterId,
            status: "pending",
          },
        });
        if (!sourceCandidate) {
          throw new AppError("要继续调整的修改建议不存在或已经处理。", 409);
        }
        sourceContent = sourceCandidate.content;
      }
      return tx.consumerCreationOperation.create({
        data: {
          id: randomUUID(),
          requestKey: input.requestKey,
          novelId,
          chapterId,
          kind,
          status: "created",
          stage: "generating_candidate",
          inputJson: JSON.stringify({
            mode: input.mode,
            preset: input.preset,
            instruction: input.instruction,
            sourceCandidateId: input.sourceCandidateId ?? null,
            sourceContent,
            baseRevision: draft.revision,
            baseContentHash: contentHash(draft.content),
          } satisfies RevisionPayload),
          estimatedCreditsMilli: estimate
            ? Math.round(estimate.typical * 1_000)
            : null,
        },
      });
    });

    return {
      snapshot: await this.serializeOperation(operation),
      shouldExecute: true,
    };
  }

  async executeOperation(operationId: string): Promise<ConsumerChapterRevisionSnapshot> {
    const claimed = await this.db.consumerCreationOperation.updateMany({
      where: { id: operationId, status: "created" },
      data: {
        status: "running",
        stage: "generating_candidate",
        startedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });
    const operation = await this.db.consumerCreationOperation.findUnique({
      where: { id: operationId },
    });
    if (!operation) throw new AppError("AI 修改记录不存在。", 404);
    if (claimed.count !== 1) {
      return this.serializeOperation(await this.reconcileOperation(operation));
    }

    const payload = parsePayload(operation);
    const beforeCredits = await this.creditMeter.readAvailableCredits();
    const writer = new StreamingOperationWriter(this.db, operation.id);
    try {
      const promptInput = await this.buildPromptInput(operation, payload);
      const content = await this.generator.generate(
        promptInput,
        operation.id,
        (delta) => writer.append(delta),
      );
      const finalContent = await writer.finish(content);
      const afterCredits = await this.creditMeter.readAvailableCredits();
      const candidate = await this.db.$transaction(async (tx) => {
        const created = await tx.consumerChapterCandidate.create({
          data: {
            chapterId: operation.chapterId!,
            content: finalContent,
            instruction: payload.instruction,
            source: payload.mode === "rewrite" ? "ai_rewrite" : "ai_revision",
            operationId: operation.id,
          },
        });
        await tx.consumerCreationOperation.update({
          where: { id: operation.id },
          data: {
            status: "succeeded",
            stage: "completed",
            receivedContent: finalContent,
            actualCreditsMilli: measuredCredits(beforeCredits, afterCredits),
            resultRefType: "chapter_candidate",
            resultRefId: created.id,
            finishedAt: new Date(),
          },
        });
        return created;
      });
      const completed = await this.requireOperation(operation.novelId, operation.id);
      return this.serializeOperation({
        ...completed,
        resultRefId: candidate.id,
      });
    } catch (error) {
      await writer.flush().catch(() => undefined);
      const afterCredits = await this.creditMeter.readAvailableCredits();
      await this.db.consumerCreationOperation.updateMany({
        where: { id: operation.id, status: "running" },
        data: {
          status: "failed",
          actualCreditsMilli: measuredCredits(beforeCredits, afterCredits),
          errorCode: "generation_failed",
          errorMessage: safeError(error),
          receivedContent: writer.currentContent(),
          finishedAt: new Date(),
        },
      });
      return this.serializeOperation(await this.requireOperation(operation.novelId, operation.id));
    }
  }

  async getOperation(
    novelId: string,
    operationId: string,
  ): Promise<ConsumerChapterRevisionSnapshot> {
    return this.serializeOperation(
      await this.reconcileOperation(await this.requireOperation(novelId, operationId)),
    );
  }

  async getLatestForChapter(
    novelId: string,
    chapterId: string,
  ): Promise<ConsumerChapterRevisionSnapshot | null> {
    const operation = await this.db.consumerCreationOperation.findFirst({
      where: {
        novelId,
        chapterId,
        kind: { in: ["consumer_chapter_revision", "consumer_chapter_rewrite"] },
      },
      orderBy: { createdAt: "desc" },
    });
    return operation
      ? this.serializeOperation(await this.reconcileOperation(operation))
      : null;
  }

  async getCreditEstimate(
    mode: ConsumerChapterRevisionMode,
  ): Promise<ConsumerCreditEstimate | null> {
    const samples = await this.db.consumerCreationOperation.findMany({
      where: {
        kind: operationKind(mode),
        status: "succeeded",
        actualCreditsMilli: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { actualCreditsMilli: true },
    });
    const values = samples
      .map((item) => item.actualCreditsMilli)
      .filter((value): value is number => value !== null)
      .map((value) => value / 1_000);
    if (values.length === 0) return null;
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      typical: total / values.length,
      sampleSize: values.length,
    };
  }

  private async findDuplicate(
    requestKey: string,
    novelId: string,
    chapterId: string,
    input: ConsumerStartChapterRevisionRequest,
  ): Promise<ConsumerCreationOperation | null> {
    const duplicate = await this.db.consumerCreationOperation.findUnique({
      where: { requestKey },
    });
    if (!duplicate) return null;
    if (
      duplicate.novelId !== novelId
      || duplicate.chapterId !== chapterId
      || duplicate.kind !== operationKind(input.mode)
    ) {
      throw new AppError("本次操作标识已被其他创作步骤使用。", 409);
    }
    const payload = parsePayload(duplicate);
    if (
      payload.preset !== input.preset
      || payload.instruction !== input.instruction
      || payload.sourceCandidateId !== (input.sourceCandidateId ?? null)
    ) {
      throw new AppError("本次操作标识对应的修改要求不一致。", 409);
    }
    return duplicate;
  }

  private async requireOperation(
    novelId: string,
    operationId: string,
  ): Promise<ConsumerCreationOperation> {
    const operation = await this.db.consumerCreationOperation.findFirst({
      where: {
        id: operationId,
        novelId,
        kind: { in: ["consumer_chapter_revision", "consumer_chapter_rewrite"] },
      },
    });
    if (!operation) throw new AppError("AI 修改记录不存在。", 404);
    return operation;
  }

  private async reconcileOperation(
    operation: ConsumerCreationOperation,
  ): Promise<ConsumerCreationOperation> {
    const createdByPreviousProcess = operation.status === "created"
      && operation.createdAt < this.serviceStartedAt;
    const runningInPreviousProcess = operation.status === "running"
      && (!operation.startedAt || operation.startedAt < this.serviceStartedAt);
    if (!createdByPreviousProcess && !runningInPreviousProcess) return operation;
    const status = runningInPreviousProcess ? "outcome_unknown" : "failed";
    await this.db.consumerCreationOperation.updateMany({
      where: { id: operation.id, status: operation.status },
      data: {
        status,
        errorCode: runningInPreviousProcess ? "process_interrupted" : "process_not_started",
        errorMessage: runningInPreviousProcess
          ? "上一次修改在返回结果前中断。重新生成会产生新的消费，当前正文没有被覆盖。"
          : "上一次修改尚未发起，可以重新生成。",
        finishedAt: new Date(),
      },
    });
    return (await this.db.consumerCreationOperation.findUnique({
      where: { id: operation.id },
    })) ?? operation;
  }

  private async buildPromptInput(
    operation: ConsumerCreationOperation,
    payload: RevisionPayload,
  ): Promise<ConsumerChapterRevisionPromptInput> {
    if (!operation.chapterId) throw new AppError("AI 修改记录缺少章节。", 500);
    const chapter = await this.db.chapter.findFirst({
      where: { id: operation.chapterId, novelId: operation.novelId },
    });
    if (!chapter) throw new AppError("当前章节不存在。", 404);
    const [novel, setup, previousChapters] = await Promise.all([
      this.db.novel.findUnique({ where: { id: operation.novelId } }),
      this.db.consumerStorySetup.findUnique({ where: { novelId: operation.novelId } }),
      this.db.chapter.findMany({
        where: {
          novelId: operation.novelId,
          order: { lt: chapter.order },
        },
        orderBy: { order: "desc" },
        take: 2,
      }),
    ]);
    if (!novel || !setup) throw new AppError("作品规划不存在。", 404);
    return {
      novelId: novel.id,
      chapterId: chapter.id,
      novelTitle: novel.title,
      idea: setup.idea,
      ...this.parseSetupContext(setup),
      chapter: {
        order: chapter.order,
        title: chapter.title,
        content: payload.sourceContent,
        taskSheet: chapter.taskSheet,
      },
      previousChapters: previousChapters
        .sort((left, right) => left.order - right.order)
        .map((item) => ({
          order: item.order,
          title: item.title,
          content: item.content ?? "",
        })),
      mode: payload.mode,
      preset: payload.preset,
      instruction: payload.instruction,
    };
  }

  private parseSetupContext(setup: ConsumerStorySetup) {
    return {
      selectedDirection: consumerStoredStoryDirectionSchema.parse(
        parseJson(setup.selectedDirectionJson, "故事方向"),
      ),
      bookSkeleton: consumerBookSkeletonSchema.parse(
        parseJson(setup.bookSkeletonJson, "全书骨架"),
      ),
      volumePlan: consumerVolumePlanSchema.parse(
        parseJson(setup.volumePlanJson, "全部卷规划"),
      ),
      currentPhase: consumerCurrentPhasePlanSchema.parse(
        parseJson(setup.currentPhaseJson, "当前剧情阶段"),
      ),
    };
  }

  private async serializeOperation(
    operation: ConsumerCreationOperation,
  ): Promise<ConsumerChapterRevisionSnapshot> {
    if (!operation.chapterId) throw new AppError("AI 修改记录缺少章节。", 500);
    const payload = parsePayload(operation);
    return {
      operationId: operation.id,
      novelId: operation.novelId,
      chapterId: operation.chapterId,
      requestKey: operation.requestKey,
      mode: payload.mode,
      preset: payload.preset,
      instruction: payload.instruction,
      sourceCandidateId: payload.sourceCandidateId,
      status: consumerChapterProductionStatusSchema.parse(operation.status),
      stage: consumerChapterRevisionStageSchema.parse(operation.stage ?? "generating_candidate"),
      receivedContent: operation.receivedContent,
      resultCandidateId: operation.resultRefType === "chapter_candidate"
        ? operation.resultRefId
        : null,
      creditEstimate: await this.getCreditEstimate(payload.mode),
      actualCredits: operation.actualCreditsMilli === null
        ? null
        : operation.actualCreditsMilli / 1_000,
      errorMessage: operation.errorMessage,
      startedAt: operation.startedAt?.toISOString() ?? null,
      finishedAt: operation.finishedAt?.toISOString() ?? null,
      updatedAt: operation.updatedAt.toISOString(),
    };
  }
}
