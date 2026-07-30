import { prisma } from "../../../db/prisma";
import { consumerWorkspaceService } from "../../consumerWorkspace/application/workspaceServiceInstance";
import { RelayConsumerChapterProductionCreditMeter } from "./chapterProductionCreditMeter";
import { PromptConsumerChapterProductionGenerator } from "./chapterProductionGenerator";
import { ConsumerChapterProductionService } from "./chapterProductionService";
import { PromptConsumerChapterRevisionGenerator } from "./chapterRevisionGenerator";
import { ConsumerChapterRevisionService } from "./chapterRevisionService";
import { PromptConsumerStoryReviewGenerator } from "./storyReviewGenerator";
import { ConsumerStoryReviewService } from "./storyReviewService";
import { ConsumerSegmentRunService } from "./segmentRun";

const creditMeter = new RelayConsumerChapterProductionCreditMeter();
export const consumerChapterProductionService = new ConsumerChapterProductionService(
  prisma,
  new PromptConsumerChapterProductionGenerator(),
  creditMeter,
);

export const consumerChapterRevisionService = new ConsumerChapterRevisionService(
  prisma,
  new PromptConsumerChapterRevisionGenerator(),
  creditMeter,
);

export const consumerStoryReviewService = new ConsumerStoryReviewService(
  prisma,
  new PromptConsumerStoryReviewGenerator(),
  creditMeter,
);

export const consumerSegmentRunService = new ConsumerSegmentRunService(
  prisma,
  consumerChapterProductionService,
  consumerWorkspaceService,
);
