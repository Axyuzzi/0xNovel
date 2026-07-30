CREATE TABLE "ConsumerChapterDraft" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "cursorStart" INTEGER,
    "cursorEnd" INTEGER,
    "baseVersionId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConsumerChapterDraft_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConsumerChapterDraft_chapterId_fkey"
        FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ConsumerChapterDraft_chapterId_key"
ON "ConsumerChapterDraft"("chapterId");

CREATE INDEX "ConsumerChapterDraft_updatedAt_idx"
ON "ConsumerChapterDraft"("updatedAt");

CREATE TABLE "ConsumerCreationOperation" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "stage" TEXT,
    "inputJson" TEXT,
    "receivedContent" TEXT NOT NULL DEFAULT '',
    "estimatedCreditsMilli" INTEGER,
    "actualCreditsMilli" INTEGER,
    "relayRequestId" TEXT,
    "resultRefType" TEXT,
    "resultRefId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConsumerCreationOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConsumerCreationOperation_novelId_fkey"
        FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConsumerCreationOperation_chapterId_fkey"
        FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ConsumerCreationOperation_requestKey_key"
ON "ConsumerCreationOperation"("requestKey");

CREATE INDEX "ConsumerCreationOperation_novelId_createdAt_idx"
ON "ConsumerCreationOperation"("novelId", "createdAt");

CREATE INDEX "ConsumerCreationOperation_chapterId_createdAt_idx"
ON "ConsumerCreationOperation"("chapterId", "createdAt");

CREATE INDEX "ConsumerCreationOperation_status_updatedAt_idx"
ON "ConsumerCreationOperation"("status", "updatedAt");

CREATE INDEX "ConsumerCreationOperation_relayRequestId_idx"
ON "ConsumerCreationOperation"("relayRequestId");

CREATE TABLE "ConsumerChapterCandidate" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "instruction" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ai_revision',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "operationId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsumerChapterCandidate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConsumerChapterCandidate_chapterId_fkey"
        FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConsumerChapterCandidate_operationId_fkey"
        FOREIGN KEY ("operationId") REFERENCES "ConsumerCreationOperation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ConsumerChapterCandidate_chapterId_status_createdAt_idx"
ON "ConsumerChapterCandidate"("chapterId", "status", "createdAt");

CREATE INDEX "ConsumerChapterCandidate_operationId_idx"
ON "ConsumerChapterCandidate"("operationId");

CREATE TABLE "ConsumerChapterVersion" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceCandidateId" TEXT,
    "operationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsumerChapterVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConsumerChapterVersion_chapterId_fkey"
        FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConsumerChapterVersion_operationId_fkey"
        FOREIGN KEY ("operationId") REFERENCES "ConsumerCreationOperation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ConsumerChapterVersion_chapterId_sequence_key"
ON "ConsumerChapterVersion"("chapterId", "sequence");

CREATE INDEX "ConsumerChapterVersion_chapterId_createdAt_idx"
ON "ConsumerChapterVersion"("chapterId", "createdAt");

CREATE INDEX "ConsumerChapterVersion_operationId_idx"
ON "ConsumerChapterVersion"("operationId");

CREATE TABLE "ConsumerStorySetup" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "idea" TEXT NOT NULL,
    "step" TEXT NOT NULL DEFAULT 'story_direction',
    "status" TEXT NOT NULL DEFAULT 'awaiting_generation',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "directionsJson" TEXT,
    "selectedDirectionJson" TEXT,
    "bookSkeletonJson" TEXT,
    "volumePlanJson" TEXT,
    "currentPhaseJson" TEXT,
    "firstChapterJson" TEXT,
    "firstChapterId" TEXT,
    "firstChapterCandidateId" TEXT,
    "activeOperationId" TEXT,
    "lastActualCreditsMilli" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConsumerStorySetup_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConsumerStorySetup_novelId_fkey"
        FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ConsumerStorySetup_novelId_key"
ON "ConsumerStorySetup"("novelId");

CREATE INDEX "ConsumerStorySetup_step_status_updatedAt_idx"
ON "ConsumerStorySetup"("step", "status", "updatedAt");

CREATE INDEX "ConsumerStorySetup_activeOperationId_idx"
ON "ConsumerStorySetup"("activeOperationId");
