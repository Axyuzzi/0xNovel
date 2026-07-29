import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import {
  consumerResumeChapterRequestSchema,
  consumerStartNextChapterRequestSchema,
} from "@0xnovelagent/shared/types/consumerChapterProduction";
import {
  consumerChapterRevisionModeSchema,
  consumerStartChapterRevisionRequestSchema,
} from "@0xnovelagent/shared/types/consumerChapterRevision";
import {
  consumerRestorePlanningVersionRequestSchema,
  consumerResolveStoryReviewRequestSchema,
  consumerSkipStoryReviewRequestSchema,
  consumerStartStoryAdjustmentRequestSchema,
  consumerStartStoryReviewRequestSchema,
  consumerStoryReviewOperationKindSchema,
} from "@0xnovelagent/shared/types/consumerStoryReview";
import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../../middleware/errorHandler";
import { validate } from "../../../middleware/validate";
import { relayCredentialStore } from "../../../relay/auth/RelayCredentialStore";
import {
  consumerChapterProductionService,
  consumerChapterRevisionService,
  consumerStoryReviewService,
} from "../application/chapterProductionServiceInstance";

const router = Router();

const novelParamsSchema = z.object({
  novelId: z.string().trim().min(1).max(128),
});

const chapterParamsSchema = novelParamsSchema.extend({
  chapterId: z.string().trim().min(1).max(128),
});

const operationParamsSchema = novelParamsSchema.extend({
  operationId: z.string().trim().min(1).max(128),
});

