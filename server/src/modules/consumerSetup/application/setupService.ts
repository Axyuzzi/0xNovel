import { createHash, randomUUID } from "node:crypto";
import {
  consumerBookSkeletonSchema,
  consumerCurrentPhasePlanSchema,
  consumerFirstChapterArtifactSchema,
  consumerSetupStatusSchema,
  consumerSetupStepSchema,
  consumerStoryDirectionsArtifactSchema,
  consumerStoredStoryDirectionSchema,
  consumerStoredStoryDirectionsArtifactSchema,
  consumerVolumePlanSchema,
  type ConsumerBookSkeleton,
  type ConsumerCreditEstimate,
  type ConsumerCurrentPhasePlan,
  type ConsumerFirstChapterArtifact,
  type ConsumerSetupConfirmRequest,
  type ConsumerSetupGenerateRequest,
  type ConsumerSetupSnapshot,
  type ConsumerSetupStep,
  type ConsumerStoryDirection,
  type ConsumerStoryDirectionsArtifact,
  type ConsumerVolumePlan,
} from "@0xnovelagent/shared/types/consumerSetup";
import type { ConsumerStorySetup, Prisma, PrismaClient } from "@prisma/client";
import type { ZodType } from "zod";
import { AppError } from "../../../middleware/errorHandler";
import type { ConsumerSetupCreditMeter } from "./setupCreditMeter";
import type {
  ConsumerSetupGenerationContext,
  ConsumerSetupGenerator,
} from "./setupGenerator";
import { SetupPreviewWriter } from "./setupPreviewWriter";
import { parseStoryDirectionPreviews } from "./storyDirectionPreview";

type SetupDb = PrismaClient | Prisma.TransactionClient;
type ActiveSetupStep = Exclude<ConsumerSetupStep, "completed">;
const nextStep: Record<ActiveSetupStep, ConsumerSetupStep> = {
  story_direction: "book_skeleton",
  book_skeleton: "volume_plan",
  volume_plan: "current_phase",
  current_phase: "first_chapter",
  first_chapter: "completed",
};
function operationKind(step: ActiveSetupStep): string {
  return `consumer_setup_${step}`;
}

function stringifyArtifact(value: unknown): string {
  return JSON.stringify(value);
}

function parseStored<T>(schema: ZodType<T>, value: string | null, label: string): T | null {
  if (!value) {
    return null;
  }
  try {
    return schema.parse(JSON.parse(value));
  } catch {
    throw new AppError(`${label}数据损坏，请从本地备份恢复后重试。`, 500);
  }
}

function creditsFromMilli(value: number | null): number | null {
  return value === null ? null : value / 1_000;
}

function measuredCredits(before: number | null, after: number | null): number | null {
  if (before === null || after === null) {
    return null;
  }
  return Math.max(0, Math.round((before - after) * 1_000));
}

function safeGenerationError(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }
  return "创作服务暂时没有完成这一步。";
}

