/*
  Warnings:

  - You are about to drop the column `notifyEmail` on the `ShopSettings` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "anthropicApiKey" TEXT,
    "aiModel" TEXT NOT NULL DEFAULT 'claude-sonnet-5',
    "slackWebhookUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ShopSettings" ("aiModel", "anthropicApiKey", "createdAt", "id", "shop", "slackWebhookUrl", "updatedAt") SELECT "aiModel", "anthropicApiKey", "createdAt", "id", "shop", "slackWebhookUrl", "updatedAt" FROM "ShopSettings";
DROP TABLE "ShopSettings";
ALTER TABLE "new_ShopSettings" RENAME TO "ShopSettings";
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
