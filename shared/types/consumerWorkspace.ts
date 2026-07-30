import { z } from "zod";

const localIdSchema = z.string().trim().min(1).max(128);
const isoDateSchema = z.string().datetime();
const chapterContentSchema = z.string().max(5_000_000, "单章内容过长，无法保存。");

export function countConsumerChapterCharacters(content: string): number {
  return content.replace(/\s/gu, "").length;
}

export const consumerCreateNovelRequestSchema = z.object({
  title: z.string().trim().min(1, "请填写作品名称。").max(120, "作品名称不能超过 120 个字符。"),
  description: z.string().trim().max(2_000, "作品简介不能超过 2000 个字符。").optional(),
});

export type ConsumerCreateNovelRequest = z.infer<typeof consumerCreateNovelRequestSchema>;

export const consumerNovelSummarySchema = z.object({
  id: localIdSchema,
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  chapterCount: z.number().int().nonnegative(),
  updatedAt: isoDateSchema,
  createdAt: isoDateSchema,
});

export type ConsumerNovelSummary = z.infer<typeof consumerNovelSummarySchema>;

export const consumerCreateChapterRequestSchema = z.object({
  title: z.string().trim().min(1, "请填写章节名称。").max(120, "章节名称不能超过 120 个字符。"),
  content: chapterContentSchema.optional(),
});

export type ConsumerCreateChapterRequest = z.infer<typeof consumerCreateChapterRequestSchema>;

export const consumerChapterSummarySchema = z.object({
  id: localIdSchema,
  novelId: localIdSchema,
  title: z.string(),
  order: z.number().int().positive(),
  content: z.string(),
  wordCount: z.number().int().nonnegative(),
  updatedAt: isoDateSchema,
  createdAt: isoDateSchema,
});

export type ConsumerChapterSummary = z.infer<typeof consumerChapterSummarySchema>;

export const consumerChapterDraftSchema = z.object({
  id: localIdSchema,
  chapterId: localIdSchema,
  content: z.string(),
  revision: z.number().int().nonnegative(),
  cursorStart: z.number().int().nonnegative().nullable(),
  cursorEnd: z.number().int().nonnegative().nullable(),
  baseVersionId: z.string().nullable(),
  source: z.string(),
  updatedAt: isoDateSchema,
});

export type ConsumerChapterDraft = z.infer<typeof consumerChapterDraftSchema>;

export const consumerSaveDraftRequestSchema = z.object({
  content: chapterContentSchema,
  expectedRevision: z.number().int().nonnegative(),
  cursorStart: z.number().int().nonnegative().nullable().optional(),
  cursorEnd: z.number().int().nonnegative().nullable().optional(),
}).superRefine((value, context) => {
  if (
    value.cursorStart != null
    && value.cursorEnd != null
    && (value.cursorStart > value.cursorEnd || value.cursorEnd > value.content.length)
  ) {
    context.addIssue({
      code: "custom",
      path: ["cursorEnd"],
      message: "光标位置与正文不一致。",
    });
  }
});

export type ConsumerSaveDraftRequest = z.infer<typeof consumerSaveDraftRequestSchema>;

export const consumerCommitDraftRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  reason: z.enum(["manual_confirm", "chapter_confirm", "before_ai_change"]).default("manual_confirm"),
});

export type ConsumerCommitDraftRequest = z.infer<typeof consumerCommitDraftRequestSchema>;

export const consumerCandidateStatusSchema = z.enum(["pending", "adopted", "rejected"]);
export type ConsumerCandidateStatus = z.infer<typeof consumerCandidateStatusSchema>;

export const consumerCreateCandidateRequestSchema = z.object({
  content: chapterContentSchema.min(1, "候选稿不能为空。"),
  instruction: z.string().trim().max(2_000).optional(),
  source: z.enum(["ai_revision", "ai_rewrite", "ai_continue", "ai_generate"]).default("ai_revision"),
  operationId: localIdSchema.optional(),
});

export type ConsumerCreateCandidateRequest = z.infer<typeof consumerCreateCandidateRequestSchema>;

export const consumerChapterCandidateSchema = z.object({
  id: localIdSchema,
  chapterId: localIdSchema,
  content: z.string(),
  instruction: z.string().nullable(),
  source: z.string(),
  status: consumerCandidateStatusSchema,
  operationId: z.string().nullable(),
  resolvedAt: isoDateSchema.nullable(),
  createdAt: isoDateSchema,
});

export type ConsumerChapterCandidate = z.infer<typeof consumerChapterCandidateSchema>;

export const consumerResolveCandidateRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("adopt"),
    expectedRevision: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("reject"),
  }),
]);

export type ConsumerResolveCandidateRequest = z.infer<
  typeof consumerResolveCandidateRequestSchema
>;

export const consumerChapterVersionSchema = z.object({
  id: localIdSchema,
  chapterId: localIdSchema,
  sequence: z.number().int().positive(),
  title: z.string(),
  content: z.string(),
  contentHash: z.string(),
  reason: z.string(),
  sourceCandidateId: z.string().nullable(),
  operationId: z.string().nullable(),
  createdAt: isoDateSchema,
});

export type ConsumerChapterVersion = z.infer<typeof consumerChapterVersionSchema>;

export const consumerChapterWorkspaceSchema = z.object({
  chapter: consumerChapterSummarySchema,
  draft: consumerChapterDraftSchema,
  candidates: z.array(consumerChapterCandidateSchema),
  versions: z.array(consumerChapterVersionSchema),
});

export type ConsumerChapterWorkspace = z.infer<typeof consumerChapterWorkspaceSchema>;

export const consumerNovelWorkspaceSchema = z.object({
  novel: consumerNovelSummarySchema,
  chapters: z.array(consumerChapterSummarySchema),
});

export type ConsumerNovelWorkspace = z.infer<typeof consumerNovelWorkspaceSchema>;

export const consumerRestoreVersionRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
});

export type ConsumerRestoreVersionRequest = z.infer<typeof consumerRestoreVersionRequestSchema>;
