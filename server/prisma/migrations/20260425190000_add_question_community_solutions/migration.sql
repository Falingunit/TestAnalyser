-- CreateTable
CREATE TABLE "QuestionCommunitySolution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentMarkdown" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "upvoteCount" INTEGER NOT NULL DEFAULT 0,
    "downvoteCount" INTEGER NOT NULL DEFAULT 0,
    "pinnedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuestionCommunitySolution_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionCommunitySolution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionCommunitySolutionVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "solutionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuestionCommunitySolutionVote_solutionId_fkey" FOREIGN KEY ("solutionId") REFERENCES "QuestionCommunitySolution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionCommunitySolutionVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionCommunitySolutionComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "solutionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentMarkdown" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuestionCommunitySolutionComment_solutionId_fkey" FOREIGN KEY ("solutionId") REFERENCES "QuestionCommunitySolution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionCommunitySolutionComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "QuestionCommunitySolution_questionId_idx" ON "QuestionCommunitySolution"("questionId");

-- CreateIndex
CREATE INDEX "QuestionCommunitySolution_userId_idx" ON "QuestionCommunitySolution"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionCommunitySolution_questionId_userId_key" ON "QuestionCommunitySolution"("questionId", "userId");

-- CreateIndex
CREATE INDEX "QuestionCommunitySolutionVote_solutionId_idx" ON "QuestionCommunitySolutionVote"("solutionId");

-- CreateIndex
CREATE INDEX "QuestionCommunitySolutionVote_userId_idx" ON "QuestionCommunitySolutionVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionCommunitySolutionVote_solutionId_userId_key" ON "QuestionCommunitySolutionVote"("solutionId", "userId");

-- CreateIndex
CREATE INDEX "QuestionCommunitySolutionComment_solutionId_idx" ON "QuestionCommunitySolutionComment"("solutionId");

-- CreateIndex
CREATE INDEX "QuestionCommunitySolutionComment_userId_idx" ON "QuestionCommunitySolutionComment"("userId");
