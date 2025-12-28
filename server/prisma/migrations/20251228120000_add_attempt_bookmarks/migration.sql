-- Add bookmarks to Attempt for starred questions
ALTER TABLE "Attempt" ADD COLUMN "bookmarks" TEXT NOT NULL DEFAULT '{}';
