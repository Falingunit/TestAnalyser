/*
  Warnings:

  - You are about to drop the column `source` on the `Exam` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Exam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalExamId" TEXT,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "timeLimitMin" INTEGER NOT NULL,
    "scoringCorrect" INTEGER NOT NULL,
    "scoringIncorrect" INTEGER NOT NULL,
    "keyUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Exam" ("createdAt", "date", "externalExamId", "id", "keyUpdatedAt", "scoringCorrect", "scoringIncorrect", "timeLimitMin", "title", "updatedAt") SELECT "createdAt", "date", "externalExamId", "id", "keyUpdatedAt", "scoringCorrect", "scoringIncorrect", "timeLimitMin", "title", "updatedAt" FROM "Exam";
DROP TABLE "Exam";
ALTER TABLE "new_Exam" RENAME TO "Exam";
CREATE INDEX "Exam_externalExamId_idx" ON "Exam"("externalExamId");
CREATE UNIQUE INDEX "Exam_externalExamId_key" ON "Exam"("externalExamId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
