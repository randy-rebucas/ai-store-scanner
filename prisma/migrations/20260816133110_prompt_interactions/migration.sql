-- CreateTable
CREATE TABLE "PromptInteraction" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromptInteraction_shop_createdAt_idx" ON "PromptInteraction"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "PromptInteraction_action_idx" ON "PromptInteraction"("action");
