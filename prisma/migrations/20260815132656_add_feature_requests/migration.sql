-- CreateTable
CREATE TABLE "FeatureRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "impactLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "FeatureRequest_shop_createdAt_idx" ON "FeatureRequest"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureRequest_shop_scanId_title_key" ON "FeatureRequest"("shop", "scanId", "title");
