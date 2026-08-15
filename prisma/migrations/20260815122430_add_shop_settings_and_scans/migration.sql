-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "anthropicApiKey" TEXT,
    "aiModel" TEXT NOT NULL DEFAULT 'claude-sonnet-5',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StoreScan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "storeData" TEXT,
    "recommendations" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");

-- CreateIndex
CREATE INDEX "StoreScan_shop_createdAt_idx" ON "StoreScan"("shop", "createdAt");
