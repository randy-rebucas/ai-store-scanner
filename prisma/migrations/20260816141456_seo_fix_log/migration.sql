-- CreateTable
CREATE TABLE "SeoFixLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "previousSeoTitle" TEXT,
    "previousSeoDescription" TEXT,
    "newSeoTitle" TEXT NOT NULL,
    "newSeoDescription" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoFixLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeoFixLog_shop_appliedAt_idx" ON "SeoFixLog"("shop", "appliedAt");
