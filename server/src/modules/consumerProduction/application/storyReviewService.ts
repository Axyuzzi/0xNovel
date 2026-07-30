import { randomUUID } from "node:crypto";
import {
  consumerPlanningOverviewSchema,
  consumerResolveStoryReviewRequestSchema,
  consumerStoryReviewStageSchema,
  type ConsumerPlanningOverview,
  type ConsumerResolveStoryReviewRequest,
  type ConsumerStartStoryAdjustmentRequest,
  type ConsumerStartStoryReviewRequest,
  type ConsumerStoryCheckpoint,
  type ConsumerStoryCheckpointKind,
  type ConsumerStoryReviewOperationKind,
  type ConsumerStoryReviewSnapshot,
} from "@0xnovelagent/shared/types/consumerStoryReview";
import { consumerChapterProductionStatusSchema } from "@0xnovelagent/shared/types/consumerChapterProduction";
import {
  consumerStoredStoryDirectionSchema,
  type ConsumerCreditEstimate,
} from "@0xnovelagent/shared/types/consumerSetup";
import type {
  ConsumerCreationOperation,
  ConsumerStorySetup,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { AppError } from "../../../middleware/errorHandler";
import type { ConsumerStoryReviewPromptInput } from "../../../prompting/prompts/consumer/consumerStoryReview.prompts";
import type { ConsumerChapterProductionCreditMeter } from "./chapterProductionCreditMeter";
import type { ConsumerStoryReviewGenerator } from "./storyReviewGenerator";
import {
  measuredStoryReviewCredits as measuredCredits,
  parseSetupPlans as parsePlans,
  parseStoryJson as parseJson,
  parseStoryReviewPayload as parsePayload,
  parseStoryReviewReport as parseReport,
  safeStoryReviewError as safeError,
  saveConsumerPlanningSnapshot,
  serializeConsumerPlanningVersion,
  storyCompletedChapterHash,
  storyOperationKind as operationKind,
  storyPlanningHash as planningHash,
  type StoryReviewPayload,
} from "./storyReviewSupport";

export interface StartedStoryReview {
  snapshot: ConsumerStoryReviewSnapshot;
  shouldExecute: boolean;
}

export class ConsumerStoryReviewService {
  constructor(
    private readonly db: PrismaClient,
    private readonly generator: ConsumerStoryReviewGenerator,
    private readonly creditMeter: ConsumerChapterProductionCreditMeter,
    private readonly serviceStartedAt = new Date(),
  ) {}

  async getCheckpoint(novelId: string): Promise<ConsumerStoryCheckpoint> {
    const setup = await this.requireSetup(novelId);
    const plans = parsePlans(setup);
    const latestChapter = await this.db.chapter.findFirst({
      where: { novelId },
      orderBy: { order: "desc" },
      include: { consumerDraft: true },
    });
    const latestContent = latestChapter?.consumerDraft?.content
      ?? latestChapter?.content
      ?? "";
    if (
      !latestChapter
      || !latestContent.trim()
      || latestChapter.order < plans.currentPhase.chapterEnd
    ) {
      return this.emptyCheckpoint();
    }

    const volumeBoundary = plans.volumePlan.volumes.reduce<number[]>(
      (boundaries, volume) => {
        const previous = boundaries.at(-1) ?? 0;
        boundaries.push(previous + volume.estimatedChapters);
        return boundaries;
      },
      [],
    ).includes(plans.currentPhase.chapterEnd);
    const kind: ConsumerStoryCheckpointKind = volumeBoundary ? "volume" : "phase";
    const key = `${kind}:${plans.currentPhase.chapterStart}:${plans.currentPhase.chapterEnd}:${setup.revision}`;
    const operation = await this.findCheckpointOperation(novelId, key);
    return {
      required: true,
      key,
      kind,
      title: kind === "volume"
        ? `第 ${plans.currentPhase.chapterEnd} 章后，本卷已经完成`
        : `第 ${plans.currentPhase.chapterEnd} 章后，这一段剧情已经完成`,
      rangeStart: plans.currentPhase.chapterStart,
      rangeEnd: plans.currentPhase.chapterEnd,
      latestOperation: operation
        ? await this.serializeOperation(await this.reconcileOperation(operation))
        : null,
    };
  }

  async startCheckpointReview(
    novelId: string,
    input: ConsumerStartStoryReviewRequest,
  ): Promise<StartedStoryReview> {
    const checkpoint = await this.requireCheckpoint(
      novelId,
      input.checkpointKey,
      input.requestKey,
    );
    return this.startOperation(novelId, input.requestKey, {
      kind: "review",
      checkpointKey: input.checkpointKey,
      checkpointKind: checkpoint.kind,
      rangeStart: checkpoint.rangeStart,
      rangeEnd: checkpoint.rangeEnd,
      instruction: "",
    });
  }

  async skipCheckpointReview(
    novelId: string,
    input: ConsumerStartStoryReviewRequest,
  ): Promise<StartedStoryReview> {
    const checkpoint = await this.requireCheckpoint(
      novelId,
      input.checkpointKey,
      input.requestKey,
    );
    return this.startOperation(novelId, input.requestKey, {
      kind: "transition",
      checkpointKey: input.checkpointKey,
      checkpointKind: checkpoint.kind,
      rangeStart: checkpoint.rangeStart,
      rangeEnd: checkpoint.rangeEnd,
      instruction: "跳过深度检查，只准备下一段剧情。",
    });
  }

  async startAdjustment(
    novelId: string,
    input: ConsumerStartStoryAdjustmentRequest,
  ): Promise<StartedStoryReview> {
    const setup = await this.requireSetup(novelId);
    if (setup.revision !== input.expectedPlanningRevision) {
      throw new AppError("故事规划已经更新，请查看最新内容后再调整。", 409);
    }
    return this.startOperation(novelId, input.requestKey, {
      kind: "adjustment",
      checkpointKey: null,
      checkpointKind: null,
      rangeStart: null,
      rangeEnd: null,
      instruction: input.instruction,
    });
  }

  async executeOperation(operationId: string): Promise<ConsumerStoryReviewSnapshot> {
    const claimed = await this.db.consumerCreationOperation.updateMany({
      where: { id: operationId, status: "created" },
      data: {
        status: "running",
        stage: "analyzing",
        startedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });
    const operation = await this.db.consumerCreationOperation.findUnique({
      where: { id: operationId },
    });
    if (!operation) throw new AppError("故事检查记录不存在。", 404);
    if (claimed.count !== 1) {
      return this.serializeOperation(await this.reconcileOperation(operation));
    }

    const payload = parsePayload(operation);
    const beforeCredits = await this.creditMeter.readAvailableCredits();
    try {
      const report = await this.generator.generate(
        await this.buildPromptInput(operation, payload),
        operation.id,
      );
      const afterCredits = await this.creditMeter.readAvailableCredits();
      await this.db.consumerCreationOperation.update({
        where: { id: operation.id },
        data: {
          status: "succeeded",
          stage: payload.kind === "transition" ? "applying" : "awaiting_confirmation",
          receivedContent: JSON.stringify(report),
          actualCreditsMilli: measuredCredits(beforeCredits, afterCredits),
          resultRefType: "story_review_artifact",
          finishedAt: new Date(),
        },
      });
      if (payload.kind === "transition") {
        await this.applyResolvedPlan(operation.id, "continue_without_changes");
      }
    } catch (error) {
      const afterCredits = await this.creditMeter.readAvailableCredits();
      await this.db.consumerCreationOperation.updateMany({
        where: { id: operation.id, status: { in: ["running", "succeeded"] } },
        data: {
          status: "failed",
          stage: "analyzing",
          actualCreditsMilli: measuredCredits(beforeCredits, afterCredits),
          errorCode: "story_review_failed",
          errorMessage: safeError(error),
          finishedAt: new Date(),
        },
      });
    }
    return this.serializeOperation(await this.requireOperation(operation.novelId, operation.id));
  }

  async resolveOperation(
    novelId: string,
    operationId: string,
    rawInput: ConsumerResolveStoryReviewRequest,
  ): Promise<ConsumerStoryReviewSnapshot> {
    const input = consumerResolveStoryReviewRequestSchema.parse(rawInput);
    const operation = await this.requireOperation(novelId, operationId);
    const payload = parsePayload(operation);
    if (operation.status !== "succeeded" || operation.stage !== "awaiting_confirmation") {
      throw new AppError("这份故事方案当前不能处理。", 409);
    }
    if (payload.kind === "transition") {
      throw new AppError("跳过检查后的下一阶段会自动准备。", 409);
    }
    if (payload.kind === "review" && input.action === "reject") {
      throw new AppError("阶段结束后请选择采用建议或按原规划继续。", 400);
    }
    if (payload.kind === "adjustment" && input.action === "continue_without_changes") {
      throw new AppError("主动调整可以采用方案或放弃调整。", 400);
    }
    const setup = await this.requireSetup(novelId);
    if (setup.revision !== input.expectedPlanningRevision) {
      throw new AppError("故事规划已经更新，这份旧方案不能覆盖新规划。", 409);
    }
    if (input.action === "reject") {
      await this.db.consumerCreationOperation.update({
        where: { id: operation.id },
        data: { stage: "completed", resultRefType: "story_adjustment_rejected" },
      });
    } else {
      await this.applyResolvedPlan(operation.id, input.action);
    }
    return this.serializeOperation(await this.requireOperation(novelId, operationId));
  }

  async getOperation(
    novelId: string,
    operationId: string,
  ): Promise<ConsumerStoryReviewSnapshot> {
    return this.serializeOperation(
      await this.reconcileOperation(await this.requireOperation(novelId, operationId)),
    );
  }

  async getLatest(novelId: string): Promise<ConsumerStoryReviewSnapshot | null> {
    const operation = await this.db.consumerCreationOperation.findFirst({
      where: {
        novelId,
        kind: {
          in: [
            "consumer_story_review",
            "consumer_story_transition",
            "consumer_story_adjustment",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return operation
      ? this.serializeOperation(await this.reconcileOperation(operation))
      : null;
  }

  async getPlanningOverview(novelId: string): Promise<ConsumerPlanningOverview> {
    const setup = await this.requireSetup(novelId);
    const plans = parsePlans(setup);
    const versions = await this.db.consumerPlanningVersion.findMany({
      where: { novelId },
      orderBy: { sequence: "desc" },
    });
    return consumerPlanningOverviewSchema.parse({
      novelId,
      revision: setup.revision,
      idea: setup.idea,
      selectedDirection: consumerStoredStoryDirectionSchema.parse(
        parseJson(setup.selectedDirectionJson, "故事方向"),
      ),
      ...plans,
      versions: versions.map(serializeConsumerPlanningVersion),
    });
  }

  async restorePlanningVersion(
    novelId: string,
    versionId: string,
    expectedPlanningRevision: number,
  ): Promise<ConsumerPlanningOverview> {
    await this.db.$transaction(async (tx) => {
      const setup = await tx.consumerStorySetup.findUnique({ where: { novelId } });
      if (!setup) throw new AppError("作品规划不存在。", 404);
      if (setup.revision !== expectedPlanningRevision) {
        throw new AppError("故事规划已经更新，请查看最新内容后再恢复。", 409);
      }
      const version = await tx.consumerPlanningVersion.findFirst({
        where: { id: versionId, novelId },
      });
      if (!version) throw new AppError("规划版本不存在。", 404);
      await saveConsumerPlanningSnapshot(tx, setup, "恢复前的规划", "before_restore");
      const updated = await tx.consumerStorySetup.update({
        where: { novelId },
        data: {
          bookSkeletonJson: version.bookSkeletonJson,
          volumePlanJson: version.volumePlanJson,
          currentPhaseJson: version.currentPhaseJson,
          revision: { increment: 1 },
        },
      });
      await saveConsumerPlanningSnapshot(
        tx,
        updated,
        `恢复自版本 ${version.sequence}`,
        "version_restored",
        undefined,
        version.id,
      );
    });
    return this.getPlanningOverview(novelId);
  }

  async getCreditEstimate(
    kind: ConsumerStoryReviewOperationKind,
  ): Promise<ConsumerCreditEstimate | null> {
    const samples = await this.db.consumerCreationOperation.findMany({
      where: {
        kind: operationKind(kind),
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
    if (!values.length) return null;
    return {
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      typical: values.reduce((sum, value) => sum + value, 0) / values.length,
      sampleSize: values.length,
    };
  }

  private async startOperation(
    novelId: string,
    requestKey: string,
    input: Omit<
      StoryReviewPayload,
      "basePlanningRevision" | "basePlanningHash" | "baseChapterHash"
    >,
  ): Promise<StartedStoryReview> {
    const duplicate = await this.db.consumerCreationOperation.findUnique({
      where: { requestKey },
    });
    if (duplicate) {
      const payload = parsePayload(duplicate);
      if (
        duplicate.novelId !== novelId
        || duplicate.kind !== operationKind(input.kind)
        || payload.checkpointKey !== input.checkpointKey
        || payload.instruction !== input.instruction
      ) {
        throw new AppError("本次操作标识已被其他创作步骤使用。", 409);
      }
      return {
        snapshot: await this.serializeOperation(await this.reconcileOperation(duplicate)),
        shouldExecute: false,
      };
    }
    const setup = await this.requireSetup(novelId);
    const plans = parsePlans(setup);
    const baseChapterHash = await this.completedChapterHash(novelId);
    const estimate = await this.getCreditEstimate(input.kind);
    const payload: StoryReviewPayload = {
      ...input,
      basePlanningRevision: setup.revision,
      basePlanningHash: planningHash(plans),
      baseChapterHash,
    };
    const operation = await this.db.consumerCreationOperation.create({
      data: {
        id: randomUUID(),
        requestKey,
        novelId,
        kind: operationKind(input.kind),
        status: "created",
        stage: "analyzing",
        inputJson: JSON.stringify(payload),
        estimatedCreditsMilli: estimate ? Math.round(estimate.typical * 1_000) : null,
      },
    });
    return { snapshot: await this.serializeOperation(operation), shouldExecute: true };
  }

  private async applyResolvedPlan(
    operationId: string,
    action: "apply_recommendation" | "continue_without_changes",
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const operation = await tx.consumerCreationOperation.findUnique({
        where: { id: operationId },
      });
      if (!operation) throw new AppError("故事检查记录不存在。", 404);
      const payload = parsePayload(operation);
      const report = parseReport(operation);
      if (!report) throw new AppError("故事检查结果尚未准备好。", 409);
      const setup = await tx.consumerStorySetup.findUnique({
        where: { novelId: operation.novelId },
      });
      if (!setup) throw new AppError("作品规划不存在。", 404);
      const currentPlans = parsePlans(setup);
      if (
        setup.revision !== payload.basePlanningRevision
        || planningHash(currentPlans) !== payload.basePlanningHash
        || await this.completedChapterHash(operation.novelId, tx) !== payload.baseChapterHash
      ) {
        throw new AppError("正文或故事规划已经更新，这份旧方案不能覆盖新内容。", 409);
      }
      await saveConsumerPlanningSnapshot(
        tx,
        setup,
        "调整前的规划",
        "before_story_change",
        operation.id,
      );
      const nextBookSkeleton = action === "apply_recommendation"
        ? report.proposedBookSkeleton ?? currentPlans.bookSkeleton
        : currentPlans.bookSkeleton;
      const nextVolumePlan = action === "apply_recommendation"
        ? report.proposedVolumePlan ?? currentPlans.volumePlan
        : currentPlans.volumePlan;
      const updated = await tx.consumerStorySetup.update({
        where: { novelId: operation.novelId },
        data: {
          bookSkeletonJson: JSON.stringify(nextBookSkeleton),
          volumePlanJson: JSON.stringify(nextVolumePlan),
          currentPhaseJson: JSON.stringify(report.proposedCurrentPhase),
          revision: { increment: 1 },
        },
      });
      await tx.chapter.updateMany({
        where: {
          novelId: operation.novelId,
          order: { gte: report.proposedCurrentPhase.chapterStart },
          OR: [{ content: null }, { content: "" }],
        },
        data: { taskSheet: null },
      });
      const version = await saveConsumerPlanningSnapshot(
        tx,
        updated,
        payload.kind === "review"
          ? "检查后继续"
          : payload.kind === "transition"
            ? "跳过检查并进入下一段"
            : "调整后续剧情",
        payload.kind,
        operation.id,
      );
      await tx.consumerCreationOperation.update({
        where: { id: operation.id },
        data: {
          stage: "completed",
          resultRefType: "consumer_planning_version",
          resultRefId: version.id,
        },
      });
    });
  }

  private async buildPromptInput(
    operation: ConsumerCreationOperation,
    payload: StoryReviewPayload,
  ): Promise<ConsumerStoryReviewPromptInput> {
    const [novel, setup] = await Promise.all([
      this.db.novel.findUnique({ where: { id: operation.novelId } }),
      this.requireSetup(operation.novelId),
    ]);
    if (!novel) throw new AppError("作品不存在。", 404);
    const plans = parsePlans(setup);
    const chapterWhere: Prisma.ChapterWhereInput = {
      novelId: operation.novelId,
      ...(payload.rangeStart && payload.rangeEnd
        ? { order: { gte: payload.rangeStart, lte: payload.rangeEnd } }
        : {}),
    };
    const chapters = await this.db.chapter.findMany({
      where: chapterWhere,
      orderBy: { order: "desc" },
      take: 16,
      include: { consumerDraft: true },
    });
    const ordered = chapters.reverse();
    const latestOrder = ordered.at(-1)?.order ?? plans.currentPhase.chapterEnd;
    return {
      novelId: novel.id,
      novelTitle: novel.title,
      idea: setup.idea,
      selectedDirection: consumerStoredStoryDirectionSchema.parse(
        parseJson(setup.selectedDirectionJson, "故事方向"),
      ),
      ...plans,
      chapters: ordered.map((chapter) => ({
        order: chapter.order,
        title: chapter.title,
        content: (chapter.consumerDraft?.content ?? chapter.content ?? "").slice(-8_000),
      })),
      kind: payload.kind,
      checkpointKind: payload.checkpointKind,
      instruction: payload.instruction,
      nextChapterOrder: latestOrder + 1,
    };
  }

  private async completedChapterHash(
    novelId: string,
    db: PrismaClient | Prisma.TransactionClient = this.db,
  ): Promise<string> {
    const chapters = await db.chapter.findMany({
      where: { novelId },
      orderBy: { order: "asc" },
      take: 10_000,
      include: { consumerDraft: true },
    });
    return storyCompletedChapterHash(chapters);
  }

  private async requireCheckpoint(
    novelId: string,
    checkpointKey: string,
    requestKey?: string,
  ): Promise<ConsumerStoryCheckpoint & {
    kind: ConsumerStoryCheckpointKind;
    rangeStart: number;
    rangeEnd: number;
  }> {
    const checkpoint = await this.getCheckpoint(novelId);
    if (
      !checkpoint.required
      || checkpoint.key !== checkpointKey
      || !checkpoint.kind
      || checkpoint.rangeStart === null
      || checkpoint.rangeEnd === null
    ) {
      throw new AppError("当前没有需要处理的阶段结束提示。", 409);
    }
    if (
      checkpoint.latestOperation
      && ["created", "running", "succeeded"].includes(checkpoint.latestOperation.status)
      && checkpoint.latestOperation.stage !== "completed"
      && checkpoint.latestOperation.requestKey !== requestKey
    ) {
      throw new AppError("这一阶段已经有正在处理的检查或下一段准备。", 409);
    }
    return {
      ...checkpoint,
      kind: checkpoint.kind,
      rangeStart: checkpoint.rangeStart,
      rangeEnd: checkpoint.rangeEnd,
    };
  }

  private async findCheckpointOperation(
    novelId: string,
    checkpointKey: string,
  ): Promise<ConsumerCreationOperation | null> {
    const operations = await this.db.consumerCreationOperation.findMany({
      where: {
        novelId,
        kind: { in: ["consumer_story_review", "consumer_story_transition"] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return operations.find((operation) => {
      try {
        return parsePayload(operation).checkpointKey === checkpointKey;
      } catch {
        return false;
      }
    }) ?? null;
  }

  private emptyCheckpoint(): ConsumerStoryCheckpoint {
    return {
      required: false,
      key: null,
      kind: null,
      title: null,
      rangeStart: null,
      rangeEnd: null,
      latestOperation: null,
    };
  }

  private async requireSetup(novelId: string): Promise<ConsumerStorySetup> {
    const setup = await this.db.consumerStorySetup.findUnique({ where: { novelId } });
    if (!setup || setup.status !== "completed") {
      throw new AppError("作品准备尚未完成。", 409);
    }
    return setup;
  }

  private async requireOperation(
    novelId: string,
    operationId: string,
  ): Promise<ConsumerCreationOperation> {
    const operation = await this.db.consumerCreationOperation.findFirst({
      where: {
        id: operationId,
        novelId,
        kind: {
          in: [
            "consumer_story_review",
            "consumer_story_transition",
            "consumer_story_adjustment",
          ],
        },
      },
    });
    if (!operation) throw new AppError("故事检查记录不存在。", 404);
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
    await this.db.consumerCreationOperation.updateMany({
      where: { id: operation.id, status: operation.status },
      data: {
        status: runningInPreviousProcess ? "outcome_unknown" : "failed",
        errorCode: runningInPreviousProcess ? "process_interrupted" : "process_not_started",
        errorMessage: runningInPreviousProcess
          ? "上一次故事检查在返回前中断。不会自动重试或改动现有规划。"
          : "上一次故事检查尚未发起，可以重新开始。",
        finishedAt: new Date(),
      },
    });
    return (await this.db.consumerCreationOperation.findUnique({
      where: { id: operation.id },
    })) ?? operation;
  }

  private async serializeOperation(
    operation: ConsumerCreationOperation,
  ): Promise<ConsumerStoryReviewSnapshot> {
    const payload = parsePayload(operation);
    return {
      operationId: operation.id,
      novelId: operation.novelId,
      requestKey: operation.requestKey,
      kind: payload.kind,
      checkpointKey: payload.checkpointKey,
      checkpointKind: payload.checkpointKind,
      instruction: payload.instruction,
      status: consumerChapterProductionStatusSchema.parse(operation.status),
      stage: consumerStoryReviewStageSchema.parse(operation.stage ?? "analyzing"),
      report: parseReport(operation),
      receivedContent: operation.receivedContent,
      creditEstimate: await this.getCreditEstimate(payload.kind),
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
