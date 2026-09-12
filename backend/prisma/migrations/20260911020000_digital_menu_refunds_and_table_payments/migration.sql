ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

ALTER TABLE "BusinessSettings"
    ADD COLUMN "storeGoogleMapsUrl" TEXT,
    ADD COLUMN "tablePaymentMethods" JSONB NOT NULL DEFAULT '["CASH","PIX","CREDIT","DEBIT"]',
    ADD COLUMN "digitalMenuEnabled" BOOLEAN NOT NULL DEFAULT true;
