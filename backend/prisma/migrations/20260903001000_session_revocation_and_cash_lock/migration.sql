-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CashSession" ADD COLUMN     "openKey" TEXT;

-- Preserve at most one active cash session per employee when upgrading an existing database.
WITH "rankedOpenSessions" AS (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "openedAt" DESC, "id" DESC) AS "position"
    FROM "CashSession"
    WHERE "closedAt" IS NULL
)
UPDATE "CashSession" AS "session"
SET "openKey" = "session"."userId"
FROM "rankedOpenSessions" AS "ranked"
WHERE "session"."id" = "ranked"."id" AND "ranked"."position" = 1;

-- CreateIndex
CREATE UNIQUE INDEX "CashSession_openKey_key" ON "CashSession"("openKey");
