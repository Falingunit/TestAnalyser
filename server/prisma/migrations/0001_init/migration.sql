-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "preferences" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ExternalAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "syncStatus" TEXT NOT NULL DEFAULT 'IDLE',
    "syncTotal" INTEGER NOT NULL DEFAULT 0,
    "syncCompleted" INTEGER NOT NULL DEFAULT 0,
    "syncStartedAt" DATETIME,
    "syncFinishedAt" DATETIME,
    "lastSyncAt" DATETIME,
    "statusMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExternalAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExternalAccountCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExternalAccountCredential_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ExternalAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "externalExamId" TEXT,
    "examDate" TEXT NOT NULL,
    "markingScheme" TEXT
);

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
    "markingOverridden" BOOLEAN NOT NULL DEFAULT false,
    "questionNumber" INTEGER NOT NULL,
    "keyUpdate" TEXT,
    "lastKeyUpdateTime" DATETIME,
    CONSTRAINT "Question_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "timings" TEXT NOT NULL,
    "rank" INTEGER,
    "bookmarks" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ExternalAccount_userId_idx" ON "ExternalAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAccount_userId_provider_key" ON "ExternalAccount"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAccountCredential_accountId_key" ON "ExternalAccountCredential"("accountId");

-- CreateIndex
CREATE INDEX "Exam_externalExamId_idx" ON "Exam"("externalExamId");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_externalExamId_key" ON "Exam"("externalExamId");

-- CreateIndex
CREATE INDEX "Question_examId_idx" ON "Question"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_examId_questionNumber_key" ON "Question"("examId", "questionNumber");

-- CreateIndex
CREATE INDEX "Attempt_userId_idx" ON "Attempt"("userId");

-- CreateIndex
CREATE INDEX "Attempt_examId_idx" ON "Attempt"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_userId_examId_key" ON "Attempt"("userId", "examId");

