CREATE TABLE "ConsumerSegmentRun" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "sourceChapterId" TEXT NOT NULL,
    "planningRevision" INTEGER NOT NULL,
    "phaseName" TEXT NOT NULL,
    "phaseObjective" TEXT NOT NULL,
    "phaseStartOrder" INTEGER NOT NULL,
    "phaseEndOrder" INTEGER NOT NULL,
    "firstTargetOrder" INTEGER NOT NULL,
    "completedThroughOrder" INTEGER NOT NULL,
    "currentChapterId" TEXT,
    "currentChapterOrder" INTEGER,
    "currentOperationId" TEXT,
    "operationIdsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'created',
    "pauseRequestedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumerSegmentRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsumerSegmentRun_requestKey_key"
ON "ConsumerSegmentRun"("requestKey");

CREATE INDEX "ConsumerSegmentRun_novelId_status_updatedAt_idx"
ON "ConsumerSegmentRun"("novelId", "status", "updatedAt");

CREATE INDEX "ConsumerSegmentRun_currentOperationId_idx"
ON "ConsumerSegmentRun"("currentOperationId");

ALTER TABLE "ConsumerSegmentRun"
ADD CONSTRAINT "ConsumerSegmentRun_novelId_fkey"
FOREIGN KEY ("novelId") REFERENCES "Novel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
