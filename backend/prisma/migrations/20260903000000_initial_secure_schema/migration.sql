-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('SCHEDULED', 'RECEIVED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'DELIVERED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MACHINE_PIX', 'CASH', 'DEBIT', 'CREDIT', 'BANESE_DEBIT', 'PIX', 'CARD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'CASH_PENDING', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('DELIVERY', 'PICKUP');

-- CreateEnum
CREATE TYPE "DeliveryPricingMode" AS ENUM ('AREA', 'DISTANCE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "adminPermissions" JSONB,
    "staffRole" TEXT,
    "staffActive" BOOLEAN NOT NULL DEFAULT true,
    "postalCode" TEXT,
    "street" TEXT,
    "addressNumber" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "referencePoint" TEXT,
    "adminNote" TEXT,
    "customerBlocked" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "birthday" TIMESTAMP(3),
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "cashbackBalance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flavor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "promoPrice" DECIMAL(10,2),
    "promoActive" BOOLEAN NOT NULL DEFAULT false,
    "promoStartAt" TIMESTAMP(3),
    "promoEndAt" TIMESTAMP(3),
    "image" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "stockTracked" BOOLEAN NOT NULL DEFAULT false,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "stockLowThreshold" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flavor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "image" TEXT,
    "badge" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "allowFlavorSplit" BOOLEAN NOT NULL DEFAULT false,
    "maxFlavors" INTEGER NOT NULL DEFAULT 1,
    "flavorPricingMode" TEXT NOT NULL DEFAULT 'MAX',
    "stockTracked" BOOLEAN NOT NULL DEFAULT false,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "stockLowThreshold" INTEGER NOT NULL DEFAULT 5,
    "costPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pausedUntil" TIMESTAMP(3),
    "availableDays" JSONB,
    "availableStartTime" TEXT,
    "availableEndTime" TEXT,
    "removableIngredients" JSONB,
    "deletedAt" TIMESTAMP(3),
    "categoryId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "image" TEXT,
    "originalPrice" DECIMAL(10,2) NOT NULL,
    "promoPrice" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductFlavor" (
    "productId" TEXT NOT NULL,
    "flavorId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductFlavor_pkey" PRIMARY KEY ("productId","flavorId")
);

-- CreateTable
CREATE TABLE "ModifierGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModifierGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModifierOption" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "promoPrice" DECIMAL(10,2),
    "promoActive" BOOLEAN NOT NULL DEFAULT false,
    "promoStartAt" TIMESTAMP(3),
    "promoEndAt" TIMESTAMP(3),
    "image" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "stockTracked" BOOLEAN NOT NULL DEFAULT false,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "stockLowThreshold" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModifierOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductModifierGroup" (
    "productId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductModifierGroup_pkey" PRIMARY KEY ("productId","groupId")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryArea" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'São Cristóvão - SE',
    "neighborhood" TEXT NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "distanceKm" DECIMAL(10,2),
    "minimumOrder" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "freeDeliveryThreshold" DECIMAL(10,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreHour" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "openTime" TEXT NOT NULL DEFAULT '18:00',
    "closeTime" TEXT NOT NULL DEFAULT '23:00',
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "fulfillmentType" "FulfillmentType" NOT NULL DEFAULT 'DELIVERY',
    "postalCode" TEXT,
    "street" TEXT,
    "addressNumber" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "distanceKm" DECIMAL(10,2),
    "deliveryAreaId" TEXT,
    "notes" TEXT,
    "referencePoint" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "deliveryFee" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "couponCode" TEXT,
    "cashbackUsed" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cashbackEarned" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "orderOrigin" TEXT NOT NULL DEFAULT 'SITE',
    "readyAt" TIMESTAMP(3),
    "outForDeliveryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'CASH_PENDING',
    "paymentProvider" TEXT,
    "paymentExternalId" TEXT,
    "paymentPreferenceId" TEXT,
    "paymentUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "estimatedDeliveryMin" INTEGER NOT NULL DEFAULT 30,
    "estimatedDeliveryMax" INTEGER NOT NULL DEFAULT 45,
    "changeFor" DECIMAL(10,2),
    "status" "OrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "cancelReason" TEXT,
    "stockApplied" BOOLEAN NOT NULL DEFAULT false,
    "assignedCourierId" TEXT,
    "printedAt" TIMESTAMP(3),
    "kitchenSeenAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemFlavor" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "flavorId" TEXT,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "OrderItemFlavor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemOption" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "optionId" TEXT,
    "groupName" TEXT NOT NULL,
    "optionName" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItemOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "changedByUserId" TEXT,
    "changedByName" TEXT,
    "changedByRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryGeoCache" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "cityKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT '',
    "stateKey" TEXT NOT NULL DEFAULT '',
    "neighborhood" TEXT NOT NULL,
    "neighborhoodKey" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "distanceKm" DECIMAL(10,2) NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryGeoCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Favorito',
    "postalCode" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "addressNumber" TEXT NOT NULL,
    "complement" TEXT,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "referencePoint" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'un',
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "minQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductInventoryItem" (
    "productId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "ProductInventoryItem_pkey" PRIMARY KEY ("productId","inventoryItemId")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "productId" TEXT,
    "orderId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverySurchargeRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliverySurchargeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppOutbox" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "customerPhone" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "storeName" TEXT NOT NULL DEFAULT 'Master Pizza',
    "timezone" TEXT NOT NULL DEFAULT 'America/Maceio',
    "phone" TEXT NOT NULL DEFAULT '(79) 99692-8118',
    "whatsappPrimary" TEXT NOT NULL DEFAULT '5579996928118',
    "whatsappSecondary" TEXT NOT NULL DEFAULT '5579996342440',
    "instagram" TEXT NOT NULL DEFAULT '@master_pizzariaofc',
    "instagramUrl" TEXT NOT NULL DEFAULT 'https://www.instagram.com/master_pizzariaofc',
    "address" TEXT NOT NULL DEFAULT 'Av. Marginal, 329, Eduardo Gomes, São Cristóvão - SE',
    "openingHours" TEXT NOT NULL DEFAULT 'Consulte o horário pelo WhatsApp',
    "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 4.00,
    "freeDeliveryThreshold" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "defaultMinimumOrder" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "deliveryPricingMode" "DeliveryPricingMode" NOT NULL DEFAULT 'DISTANCE',
    "deliveryHybridEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deliveryPricePerKm" DECIMAL(10,2) NOT NULL DEFAULT 2.00,
    "deliveryMinimumKm" DECIMAL(10,2) NOT NULL DEFAULT 2.00,
    "deliveryMinimumFee" DECIMAL(10,2) NOT NULL DEFAULT 4.00,
    "deliveryMaxDistanceKm" DECIMAL(10,2) NOT NULL DEFAULT 15.00,
    "storePostalCode" TEXT,
    "storeLatitude" DECIMAL(10,7),
    "storeLongitude" DECIMAL(10,7),
    "estimatedDeliveryMin" INTEGER NOT NULL DEFAULT 30,
    "estimatedDeliveryMax" INTEGER NOT NULL DEFAULT 45,
    "lateWarningMinutes" INTEGER NOT NULL DEFAULT 30,
    "storeCoordinatesCep" TEXT,
    "storeGeoSource" TEXT,
    "storeGeoAddressKey" TEXT,
    "heroTitle" TEXT NOT NULL DEFAULT 'Pizza artesanal, feita para impressionar.',
    "heroSubtitle" TEXT NOT NULL DEFAULT 'Massa leve, ingredientes selecionados e forno quente. Seu pedido chega bonito, saboroso e do jeito certo.',
    "heroStampTitle" TEXT NOT NULL DEFAULT 'Massa artesanal',
    "heroStampText" TEXT NOT NULL DEFAULT 'preparo cuidadoso em cada pedido',
    "menuTitle" TEXT NOT NULL DEFAULT 'Escolha o seu próximo favorito.',
    "menuSubtitle" TEXT NOT NULL DEFAULT 'Sabores clássicos e especiais, preparados quando você pede.',
    "homeProductLimit" INTEGER NOT NULL DEFAULT 8,
    "deliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "schedulingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "manualOpenUntilDate" TEXT,
    "manualOpenUntilMinutes" INTEGER,
    "cashPaymentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "onlinePaymentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "browserNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "newOrderSoundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoPrintEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappAutoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappOrderCreatedTemplate" TEXT NOT NULL DEFAULT 'Olá {cliente}! Recebemos seu pedido #{pedido}. Total: {total}.',
    "whatsappStatusTemplate" TEXT NOT NULL DEFAULT 'Pedido #{pedido}: {status}.',
    "smartCourierQueueEnabled" BOOLEAN NOT NULL DEFAULT true,
    "kitchenCapacityPerSlot" INTEGER NOT NULL DEFAULT 12,
    "kitchenSlotMinutes" INTEGER NOT NULL DEFAULT 30,
    "courierMaxActiveOrders" INTEGER NOT NULL DEFAULT 3,
    "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "loyaltyPointsPerReal" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "loyaltyRewardPoints" INTEGER NOT NULL DEFAULT 500,
    "loyaltyRewardValue" DECIMAL(10,2) NOT NULL DEFAULT 20,
    "cashbackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cashbackPercent" DECIMAL(5,2) NOT NULL DEFAULT 2,
    "darkModeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pwaEnabled" BOOLEAN NOT NULL DEFAULT true,
    "offlinePanelEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cartRecommendationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "vipMinOrders" INTEGER NOT NULL DEFAULT 8,
    "vipMinSpend" DECIMAL(10,2) NOT NULL DEFAULT 400.00,
    "inactiveCustomerDays" INTEGER NOT NULL DEFAULT 60,
    "logoImage" TEXT,
    "heroEyebrow" TEXT NOT NULL DEFAULT 'Artesanal • feita na hora',
    "heroImage" TEXT,
    "aboutEyebrow" TEXT NOT NULL DEFAULT 'Sobre a Master',
    "aboutTitle" TEXT NOT NULL DEFAULT 'Pedido simples, atendimento próximo e pizza levada a sério.',
    "aboutText" TEXT NOT NULL DEFAULT 'Encontre seu pedido, escolha sabores, decida entre entrega ou retirada e acompanhe tudo de forma simples.',
    "aboutImage" TEXT,
    "promotionsTitle" TEXT NOT NULL DEFAULT 'Ofertas em destaque',
    "promotionsSubtitle" TEXT NOT NULL DEFAULT 'Promoções selecionadas pela loja por tempo limitado.',
    "footerText" TEXT NOT NULL DEFAULT 'Pizza artesanal com pedido simples, acompanhamento e atendimento próximo.',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'PERCENT',
    "value" DECIMAL(10,2) NOT NULL,
    "minimumOrder" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "maxDiscount" DECIMAL(10,2),
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "perCustomerLimit" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerName" TEXT,
    "rating" INTEGER NOT NULL,
    "deliveryRating" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "role" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "closingAmount" DECIMAL(10,2),
    "notes" TEXT,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessGoal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'MONTHLY',
    "target" DECIMAL(12,2) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_active_sortOrder_idx" ON "Category"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "Subcategory_categoryId_active_sortOrder_idx" ON "Subcategory"("categoryId", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Subcategory_categoryId_slug_key" ON "Subcategory"("categoryId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Flavor_name_key" ON "Flavor"("name");

-- CreateIndex
CREATE INDEX "Flavor_active_sortOrder_idx" ON "Flavor"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_categoryId_available_deletedAt_idx" ON "Product"("categoryId", "available", "deletedAt");

-- CreateIndex
CREATE INDEX "Product_subcategoryId_available_idx" ON "Product"("subcategoryId", "available");

-- CreateIndex
CREATE INDEX "Product_featured_available_idx" ON "Product"("featured", "available");

-- CreateIndex
CREATE INDEX "Product_sortOrder_idx" ON "Product"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_productId_key" ON "Promotion"("productId");

-- CreateIndex
CREATE INDEX "Promotion_active_sortOrder_idx" ON "Promotion"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductFlavor_flavorId_idx" ON "ProductFlavor"("flavorId");

-- CreateIndex
CREATE INDEX "ProductFlavor_productId_sortOrder_idx" ON "ProductFlavor"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ModifierGroup_name_key" ON "ModifierGroup"("name");

-- CreateIndex
CREATE INDEX "ModifierGroup_active_sortOrder_idx" ON "ModifierGroup"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "ModifierOption_groupId_active_sortOrder_idx" ON "ModifierOption"("groupId", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ModifierOption_groupId_name_key" ON "ModifierOption"("groupId", "name");

-- CreateIndex
CREATE INDEX "ProductModifierGroup_groupId_idx" ON "ProductModifierGroup"("groupId");

-- CreateIndex
CREATE INDEX "ProductModifierGroup_productId_sortOrder_idx" ON "ProductModifierGroup"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "MediaAsset_createdAt_idx" ON "MediaAsset"("createdAt");

-- CreateIndex
CREATE INDEX "DeliveryArea_active_sortOrder_idx" ON "DeliveryArea"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryArea_city_neighborhood_key" ON "DeliveryArea"("city", "neighborhood");

-- CreateIndex
CREATE UNIQUE INDEX "StoreHour_dayOfWeek_key" ON "StoreHour"("dayOfWeek");

-- CreateIndex
CREATE INDEX "StoreHour_sortOrder_idx" ON "StoreHour"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingCode_key" ON "Order"("trackingCode");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_createdAt_idx" ON "Order"("paymentStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Order_scheduledAt_idx" ON "Order"("scheduledAt");

-- CreateIndex
CREATE INDEX "Order_customerPhone_idx" ON "Order"("customerPhone");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_deliveryAreaId_idx" ON "Order"("deliveryAreaId");

-- CreateIndex
CREATE INDEX "Order_assignedCourierId_status_idx" ON "Order"("assignedCourierId", "status");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "OrderItemFlavor_orderItemId_idx" ON "OrderItemFlavor"("orderItemId");

-- CreateIndex
CREATE INDEX "OrderItemFlavor_flavorId_idx" ON "OrderItemFlavor"("flavorId");

-- CreateIndex
CREATE INDEX "OrderItemFlavor_productId_idx" ON "OrderItemFlavor"("productId");

-- CreateIndex
CREATE INDEX "OrderItemOption_orderItemId_idx" ON "OrderItemOption"("orderItemId");

-- CreateIndex
CREATE INDEX "OrderItemOption_optionId_idx" ON "OrderItemOption"("optionId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_changedByUserId_status_createdAt_idx" ON "OrderStatusHistory"("changedByUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_status_createdAt_idx" ON "OrderStatusHistory"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryGeoCache_updatedAt_idx" ON "DeliveryGeoCache"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryGeoCache_cityKey_stateKey_neighborhoodKey_key" ON "DeliveryGeoCache"("cityKey", "stateKey", "neighborhoodKey");

-- CreateIndex
CREATE INDEX "CustomerAddress_userId_isDefault_idx" ON "CustomerAddress"("userId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_name_key" ON "InventoryItem"("name");

-- CreateIndex
CREATE INDEX "InventoryItem_active_name_idx" ON "InventoryItem"("active", "name");

-- CreateIndex
CREATE INDEX "ProductInventoryItem_inventoryItemId_idx" ON "ProductInventoryItem"("inventoryItemId");

-- CreateIndex
CREATE INDEX "InventoryMovement_inventoryItemId_createdAt_idx" ON "InventoryMovement"("inventoryItemId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_orderId_idx" ON "InventoryMovement"("orderId");

-- CreateIndex
CREATE INDEX "DeliverySurchargeRule_active_dayOfWeek_idx" ON "DeliverySurchargeRule"("active", "dayOfWeek");

-- CreateIndex
CREATE INDEX "WhatsAppOutbox_status_createdAt_idx" ON "WhatsAppOutbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppOutbox_orderId_idx" ON "WhatsAppOutbox"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_active_startAt_endAt_idx" ON "Coupon"("active", "startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderId_key" ON "Review"("orderId");

-- CreateIndex
CREATE INDEX "Review_createdAt_idx" ON "Review"("createdAt");

-- CreateIndex
CREATE INDEX "AdminLog_createdAt_idx" ON "AdminLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminLog_userId_createdAt_idx" ON "AdminLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CashSession_userId_openedAt_idx" ON "CashSession"("userId", "openedAt");

-- CreateIndex
CREATE INDEX "BusinessGoal_active_startsAt_endsAt_idx" ON "BusinessGoal"("active", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFlavor" ADD CONSTRAINT "ProductFlavor_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFlavor" ADD CONSTRAINT "ProductFlavor_flavorId_fkey" FOREIGN KEY ("flavorId") REFERENCES "Flavor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModifierOption" ADD CONSTRAINT "ModifierOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ModifierGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModifierGroup" ADD CONSTRAINT "ProductModifierGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModifierGroup" ADD CONSTRAINT "ProductModifierGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ModifierGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryAreaId_fkey" FOREIGN KEY ("deliveryAreaId") REFERENCES "DeliveryArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedCourierId_fkey" FOREIGN KEY ("assignedCourierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemFlavor" ADD CONSTRAINT "OrderItemFlavor_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemFlavor" ADD CONSTRAINT "OrderItemFlavor_flavorId_fkey" FOREIGN KEY ("flavorId") REFERENCES "Flavor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemFlavor" ADD CONSTRAINT "OrderItemFlavor_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemOption" ADD CONSTRAINT "OrderItemOption_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemOption" ADD CONSTRAINT "OrderItemOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ModifierOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInventoryItem" ADD CONSTRAINT "ProductInventoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInventoryItem" ADD CONSTRAINT "ProductInventoryItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
