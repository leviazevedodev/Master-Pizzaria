-- Métodos de pagamento personalizados e retenção de dados por finalidade.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CUSTOM';

ALTER TABLE "BusinessSettings"
    ADD COLUMN "customPaymentMethods" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "Order"
    ADD COLUMN "paymentMethodLabel" TEXT;

ALTER TABLE "TableSession"
    ADD COLUMN "paymentMethodLabel" TEXT;

CREATE TABLE "TechnicalLog" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'ERROR',
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "requestId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicalLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TableClosureRecord" (
    "id" TEXT NOT NULL,
    "sourceSessionId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "tableName" TEXT,
    "customerName" TEXT,
    "status" "TableSessionStatus" NOT NULL,
    "paymentMethod" "PaymentMethod",
    "paymentMethodLabel" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(10,2),
    "changeAmount" DECIMAL(10,2),
    "openedById" TEXT,
    "openedByName" TEXT NOT NULL,
    "closedById" TEXT,
    "closedByName" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableClosureRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TableClosureRecord_sourceSessionId_key"
    ON "TableClosureRecord"("sourceSessionId");
CREATE INDEX "TableClosureRecord_closedAt_idx"
    ON "TableClosureRecord"("closedAt");
CREATE INDEX "TableClosureRecord_tableId_closedAt_idx"
    ON "TableClosureRecord"("tableId", "closedAt");
CREATE INDEX "TechnicalLog_createdAt_idx" ON "TechnicalLog"("createdAt");
CREATE INDEX "TechnicalLog_event_createdAt_idx"
    ON "TechnicalLog"("event", "createdAt");
CREATE INDEX "User_isAdmin_lastLoginAt_updatedAt_idx"
    ON "User"("isAdmin", "lastLoginAt", "updatedAt");
CREATE INDEX "PasswordResetToken_createdAt_idx"
    ON "PasswordResetToken"("createdAt");
CREATE INDEX "TableSession_status_closedAt_idx"
    ON "TableSession"("status", "closedAt");
CREATE INDEX "CustomerAddress_updatedAt_idx"
    ON "CustomerAddress"("updatedAt");
CREATE INDEX "WhatsAppOutbox_createdAt_idx"
    ON "WhatsAppOutbox"("createdAt");
CREATE INDEX "CashSession_closedAt_idx"
    ON "CashSession"("closedAt");
