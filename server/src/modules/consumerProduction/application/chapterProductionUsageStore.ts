import type { PrismaClient } from "@prisma/client";
import type { ConsumerCreditEstimate } from "@0xnovelagent/shared/types/consumerSetup";
import type { LlmTokenUsageSnapshot } from "../../../llm/usageTracking";
import type {
  ConsumerChapterProductionCreditMeter,
  ConsumerCreditCheckpoint,
} from "./chapterProductionCreditMeter";

export interface ChapterProductionCreditStart {
  checkpoint: ConsumerCreditCheckpoint | null;
  availableCredits: number | null;
}

export interface ChapterProductionUsageSummary {
  totalCredits: number | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  callCount: number;
}

function measuredCredits(before: number | null, after: number | null): number | null {
  if (before === null || after === null) return null;
  const measured = Math.round((before - after) * 1_000);
  return measured > 0 ? measured : null;
}

function creditsToMilli(credits: number | null): number | null {
  if (credits === null || !Number.isFinite(credits)) return null;
  const milli = Math.round(credits * 1_000);
  return milli > 0 ? milli : null;
}

export class ChapterProductionUsageStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly creditMeter: ConsumerChapterProductionCreditMeter,
  ) {}

  async captureCreditStart(): Promise<ChapterProductionCreditStart> {
    const checkpoint = await this.creditMeter.readCheckpoint?.() ?? null;
    return {
      checkpoint,
      availableCredits: checkpoint?.availableCredits
        ?? await this.creditMeter.readAvailableCredits(),
    };
  }

  async recordOperationUsage(
    operationId: string,
    usage: LlmTokenUsageSnapshot,
  ): Promise<void> {
    await this.db.consumerCreationOperation.update({
      where: { id: operationId },
      data: {
        promptTokens: { increment: usage.promptTokens },
        completionTokens: { increment: usage.completionTokens },
        totalTokens: { increment: usage.totalTokens },
        llmCallCount: { increment: 1 },
      },
    });
  }

  async readActualCreditsMilli(
    start: ChapterProductionCreditStart,
  ): Promise<number | null> {
    if (start.checkpoint && this.creditMeter.readActualCreditsSince) {
      return creditsToMilli(
        await this.creditMeter.readActualCreditsSince(start.checkpoint),
      );
    }
    const afterCredits = await this.creditMeter.readAvailableCredits();
    return measuredCredits(start.availableCredits, afterCredits);
  }

  async getChapterUsage(chapterId: string): Promise<ChapterProductionUsageSummary> {
    const rows = await this.db.consumerCreationOperation.findMany({
      where: { chapterId },
      select: {
        actualCreditsMilli: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        llmCallCount: true,
      },
    });
    const sumMilli = rows.reduce(
      (total, row) => total + (row.actualCreditsMilli ?? 0),
      0,
    );
    return {
      totalCredits: sumMilli > 0 ? sumMilli / 1_000 : null,
      promptTokens: rows.reduce((total, row) => total + (row.promptTokens ?? 0), 0),
      completionTokens: rows.reduce(
        (total, row) => total + (row.completionTokens ?? 0),
        0,
      ),
      totalTokens: rows.reduce((total, row) => total + (row.totalTokens ?? 0), 0),
      callCount: rows.reduce((total, row) => total + (row.llmCallCount ?? 0), 0),
    };
  }

  async getCreditEstimate(kind: string): Promise<ConsumerCreditEstimate | null> {
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
      .filter((value): value is number => value !== null && value > 0)
      .map((value) => value / 1_000);
    if (!values.length) return null;
    return {
      typical: values.reduce((sum, value) => sum + value, 0) / values.length,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      sampleSize: values.length,
    };
  }
}
