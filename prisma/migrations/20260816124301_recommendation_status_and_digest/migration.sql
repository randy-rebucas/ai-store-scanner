-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN     "weeklyDigestEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "RecommendationStatus" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecommendationStatus_shop_idx" ON "RecommendationStatus"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationStatus_shop_title_key" ON "RecommendationStatus"("shop", "title");
