ALTER TABLE "ConsumerCreationOperation"
ADD COLUMN "promptTokens" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ConsumerCreationOperation"
ADD COLUMN "completionTokens" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ConsumerCreationOperation"
ADD COLUMN "totalTokens" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ConsumerCreationOperation"
ADD COLUMN "llmCallCount" INTEGER NOT NULL DEFAULT 0;
