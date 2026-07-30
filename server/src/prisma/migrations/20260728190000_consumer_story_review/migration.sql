CREATE TABLE "ConsumerPlanningVersion" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "bookSkeletonJson" TEXT NOT NULL,
    "volumePlanJson" TEXT NOT NULL,
    "currentPhaseJson" TEXT NOT NULL,
    "sourceOperationId" TEXT,
    "restoredFromVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsumerPlanningVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConsumerPlanningVersion_novelId_fkey"
        FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ConsumerPlanningVersion_novelId_sequence_key"
ON "ConsumerPlanningVersion"("novelId", "sequence");

CREATE INDEX "ConsumerPlanningVersion_novelId_createdAt_idx"
ON "ConsumerPlanningVersion"("novelId", "createdAt");

CREATE INDEX "ConsumerPlanningVersion_sourceOperationId_idx"
ON "ConsumerPlanningVersion"("sourceOperationId");
