ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isFlavorOption" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Product" SET "isFlavorOption" = true WHERE "allowFlavorSplit" = true;

CREATE TABLE IF NOT EXISTS "PizzaSize" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "diameterCm" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PizzaSize_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PizzaSize_name_key" ON "PizzaSize"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "PizzaSize_slug_key" ON "PizzaSize"("slug");
CREATE INDEX IF NOT EXISTS "PizzaSize_active_sortOrder_idx" ON "PizzaSize"("active", "sortOrder");

CREATE TABLE IF NOT EXISTS "ProductSize" (
  "productId" TEXT NOT NULL,
  "sizeId" TEXT NOT NULL,
  "price" DECIMAL(10,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProductSize_pkey" PRIMARY KEY ("productId", "sizeId"),
  CONSTRAINT "ProductSize_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductSize_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "PizzaSize"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ProductSize_sizeId_idx" ON "ProductSize"("sizeId");
CREATE INDEX IF NOT EXISTS "ProductSize_productId_sortOrder_idx" ON "ProductSize"("productId", "sortOrder");

ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "sizeName" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "sizePrice" DECIMAL(10,2);
