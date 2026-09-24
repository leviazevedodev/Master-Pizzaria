ALTER TABLE "BusinessSettings"
ADD COLUMN "deliveredOrdersCounterOffset" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PushOrderSubscription" (
    "subscriptionId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushOrderSubscription_pkey" PRIMARY KEY ("subscriptionId", "orderId")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_lastSeenAt_idx" ON "PushSubscription"("lastSeenAt");
CREATE INDEX "PushOrderSubscription_orderId_idx" ON "PushOrderSubscription"("orderId");

ALTER TABLE "PushOrderSubscription"
ADD CONSTRAINT "PushOrderSubscription_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PushOrderSubscription"
ADD CONSTRAINT "PushOrderSubscription_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
