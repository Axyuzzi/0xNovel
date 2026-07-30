import { Router } from "express";
import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import {
  consumerCommitDraftRequestSchema,
  consumerCreateCandidateRequestSchema,
  consumerCreateChapterRequestSchema,
  consumerCreateNovelRequestSchema,
  consumerRestoreVersionRequestSchema,
  consumerResolveCandidateRequestSchema,
  consumerSaveDraftRequestSchema,
} from "@0xnovelagent/shared/types/consumerWorkspace";
import { z } from "zod";
import { AppError } from "../../../middleware/errorHandler";
import { validate } from "../../../middleware/validate";
import { relayCredentialStore } from "../../../relay/auth/RelayCredentialStore";
import { consumerWorkspaceService } from "../application/workspaceServiceInstance";

const router = Router();

const novelParamsSchema = z.object({
  novelId: z.string().trim().min(1).max(128),
});

const chapterParamsSchema = novelParamsSchema.extend({
  chapterId: z.string().trim().min(1).max(128),
});

const candidateParamsSchema = chapterParamsSchema.extend({
  candidateId: z.string().trim().min(1).max(128),
});

const versionParamsSchema = chapterParamsSchema.extend({
  versionId: z.string().trim().min(1).max(128),
});

const exportQuerySchema = z.object({
  format: z.enum(["txt", "markdown"]).default("txt"),
});

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

router.use((_req, _res, next) => {
  if (!relayCredentialStore.getUser()) {
    next(new AppError("登录后才能打开本地作品。", 401));
    return;
  }
  next();
});

router.get("/novels", async (_req, res, next) => {
  try {
    const data = await consumerWorkspaceService.listNovels();
    res.status(200).json({
      success: true,
      data,
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/novels",
  validate({ body: consumerCreateNovelRequestSchema }),
  async (req, res, next) => {
    try {
      const data = await consumerWorkspaceService.createNovel(req.body);
      res.status(201).json({
        success: true,
        data,
        message: "作品已创建。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/novels/:novelId/export",
  validate({
    params: novelParamsSchema,
    query: exportQuerySchema,
  }),
  async (req, res, next) => {
    try {
      const query = exportQuerySchema.parse(req.query);
      const data = await consumerWorkspaceService.exportNovel(
        routeParam(req.params.novelId),
        query.format,
      );
      res.setHeader("Content-Type", data.contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(data.fileName)}`,
      );
      res.status(200).send(data.content);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/novels/:novelId",
  validate({ params: novelParamsSchema }),
  async (req, res, next) => {
    try {
      const data = await consumerWorkspaceService.getNovelWorkspace(routeParam(req.params.novelId));
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
  "/novels/:novelId/chapters",
  validate({
    params: novelParamsSchema,
    body: consumerCreateChapterRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const data = await consumerWorkspaceService.createChapter(
        routeParam(req.params.novelId),
        req.body,
      );
      res.status(201).json({
        success: true,
        data,
        message: "章节已创建。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/novels/:novelId/chapters/:chapterId",
  validate({ params: chapterParamsSchema }),
  async (req, res, next) => {
    try {
      const data = await consumerWorkspaceService.getChapterWorkspace(
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

router.put(
  "/novels/:novelId/chapters/:chapterId/draft",
  validate({
    params: chapterParamsSchema,
    body: consumerSaveDraftRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const data = await consumerWorkspaceService.saveDraft(
        routeParam(req.params.novelId),
        routeParam(req.params.chapterId),
        req.body,
      );
      res.status(200).json({
        success: true,
        data,
        message: "内容已保存在本机。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/novels/:novelId/chapters/:chapterId/commit",
  validate({
    params: chapterParamsSchema,
    body: consumerCommitDraftRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const data = await consumerWorkspaceService.commitDraft(
        routeParam(req.params.novelId),
        routeParam(req.params.chapterId),
        req.body,
      );
      res.status(200).json({
        success: true,
        data,
        message: "这一版正文已确认。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/novels/:novelId/chapters/:chapterId/candidates",
  validate({
    params: chapterParamsSchema,
    body: consumerCreateCandidateRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const data = await consumerWorkspaceService.createCandidate(
        routeParam(req.params.novelId),
        routeParam(req.params.chapterId),
        req.body,
      );
      res.status(201).json({
        success: true,
        data,
        message: "修改建议已准备好，采用前不会覆盖正文。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/novels/:novelId/chapters/:chapterId/candidates/:candidateId/resolve",
  validate({
    params: candidateParamsSchema,
    body: consumerResolveCandidateRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const data = await consumerWorkspaceService.resolveCandidate(
        routeParam(req.params.novelId),
        routeParam(req.params.chapterId),
        routeParam(req.params.candidateId),
        req.body,
      );
      res.status(200).json({
        success: true,
        data,
        message: req.body.action === "adopt" ? "修改已采用。" : "修改已放弃。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/novels/:novelId/chapters/:chapterId/versions/:versionId/restore",
  validate({
    params: versionParamsSchema,
    body: consumerRestoreVersionRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const data = await consumerWorkspaceService.restoreVersion(
        routeParam(req.params.novelId),
        routeParam(req.params.chapterId),
        routeParam(req.params.versionId),
        req.body.expectedRevision,
      );
      res.status(200).json({
        success: true,
        data,
        message: "历史内容已恢复，并保留为新的版本。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
