CREATE TABLE "CompreSemFilaProductLink" (
    "id" SERIAL NOT NULL,
    "variantKey" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sizeId" TEXT,
    "csfProductId" INTEGER,
    "barcode" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompreSemFilaProductLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompreSemFilaOrder" (
    "id" TEXT NOT NULL,
    "csfOrderId" INTEGER NOT NULL,
    "orderId" TEXT,
    "csfStatus" TEXT NOT NULL,
    "mappingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "lastPulledAt" TIMESTAMP(3),
    "lastPushedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompreSemFilaOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompreSemFilaSyncRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "processed" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CompreSemFilaSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompreSemFilaProductLink_variantKey_key"
    ON "CompreSemFilaProductLink"("variantKey");
CREATE UNIQUE INDEX "CompreSemFilaProductLink_csfProductId_key"
    ON "CompreSemFilaProductLink"("csfProductId");
CREATE UNIQUE INDEX "CompreSemFilaProductLink_barcode_key"
    ON "CompreSemFilaProductLink"("barcode");
CREATE INDEX "CompreSemFilaProductLink_productId_idx"
    ON "CompreSemFilaProductLink"("productId");
CREATE INDEX "CompreSemFilaProductLink_sizeId_idx"
    ON "CompreSemFilaProductLink"("sizeId");
CREATE INDEX "CompreSemFilaProductLink_enabled_lastSyncedAt_idx"
    ON "CompreSemFilaProductLink"("enabled", "lastSyncedAt");

CREATE UNIQUE INDEX "CompreSemFilaOrder_csfOrderId_key"
    ON "CompreSemFilaOrder"("csfOrderId");
CREATE UNIQUE INDEX "CompreSemFilaOrder_orderId_key"
    ON "CompreSemFilaOrder"("orderId");
CREATE INDEX "CompreSemFilaOrder_mappingStatus_updatedAt_idx"
    ON "CompreSemFilaOrder"("mappingStatus", "updatedAt");
CREATE INDEX "CompreSemFilaOrder_csfStatus_updatedAt_idx"
    ON "CompreSemFilaOrder"("csfStatus", "updatedAt");

CREATE INDEX "CompreSemFilaSyncRun_kind_startedAt_idx"
    ON "CompreSemFilaSyncRun"("kind", "startedAt");
CREATE INDEX "CompreSemFilaSyncRun_status_startedAt_idx"
    ON "CompreSemFilaSyncRun"("status", "startedAt");

ALTER TABLE "CompreSemFilaProductLink"
    ADD CONSTRAINT "CompreSemFilaProductLink_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompreSemFilaProductLink"
    ADD CONSTRAINT "CompreSemFilaProductLink_sizeId_fkey"
    FOREIGN KEY ("sizeId") REFERENCES "PizzaSize"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CompreSemFilaOrder"
    ADD CONSTRAINT "CompreSemFilaOrder_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
