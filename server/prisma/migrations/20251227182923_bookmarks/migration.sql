/*
  Warnings:

  - You are about to drop the `AnswerKeyUpdate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AttemptQuestion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExamQuestion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExamSection` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `createdAt` on the `Attempt` table. All the data in the column will be lost.
  - You are about to drop the column `lastSyncAt` on the `Attempt` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Attempt` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Exam` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `Exam` table. All the data in the column will be lost.
  - You are about to drop the column `keyUpdatedAt` on the `Exam` table. All the data in the column will be lost.
  - You are about to drop the column `scoringCorrect` on the `Exam` table. All the data in the column will be lost.
  - You are about to drop the column `scoringIncorrect` on the `Exam` table. All the data in the column will be lost.
  - You are about to drop the column `timeLimitMin` on the `Exam` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Exam` table. All the data in the column will be lost.
  - Added the required column `answers` to the `Attempt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `timings` to the `Attempt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `examDate` to the `Exam` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "AnswerKeyUpdate_examQuestionId_idx";

-- DropIndex
DROP INDEX "AnswerKeyUpdate_examId_idx";

-- DropIndex
DROP INDEX "AttemptQuestion_attemptId_examQuestionId_key";

-- DropIndex
DROP INDEX "AttemptQuestion_examQuestionId_idx";

-- DropIndex
DROP INDEX "AttemptQuestion_attemptId_idx";

-- DropIndex
DROP INDEX "ExamQuestion_examId_number_key";

-- DropIndex
DROP INDEX "ExamQuestion_examId_idx";

-- DropIndex
DROP INDEX "ExamSection_examId_name_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AnswerKeyUpdate";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AttemptQuestion";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ExamQuestion";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ExamSection";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "qtype" TEXT NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "questionContent" TEXT NOT NULL,
    "optionContentA" TEXT,
    "optionContentB" TEXT,
    "optionContentC" TEXT,
    "optionContentD" TEXT,
    "hasPartial" BOOLEAN NOT NULL DEFAULT false,
    "correctMarking" INTEGER NOT NULL,
    "incorrectMarking" INTEGER NOT NULL,
    "unattemptedMarking" INTEGER NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "keyUpdate" TEXT,
    "lastKeyUpdateTime" DATETIME,
    CONSTRAINT "Question_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Attempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "timings" TEXT NOT NULL,
    "bookmarks" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Attempt" ("bookmarks", "examId", "id", "userId") SELECT "bookmarks", "examId", "id", "userId" FROM "Attempt";
DROP TABLE "Attempt";
ALTER TABLE "new_Attempt" RENAME TO "Attempt";
CREATE INDEX "Attempt_userId_idx" ON "Attempt"("userId");
CREATE INDEX "Attempt_examId_idx" ON "Attempt"("examId");
CREATE UNIQUE INDEX "Attempt_userId_examId_key" ON "Attempt"("userId", "examId");
CREATE TABLE "new_Exam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "externalExamId" TEXT,
    "examDate" TEXT NOT NULL
);
INSERT INTO "new_Exam" ("externalExamId", "id", "title") SELECT "externalExamId", "id", "title" FROM "Exam";
DROP TABLE "Exam";
ALTER TABLE "new_Exam" RENAME TO "Exam";
CREATE INDEX "Exam_externalExamId_idx" ON "Exam"("externalExamId");
CREATE UNIQUE INDEX "Exam_externalExamId_key" ON "Exam"("externalExamId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Question_examId_idx" ON "Question"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_examId_questionNumber_key" ON "Question"("examId", "questionNumber");
