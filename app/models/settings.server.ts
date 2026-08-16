import prisma from "../db.server";
import { decryptSecret, encryptSecret } from "./crypto.server";

export async function getShopSettings(shop: string) {
  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!settings?.anthropicApiKey) {
    return settings;
  }

  return {
    ...settings,
    anthropicApiKey: decryptSecret(settings.anthropicApiKey),
  };
}

export async function upsertShopSettings(
  shop: string,
  data: {
    anthropicApiKey?: string | null;
    aiModel?: string;
    slackWebhookUrl?: string | null;
    adminNotificationEmail?: string | null;
    weeklyDigestEnabled?: boolean;
  },
) {
  const stored = {
    ...data,
    anthropicApiKey:
      data.anthropicApiKey != null
        ? encryptSecret(data.anthropicApiKey)
        : data.anthropicApiKey,
  };

  return prisma.shopSettings.upsert({
    where: { shop },
    create: { shop, ...stored },
    update: stored,
  });
}

export async function getAnthropicApiKey(shop: string) {
  const settings = await getShopSettings(shop);
  return settings?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || null;
}

export async function deleteShopSettings(shop: string) {
  return prisma.shopSettings.deleteMany({ where: { shop } });
}
