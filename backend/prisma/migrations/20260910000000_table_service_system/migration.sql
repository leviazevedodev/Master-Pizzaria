-- Atendimento presencial: mesas, comandas e pedidos que não entram na fila de entregadores.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_TABLE';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'SERVED';
ALTER TYPE "FulfillmentType" ADD VALUE IF NOT EXISTS 'DINE_IN';

CREATE TYPE "TableSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELED');

CREATE TABLE "RestaurantTable" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 4,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantTable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TableSession" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "openKey" TEXT,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'OPEN',
    "customerName" TEXT,
    "guestCount" INTEGER,
    "notes" TEXT,
    "openedById" TEXT,
    "openedByName" TEXT NOT NULL,
    "closedById" TEXT,
    "closedByName" TEXT,
    "paymentMethod" "PaymentMethod",
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(10,2),
    "changeAmount" DECIMAL(10,2),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order"
    ADD COLUMN "tableId" TEXT,
    ADD COLUMN "tableSessionId" TEXT,
    ADD COLUMN "createdByStaffId" TEXT,
    ADD COLUMN "createdByStaffName" TEXT;

CREATE UNIQUE INDEX "RestaurantTable_number_key" ON "RestaurantTable"("number");
CREATE INDEX "RestaurantTable_active_sortOrder_idx" ON "RestaurantTable"("active", "sortOrder");
CREATE UNIQUE INDEX "TableSession_openKey_key" ON "TableSession"("openKey");
CREATE INDEX "TableSession_tableId_status_openedAt_idx" ON "TableSession"("tableId", "status", "openedAt");
CREATE INDEX "TableSession_openedById_status_idx" ON "TableSession"("openedById", "status");
CREATE INDEX "Order_tableId_status_idx" ON "Order"("tableId", "status");
CREATE INDEX "Order_tableSessionId_status_idx" ON "Order"("tableSessionId", "status");

ALTER TABLE "TableSession"
    ADD CONSTRAINT "TableSession_tableId_fkey"
    FOREIGN KEY ("tableId") REFERENCES "RestaurantTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
    ADD CONSTRAINT "Order_tableId_fkey"
    FOREIGN KEY ("tableId") REFERENCES "RestaurantTable"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "Order_tableSessionId_fkey"
    FOREIGN KEY ("tableSessionId") REFERENCES "TableSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