function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export class ConsumerSetupService {
  private readonly serviceStartedAt: Date;

  constructor(
    private readonly db: PrismaClient,
    private readonly generator: ConsumerSetupGenerator,
    private readonly creditMeter: ConsumerSetupCreditMeter,
    serviceStartedAt = new Date(),
  ) {
    this.serviceStartedAt = serviceStartedAt;
  }

  async getSnapshot(novelId: string): Promise<ConsumerSetupSnapshot> {
    const setup = await this.ensureSetup(novelId);
    const reconciled = await this.reconcileInterruptedGeneration(setup);
    return this.serializeSnapshot(reconciled);
  }

  async generate(
    novelId: string,
    input: ConsumerSetupGenerateRequest,
  ): Promise<ConsumerSetupSnapshot> {
    const step = input.step as ActiveSetupStep;
    const kind = operationKind(step);
    const duplicate = await this.db.consumerCreationOperation.findUnique({
      where: { requestKey: input.requestKey },
    });
    if (duplicate) {
      if (duplicate.novelId !== novelId || duplicate.kind !== kind) {
        throw new AppError("本次操作标识已被其他创作步骤使用。", 409);
      }
      return this.getSnapshot(novelId);
    }

    const setup = await this.reconcileInterruptedGeneration(await this.ensureSetup(novelId));
    this.requireGenerationState(setup, step, input.expectedRevision);
    const context = this.buildGenerationContext(setup, step);
    const estimate = await this.getCreditEstimate(kind);
    const operationId = randomUUID();

    await this.db.$transaction(async (tx) => {
      const claimed = await tx.consumerStorySetup.updateMany({
        where: {
          id: setup.id,
          revision: input.expectedRevision,
          step,
          status: { in: ["awaiting_generation", "failed", "outcome_unknown"] },
        },
        data: {
          status: "generating",
          activeOperationId: operationId,
          lastError: null,
          revision: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        throw new AppError("这一步已经在其他窗口更新，请重新打开后继续。", 409);
      }
      await tx.consumerCreationOperation.create({
        data: {
          id: operationId,
          requestKey: input.requestKey,
          novelId,
          kind,
          status: "running",
          stage: step,
          inputJson: stringifyArtifact({ idea: setup.idea, step }),
          estimatedCreditsMilli: estimate ? Math.round(estimate.typical * 1_000) : null,
          startedAt: new Date(),
        },
      });
    });

    const beforeCredits = await this.creditMeter.readAvailableCredits();
    const previewWriter = new SetupPreviewWriter(
      this.db,
      operationId,
      step === "story_direction",
    );
    try {
      const generated = await this.generator.generate(step, {
        ...context,
        operationId,
      }, async (content) => {
        await previewWriter.append(content);
      });
      await previewWriter.flush();
      const afterCredits = await this.creditMeter.readAvailableCredits();
      await this.persistGenerationResult({
        novelId,
        setupId: setup.id,
        operationId,
        step,
        artifact: generated.artifact,
        relayRequestId: generated.relayRequestId,
        actualCreditsMilli: measuredCredits(beforeCredits, afterCredits),
      });
      return this.getSnapshot(novelId);
    } catch (error) {
      const afterCredits = await this.creditMeter.readAvailableCredits();
      const actualCreditsMilli = measuredCredits(beforeCredits, afterCredits);
      const message = safeGenerationError(error);
      await this.db.$transaction(async (tx) => {
        await tx.consumerCreationOperation.updateMany({
          where: { id: operationId, status: "running" },
          data: {
            status: "failed",
            actualCreditsMilli,
            errorCode: "generation_failed",
            errorMessage: message,
            finishedAt: new Date(),
          },
        });
        await tx.consumerStorySetup.updateMany({
          where: { id: setup.id, activeOperationId: operationId },
          data: {
            status: "failed",
            activeOperationId: null,
            lastActualCreditsMilli: actualCreditsMilli,
            lastError: message,
            revision: { increment: 1 },
          },
        });
      });
      throw new AppError("这一步没有完成，已保留当前进度。你可以稍后手动重试。", 502);
    }
  }

  async confirm(
    novelId: string,
    input: ConsumerSetupConfirmRequest,
  ): Promise<ConsumerSetupSnapshot> {
    const step = input.step as ActiveSetupStep;
    const setup = await this.reconcileInterruptedGeneration(await this.ensureSetup(novelId));
    if (
      setup.step !== step
      || setup.status !== "awaiting_confirmation"
      || setup.revision !== input.expectedRevision
    ) {
      throw new AppError("这一步已经更新，请重新查看最新结果。", 409);
    }

    if (step === "story_direction") {
      await this.confirmDirection(setup, input);
    } else if (step === "first_chapter") {
      await this.confirmFirstChapter(setup);
    } else {
      await this.advanceSetup(setup, step);
    }
    return this.getSnapshot(novelId);
  }

  private async ensureSetup(novelId: string): Promise<ConsumerStorySetup> {
    const novel = await this.db.novel.findUnique({ where: { id: novelId } });
    if (!novel) {
      throw new AppError("作品不存在。", 404);
    }
    return this.db.consumerStorySetup.upsert({
      where: { novelId },
      create: {
        novelId,
        idea: novel.description?.trim() || novel.title,
      },
      update: {},
    });
  }

  private async reconcileInterruptedGeneration(
    setup: ConsumerStorySetup,
  ): Promise<ConsumerStorySetup> {
    if (setup.status !== "generating") {
      return setup;
    }
    const operation = setup.activeOperationId
      ? await this.db.consumerCreationOperation.findUnique({
          where: { id: setup.activeOperationId },
        })
      : null;
    const belongsToPreviousProcess = !operation?.startedAt
      || operation.startedAt < this.serviceStartedAt;
    if (!belongsToPreviousProcess) {
      return setup;
    }
    await this.db.$transaction(async (tx) => {
      if (operation) {
        await tx.consumerCreationOperation.updateMany({
          where: { id: operation.id, status: "running" },
          data: {
            status: "outcome_unknown",
            errorCode: "process_interrupted",
            errorMessage: "上一次生成在完成前中断，无法确认是否产生消费。",
            finishedAt: new Date(),
          },
        });
      }
      await tx.consumerStorySetup.updateMany({
        where: {
          id: setup.id,
          status: "generating",
          activeOperationId: setup.activeOperationId,
        },
        data: {
          status: "outcome_unknown",
          activeOperationId: null,
          lastError: "上一次生成在完成前中断，无法确认是否产生消费。再次生成会创建一笔新的调用。",
          revision: { increment: 1 },
        },
      });
    });
    const refreshed = await this.db.consumerStorySetup.findUnique({ where: { id: setup.id } });
    if (!refreshed) {
      throw new AppError("作品准备记录不存在。", 404);
    }
    return refreshed;
  }

  private requireGenerationState(
    setup: ConsumerStorySetup,
    step: ActiveSetupStep,
    expectedRevision: number,
  ): void {
    if (setup.step !== step || setup.revision !== expectedRevision) {
      throw new AppError("这一步已经更新，请重新查看后继续。", 409);
    }
    if (!["awaiting_generation", "failed", "outcome_unknown"].includes(setup.status)) {
      throw new AppError(
        setup.status === "awaiting_confirmation"
          ? "请先确认当前结果，再进入下一步。"
          : "这一步正在处理中，请不要重复提交。",
        409,
      );
    }
  }

  private buildGenerationContext(
    setup: ConsumerStorySetup,
    step: ActiveSetupStep,
  ): Omit<ConsumerSetupGenerationContext, "operationId"> {
    const context = {
      novelId: setup.novelId,
      idea: setup.idea,
      selectedDirection: parseStored(
        consumerStoredStoryDirectionSchema,
        setup.selectedDirectionJson,
        "故事方向",
      ),
      bookSkeleton: parseStored(
        consumerBookSkeletonSchema,
        setup.bookSkeletonJson,
        "全书骨架",
      ),
      volumePlan: parseStored(
        consumerVolumePlanSchema,
        setup.volumePlanJson,
        "卷规划",
      ),
      currentPhase: parseStored(
        consumerCurrentPhasePlanSchema,
        setup.currentPhaseJson,
        "当前剧情阶段",
      ),
    };
    if (step !== "story_direction" && !context.selectedDirection) {
      throw new AppError("请先确认故事方向。", 409);
    }
    if (["volume_plan", "current_phase", "first_chapter"].includes(step) && !context.bookSkeleton) {
      throw new AppError("请先确认全书骨架。", 409);
    }
    if (["current_phase", "first_chapter"].includes(step) && !context.volumePlan) {
      throw new AppError("请先确认全部卷规划。", 409);
    }
    if (step === "first_chapter" && !context.currentPhase) {
      throw new AppError("请先确认当前剧情阶段。", 409);
    }
    return context;
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
    if (values.length === 0) {
      return null;
    }
    return {
      typical: values.reduce((sum, value) => sum + value, 0) / values.length,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      sampleSize: values.length,
    };
  }

  private async serializeSnapshot(setup: ConsumerStorySetup): Promise<ConsumerSetupSnapshot> {
    const step = consumerSetupStepSchema.parse(setup.step);
    const status = consumerSetupStatusSchema.parse(setup.status);
    const directionPreviews = (
      step === "story_direction"
      && status === "generating"
      && setup.activeOperationId
    )
      ? await this.readDirectionPreviews(setup.activeOperationId)
      : null;
    return {
      novelId: setup.novelId,
      idea: setup.idea,
      step,
      status,
      revision: setup.revision,
      creditEstimate: step === "completed"
        ? null
        : await this.getCreditEstimate(operationKind(step)),
      lastActualCredits: creditsFromMilli(setup.lastActualCreditsMilli),
      directions: parseStored(
        consumerStoredStoryDirectionsArtifactSchema,
        setup.directionsJson,
        "故事方向",
      ),
      directionPreviews,
      selectedDirection: parseStored(
        consumerStoredStoryDirectionSchema,
        setup.selectedDirectionJson,
        "已选故事方向",
      ),
      bookSkeleton: parseStored(
        consumerBookSkeletonSchema,
        setup.bookSkeletonJson,
        "全书骨架",
      ),
      volumePlan: parseStored(
        consumerVolumePlanSchema,
        setup.volumePlanJson,
        "全部卷规划",
      ),
      currentPhase: parseStored(
        consumerCurrentPhasePlanSchema,
        setup.currentPhaseJson,
        "当前剧情阶段",
      ),
      firstChapter: parseStored(
        consumerFirstChapterArtifactSchema,
        setup.firstChapterJson,
        "第一章",
      ),
      firstChapterId: setup.firstChapterId,
      lastError: setup.lastError,
      updatedAt: setup.updatedAt.toISOString(),
    };
  }

  private async readDirectionPreviews(
    operationId: string,
  ): Promise<ConsumerSetupSnapshot["directionPreviews"]> {
    const operation = await this.db.consumerCreationOperation.findUnique({
      where: { id: operationId },
      select: { receivedContent: true },
    });
    return parseStoryDirectionPreviews(operation?.receivedContent ?? "");
  }

  private async persistGenerationResult(input: {
    novelId: string;
    setupId: string;
    operationId: string;
    step: ActiveSetupStep;
    artifact: unknown;
    relayRequestId: string | null;
    actualCreditsMilli: number | null;
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      let resultRefType = "story_setup";
      let resultRefId = input.setupId;
      const setupData: Prisma.ConsumerStorySetupUpdateManyMutationInput = {
        status: "awaiting_confirmation",
        activeOperationId: null,
        lastActualCreditsMilli: input.actualCreditsMilli,
        lastError: null,
        revision: { increment: 1 },
      };

      switch (input.step) {
        case "story_direction": {
          const artifact = consumerStoryDirectionsArtifactSchema.parse(input.artifact);
          setupData.directionsJson = stringifyArtifact(artifact);
          break;
        }
        case "book_skeleton": {
          const artifact = consumerBookSkeletonSchema.parse(input.artifact);
          setupData.bookSkeletonJson = stringifyArtifact(artifact);
          break;
        }
        case "volume_plan": {
          const artifact = consumerVolumePlanSchema.parse(input.artifact);
          setupData.volumePlanJson = stringifyArtifact(artifact);
          break;
        }
        case "current_phase": {
          const artifact = consumerCurrentPhasePlanSchema.parse(input.artifact);
          setupData.currentPhaseJson = stringifyArtifact(artifact);
          break;
        }
        case "first_chapter": {
          const artifact = consumerFirstChapterArtifactSchema.parse(input.artifact);
          const latest = await tx.chapter.findFirst({
            where: { novelId: input.novelId },
            orderBy: { order: "desc" },
            select: { order: true },
          });
          const chapter = await tx.chapter.create({
            data: {
              novelId: input.novelId,
              title: artifact.title,
              content: "",
              order: (latest?.order ?? 0) + 1,
            },
          });
          await tx.consumerChapterDraft.create({
            data: {
              chapterId: chapter.id,
              content: "",
              source: "setup",
            },
          });
          const candidate = await tx.consumerChapterCandidate.create({
            data: {
              chapterId: chapter.id,
              content: artifact.content,
              instruction: "新书初始化生成的第一章",
              source: "setup_first_chapter",
              operationId: input.operationId,
            },
          });
          setupData.firstChapterJson = stringifyArtifact(artifact);
          setupData.firstChapterId = chapter.id;
          setupData.firstChapterCandidateId = candidate.id;
          resultRefType = "chapter_candidate";
          resultRefId = candidate.id;
          break;
        }
      }

      const saved = await tx.consumerStorySetup.updateMany({
        where: {
          id: input.setupId,
          step: input.step,
          status: "generating",
          activeOperationId: input.operationId,
        },
        data: setupData,
      });
      if (saved.count !== 1) {
        throw new AppError("生成结果无法安全保存，请不要重复提交。", 409);
      }
      await tx.consumerCreationOperation.update({
        where: { id: input.operationId },
        data: {
          status: "succeeded",
          receivedContent: stringifyArtifact(input.artifact),
          actualCreditsMilli: input.actualCreditsMilli,
          relayRequestId: input.relayRequestId,
          resultRefType,
          resultRefId,
          finishedAt: new Date(),
        },
      });
    });
  }

  private async confirmDirection(
    setup: ConsumerStorySetup,
    input: ConsumerSetupConfirmRequest,
  ): Promise<void> {
    const directions = parseStored(
      consumerStoredStoryDirectionsArtifactSchema,
      setup.directionsJson,
      "故事方向",
    );
    const selected = directions?.directions.find((item) => item.id === input.selectedDirectionId);
    if (!selected) {
      throw new AppError("请选择一个故事方向。", 400);
    }
    const title = input.title?.trim() || selected.title;
    const description = input.description?.trim() || selected.premise;
    await this.db.$transaction(async (tx) => {
      const advanced = await tx.consumerStorySetup.updateMany({
        where: {
          id: setup.id,
          revision: setup.revision,
          step: "story_direction",
          status: "awaiting_confirmation",
        },
        data: {
          selectedDirectionJson: stringifyArtifact(selected),
          step: "book_skeleton",
          status: "awaiting_generation",
          revision: { increment: 1 },
        },
      });
      if (advanced.count !== 1) {
        throw new AppError("故事方向已经在其他窗口更新。", 409);
      }
      await tx.novel.update({
        where: { id: setup.novelId },
        data: {
          title,
          description,
          estimatedChapterCount: selected.estimatedChapters,
          styleTone: selected.tone,
        },
      });
    });
  }

  private async advanceSetup(setup: ConsumerStorySetup, step: ActiveSetupStep): Promise<void> {
    const advanced = await this.db.consumerStorySetup.updateMany({
      where: {
        id: setup.id,
        revision: setup.revision,
        step,
        status: "awaiting_confirmation",
      },
      data: {
        step: nextStep[step],
        status: nextStep[step] === "completed" ? "completed" : "awaiting_generation",
        revision: { increment: 1 },
      },
    });
    if (advanced.count !== 1) {
      throw new AppError("这一步已经在其他窗口更新。", 409);
    }
  }

  private async confirmFirstChapter(setup: ConsumerStorySetup): Promise<void> {
    if (!setup.firstChapterId || !setup.firstChapterCandidateId) {
      throw new AppError("第一章候选稿不存在，请重新生成。", 409);
    }
    const firstChapterId = setup.firstChapterId;
    const firstChapterCandidateId = setup.firstChapterCandidateId;
    await this.db.$transaction(async (tx) => {
      const advanced = await tx.consumerStorySetup.updateMany({
        where: {
          id: setup.id,
          revision: setup.revision,
          step: "first_chapter",
          status: "awaiting_confirmation",
        },
        data: {
          step: "completed",
          status: "completed",
          revision: { increment: 1 },
        },
      });
      if (advanced.count !== 1) {
        throw new AppError("第一章已经在其他窗口更新。", 409);
      }
      const candidate = await tx.consumerChapterCandidate.findFirst({
        where: {
          id: firstChapterCandidateId,
          chapterId: firstChapterId,
        },
      });
      if (!candidate) {
        throw new AppError("第一章候选稿不存在。", 404);
      }
      const claimed = await tx.consumerChapterCandidate.updateMany({
        where: { id: candidate.id, status: "pending" },
        data: { status: "adopted", resolvedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new AppError("第一章候选稿已经处理过。", 409);
      }
      const chapter = await tx.chapter.findUnique({ where: { id: firstChapterId } });
      if (!chapter) {
        throw new AppError("第一章不存在。", 404);
      }
      const version = await tx.consumerChapterVersion.create({
        data: {
          chapterId: chapter.id,
          sequence: 1,
          title: chapter.title,
          content: candidate.content,
          contentHash: contentHash(candidate.content),
          reason: "setup_confirmed",
          sourceCandidateId: candidate.id,
          operationId: candidate.operationId ?? undefined,
        },
      });
      await tx.chapter.update({
        where: { id: chapter.id },
        data: { content: candidate.content },
      });
      await tx.consumerChapterDraft.update({
        where: { chapterId: chapter.id },
        data: {
          content: candidate.content,
          baseVersionId: version.id,
          source: "setup_confirmed",
          revision: { increment: 1 },
        },
      });
    });
  }
}
