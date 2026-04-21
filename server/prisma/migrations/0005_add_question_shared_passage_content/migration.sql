ALTER TABLE "Question" ADD COLUMN "sharedPassageContent" TEXT;
ALTER TABLE "Question" ADD COLUMN "sharedPassageSourceContent" TEXT;
ALTER TABLE "Question" ADD COLUMN "sharedPassageOverridden" BOOLEAN NOT NULL DEFAULT false;
