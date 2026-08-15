-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "anthropicApiKey" TEXT,
    "aiModel" TEXT NOT NULL DEFAULT 'claude-sonnet-5',
    "slackWebhookUrl" TEXT,
    "adminNotificationEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreScan" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "storeData" TEXT,
    "recommendations" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StoreScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureRequest" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "impactLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");

-- CreateIndex
CREATE INDEX "StoreScan_shop_createdAt_idx" ON "StoreScan"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "FeatureRequest_shop_createdAt_idx" ON "FeatureRequest"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureRequest_shop_scanId_title_key" ON "FeatureRequest"("shop", "scanId", "title");