const planningVersionParamsSchema = novelParamsSchema.extend({
  versionId: z.string().trim().min(1).max(128),
});

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function executeInBackground(operationId: string): void {
  void consumerChapterProductionService.executeOperation(operationId).catch((error) => {
    console.error("[consumer-production] background execution failed", {
      operationId,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

function executeRevisionInBackground(operationId: string): void {
  void consumerChapterRevisionService.executeOperation(operationId).catch((error) => {
    console.error("[consumer-revision] background execution failed", {
      operationId,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

function executeStoryReviewInBackground(operationId: string): void {
  void consumerStoryReviewService.executeOperation(operationId).catch((error) => {
    console.error("[consumer-story-review] background execution failed", {
      operationId,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

router.use((_req, _res, next) => {
  if (!relayCredentialStore.getUser()) {
    next(new AppError("登录后才能继续生成章节。", 401));
    return;
  }
  next();
});

// 换账号 / 退出前主动排空在途的付费创作操作，避免停服务后它们永远卡在 running。
// 这是一个 best-effort 操作：调用方（桌面换账号流程）会在之后停掉服务进程，
// 即使这里失败也不应阻断换账号，只是那些操作会在下次启动时由 reconcileOperation 兜底。
router.post("/operations/drain", async (_req, res, next) => {
  try {
    const result = await consumerChapterProductionService.drainInFlightOperations();
    res.status(200).json({
      success: true,
      data: result,
    } satisfies ApiResponse<typeof result>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/novels/:novelId/chapters/:chapterId/next",
  validate({
    params: chapterParamsSchema,
    body: consumerStartNextChapterRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const started = await consumerChapterProductionService.startNextChapter(
        routeParam(req.params.novelId),
        routeParam(req.params.chapterId),
        req.body,
      );
      if (started.shouldExecute) {
        executeInBackground(started.snapshot.operationId);
      }
      res.status(202).json({
        success: true,
        data: started.snapshot,
        message: "下一章正在准备。",
      } satisfies ApiResponse<typeof started.snapshot>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/novels/:novelId/chapters/:chapterId/resume",
  validate({
    params: chapterParamsSchema,
    body: consumerResumeChapterRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const started = await consumerChapterProductionService.resumeChapter(
        routeParam(req.params.novelId),
        routeParam(req.params.chapterId),
        req.body,
      );
      if (started.shouldExecute) {
        executeInBackground(started.snapshot.operationId);
      }
      res.status(202).json({
        success: true,
        data: started.snapshot,
        message: "正在从保留的正文继续。",
      } satisfies ApiResponse<typeof started.snapshot>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/estimate/next-chapter",
  async (_req, res, next) => {
    try {
      const data = await consumerChapterProductionService.getNextChapterEstimate();
      res.status(200).json({
        success: true,
        data,
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/novels/:novelId/chapters/:chapterId/latest",
  validate({ params: chapterParamsSchema }),
  async (req, res, next) => {
    try {
      const data = await consumerChapterProductionService.getLatestForChapter(
        routeParam(req.params.novelId),
        routeParam(req.params.chapterId),
      );
      res.status(200).json({
        success: true,
        data,
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/novels/:novelId/operations/:operationId",
  validate({ params: operationParamsSchema }),
  async (req, res, next) => {
    try {
      const data = await consumerChapterProductionService.getOperation(
        routeParam(req.params.novelId),
        routeParam(req.params.operationId),
      );
      res.status(200).json({
        success: true,
        data,
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/novels/:novelId/progress",
  validate({ params: novelParamsSchema }),
  async (req, res, next) => {
    try {
      const data = await consumerChapterProductionService.listProgress(
        routeParam(req.params.novelId),
      );
      res.status(200).json({
        success: true,
        data,
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/novels/:novelId/chapters/:chapterId/revisions",
  validate({
    params: chapterParamsSchema,
    body: consumerStartChapterRevisionRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const started = await consumerChapterRevisionService.startRevision(
        routeParam(req.params.novelId),
        routeParam(req.params.chapterId),
        req.body,
      );
      if (started.shouldExecute) {
        executeRevisionInBackground(started.snapshot.operationId);
      }
      res.status(202).json({
        success: true,
        data: started.snapshot,
        message: req.body.mode === "rewrite"
          ? "正在重新创作这一章，原文会保留。"
          : "正在准备修改建议，当前正文不会被覆盖。",
      } satisfies ApiResponse<typeof started.snapshot>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/estimate/chapter-revision",
  validate({
    query: z.object({ mode: consumerChapterRevisionModeSchema }),
  }),
  async (req, res, next) => {
    try {
      const mode = consumerChapterRevisionModeSchema.parse(req.query.mode);
      const data = await consumerChapterRevisionService.getCreditEstimate(mode);
      res.status(200).json({
        success: true,
        data,
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/novels/:novelId/chapters/:chapterId/revisions/latest",
  validate({ params: chapterParamsSchema }),
  async (req, res, next) => {
    try {
      const data = await consumerChapterRevisionService.getLatestForChapter(
        routeParam(req.params.novelId),
        routeParam(req.params.chapterId),
      );
      res.status(200).json({
        success: true,
        data,
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/novels/:novelId/revisions/:operationId",
  validate({ params: operationParamsSchema }),
  async (req, res, next) => {
    try {
      const data = await consumerChapterRevisionService.getOperation(
        routeParam(req.params.novelId),
        routeParam(req.params.operationId),
      );
      res.status(200).json({
        success: true,
        data,
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/novels/:novelId/story-checkpoint",
  validate({ params: novelParamsSchema }),
  async (req, res, next) => {
    try {
      const data = await consumerStoryReviewService.getCheckpoint(
        routeParam(req.params.novelId),
      );
      res.status(200).json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/novels/:novelId/story-checkpoint/review",
  validate({
    params: novelParamsSchema,
    body: consumerStartStoryReviewRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const started = await consumerStoryReviewService.startCheckpointReview(
        routeParam(req.params.novelId),
        req.body,
      );
      if (started.shouldExecute) executeStoryReviewInBackground(started.snapshot.operationId);
      res.status(202).json({
        success: true,
        data: started.snapshot,
        message: "正在检查这一段故事，已完成正文不会被改动。",
      } satisfies ApiResponse<typeof started.snapshot>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/novels/:novelId/story-checkpoint/skip",
  validate({
    params: novelParamsSchema,
    body: consumerSkipStoryReviewRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const started = await consumerStoryReviewService.skipCheckpointReview(
        routeParam(req.params.novelId),
        req.body,
      );
      if (started.shouldExecute) executeStoryReviewInBackground(started.snapshot.operationId);
      res.status(202).json({
        success: true,
        data: started.snapshot,
        message: "已跳过深度检查，正在准备下一段剧情。",
      } satisfies ApiResponse<typeof started.snapshot>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/novels/:novelId/story-adjustments",
  validate({
    params: novelParamsSchema,
    body: consumerStartStoryAdjustmentRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const started = await consumerStoryReviewService.startAdjustment(
        routeParam(req.params.novelId),
        req.body,
      );
      if (started.shouldExecute) executeStoryReviewInBackground(started.snapshot.operationId);
      res.status(202).json({
        success: true,
        data: started.snapshot,
        message: "正在判断最小影响范围，已完成内容会保持不变。",
      } satisfies ApiResponse<typeof started.snapshot>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/novels/:novelId/story-reviews/:operationId/resolve",
  validate({
    params: operationParamsSchema,
    body: consumerResolveStoryReviewRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const data = await consumerStoryReviewService.resolveOperation(
        routeParam(req.params.novelId),
        routeParam(req.params.operationId),
        req.body,
      );
      res.status(200).json({
        success: true,
        data,
        message: req.body.action === "reject"
          ? "已保留现有规划。"
          : "后续规划已更新，已完成章节保持不变。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/novels/:novelId/story-reviews/latest",
  validate({ params: novelParamsSchema }),
  async (req, res, next) => {
    try {
      const data = await consumerStoryReviewService.getLatest(
        routeParam(req.params.novelId),
      );
      res.status(200).json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/novels/:novelId/story-reviews/:operationId",
  validate({ params: operationParamsSchema }),
  async (req, res, next) => {
    try {
      const data = await consumerStoryReviewService.getOperation(
        routeParam(req.params.novelId),
        routeParam(req.params.operationId),
      );
      res.status(200).json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/estimate/story-review",
  validate({
    query: z.object({ kind: consumerStoryReviewOperationKindSchema }),
  }),
  async (req, res, next) => {
    try {
      const kind = consumerStoryReviewOperationKindSchema.parse(req.query.kind);
      const data = await consumerStoryReviewService.getCreditEstimate(kind);
      res.status(200).json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/novels/:novelId/planning",
  validate({ params: novelParamsSchema }),
  async (req, res, next) => {
    try {
      const data = await consumerStoryReviewService.getPlanningOverview(
        routeParam(req.params.novelId),
      );
      res.status(200).json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/novels/:novelId/planning/versions/:versionId/restore",
  validate({
    params: planningVersionParamsSchema,
    body: consumerRestorePlanningVersionRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const data = await consumerStoryReviewService.restorePlanningVersion(
        routeParam(req.params.novelId),
        routeParam(req.params.versionId),
        req.body.expectedPlanningRevision,
      );
      res.status(200).json({
        success: true,
        data,
        message: "规划版本已恢复，已完成章节没有改变。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
