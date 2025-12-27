-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExternalAccount" (
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
INSERT INTO "new_ExternalAccount" ("createdAt", "id", "lastSyncAt", "provider", "status", "statusMessage", "updatedAt", "userId", "username") SELECT "createdAt", "id", "lastSyncAt", "provider", "status", "statusMessage", "updatedAt", "userId", "username" FROM "ExternalAccount";
DROP TABLE "ExternalAccount";
ALTER TABLE "new_ExternalAccount" RENAME TO "ExternalAccount";
CREATE INDEX "ExternalAccount_userId_idx" ON "ExternalAccount"("userId");
CREATE UNIQUE INDEX "ExternalAccount_userId_provider_key" ON "ExternalAccount"("userId", "provider");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
