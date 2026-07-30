import {
  consumerChapterLengthSnapshotSchema,
  consumerProseQualityWarningSchema,
  parseConsumerChapterWritingTask,
  type ConsumerChapterLengthSnapshot,
  type ConsumerChapterWritingTask,
  type ConsumerProseQualityWarning,
} from "@0xnovelagent/shared/types/consumerChapterProduction";
import type { ConsumerCreationOperation } from "@prisma/client";
import { AppError } from "../../../middleware/errorHandler";

export interface ProductionPayload {
  mode: "next_chapter" | "continue_chapter";
  sourceChapterId: string;
  task: ConsumerChapterWritingTask | null;
  length: ConsumerChapterLengthSnapshot | null;
  qualityWarnings: ConsumerProseQualityWarning[];
}

export function parseProductionPayload(
  operation: Pick<ConsumerCreationOperation, "inputJson">,
): ProductionPayload {
  let raw: unknown;
  try {
    raw = operation.inputJson ? JSON.parse(operation.inputJson) : null;
  } catch {
    throw new AppError("章节生成记录数据损坏，请从本地备份恢复后重试。", 500);
  }
  if (!raw || typeof raw !== "object") {
    throw new AppError("章节生成记录缺少必要信息。", 500);
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.sourceChapterId !== "string" || !record.sourceChapterId) {
    throw new AppError("章节生成记录缺少来源章节。", 500);
  }
  return {
    mode: record.mode === "continue_chapter" ? "continue_chapter" : "next_chapter",
    sourceChapterId: record.sourceChapterId,
    task: record.task ? parseConsumerChapterWritingTask(record.task) : null,
    length: record.length && typeof record.length === "object"
      ? consumerChapterLengthSnapshotSchema.parse(record.length)
      : null,
    qualityWarnings: Array.isArray(record.qualityWarnings)
      ? record.qualityWarnings.map((warning) => consumerProseQualityWarningSchema.parse(warning))
      : [],
  };
}
