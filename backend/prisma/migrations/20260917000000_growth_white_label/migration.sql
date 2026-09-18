-- White-label, avaliações, relacionamento e implantação inicial.
-- Migração expansiva: preserva todos os dados e não remove colunas existentes.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthdayBenefitYear" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "inviteCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredByUserId" TEXT;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isNew" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "rewardsProcessedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "birthdayBenefitApplied" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "foodRating" INTEGER;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "shortName" TEXT NOT NULL DEFAULT 'Master';
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "slogan" TEXT NOT NULL DEFAULT 'Pizza artesanal, feita na hora';
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "faviconImage" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "shareImage" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "primaryColor" TEXT NOT NULL DEFAULT '#e31b23';
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "secondaryColor" TEXT NOT NULL DEFAULT '#111214';
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "accentColor" TEXT NOT NULL DEFAULT '#ff323a';
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "seoTitle" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "seoCanonicalUrl" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "facebookUrl" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "publicReviewsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "reviewCollectionEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "bestSellersEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "newProductsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "newProductDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "rewardsMode" TEXT NOT NULL DEFAULT 'POINTS';
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "birthdayCampaignEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "birthdayDiscountType" TEXT NOT NULL DEFAULT 'PERCENT';
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "birthdayDiscountValue" DECIMAL(10,2) NOT NULL DEFAULT 10;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "birthdayMinimumOrder" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "birthdayValidityDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "referralEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "referralReferrerReward" DECIMAL(10,2) NOT NULL DEFAULT 10;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "referralNewCustomerReward" DECIMAL(10,2) NOT NULL DEFAULT 5;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "referralMinimumOrder" DECIMAL(10,2) NOT NULL DEFAULT 30;
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "initialSetupCompleted" BOOLEAN NOT NULL DEFAULT false;

-- Instalações que já possuem configurações não devem voltar ao assistente.
-- Em uma instalação nova a linha só é criada pelo seed depois das migrations e
-- mantém o default false, abrindo o wizard normalmente.
UPDATE "BusinessSettings" SET "initialSetupCompleted" = true;

ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "image" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "buttonText" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "targetUrl" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "couponCode" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "Campaign"
SET "title" = COALESCE("title", "name"),
    "description" = COALESCE("description", "message")
WHERE "title" IS NULL OR "description" IS NULL;

CREATE TABLE IF NOT EXISTS "ProductFavorite" (
  "userId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductFavorite_pkey" PRIMARY KEY ("userId", "productId")
);

CREATE TABLE IF NOT EXISTS "RewardTransaction" (
  "id" TEXT NOT NULL,
  "externalKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orderId" TEXT,
  "type" TEXT NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0,
  "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_inviteCode_key" ON "User"("inviteCode");
CREATE INDEX IF NOT EXISTS "User_referredByUserId_idx" ON "User"("referredByUserId");
CREATE INDEX IF NOT EXISTS "Review_status_createdAt_idx" ON "Review"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductFavorite_productId_createdAt_idx" ON "ProductFavorite"("productId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "RewardTransaction_externalKey_key" ON "RewardTransaction"("externalKey");
CREATE INDEX IF NOT EXISTS "RewardTransaction_userId_createdAt_idx" ON "RewardTransaction"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "RewardTransaction_orderId_type_idx" ON "RewardTransaction"("orderId", "type");
CREATE INDEX IF NOT EXISTS "Campaign_active_startsAt_endsAt_sortOrder_idx" ON "Campaign"("active", "startsAt", "endsAt", "sortOrder");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_referredByUserId_fkey' AND conrelid = '"User"'::regclass) THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Review_orderId_fkey' AND conrelid = '"Review"'::regclass) THEN
    ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductFavorite_userId_fkey' AND conrelid = '"ProductFavorite"'::regclass) THEN
    ALTER TABLE "ProductFavorite" ADD CONSTRAINT "ProductFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductFavorite_productId_fkey' AND conrelid = '"ProductFavorite"'::regclass) THEN
    ALTER TABLE "ProductFavorite" ADD CONSTRAINT "ProductFavorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardTransaction_userId_fkey' AND conrelid = '"RewardTransaction"'::regclass) THEN
    ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardTransaction_orderId_fkey' AND conrelid = '"RewardTransaction"'::regclass) THEN
    ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Review_rating_check' AND conrelid = '"Review"'::regclass) THEN
    ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Review_foodRating_check' AND conrelid = '"Review"'::regclass) THEN
    ALTER TABLE "Review" ADD CONSTRAINT "Review_foodRating_check" CHECK ("foodRating" IS NULL OR "foodRating" BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Review_deliveryRating_check' AND conrelid = '"Review"'::regclass) THEN
    ALTER TABLE "Review" ADD CONSTRAINT "Review_deliveryRating_check" CHECK ("deliveryRating" IS NULL OR "deliveryRating" BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Review_status_check' AND conrelid = '"Review"'::regclass) THEN
    ALTER TABLE "Review" ADD CONSTRAINT "Review_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'HIDDEN'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BusinessSettings_rewardsMode_check' AND conrelid = '"BusinessSettings"'::regclass) THEN
    ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_rewardsMode_check" CHECK ("rewardsMode" IN ('DISABLED', 'POINTS', 'CASHBACK'));
  END IF;
END $$;
