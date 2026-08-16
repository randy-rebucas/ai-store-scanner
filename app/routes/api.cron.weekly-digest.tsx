import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { ALL_PLANS } from "../models/plans";
import {
  collectStoreData,
  completeScan,
  computeScanTrends,
  createScan,
  failScan,
  generateRecommendations,
  getLatestScan,
  getStoreOwnerEmail,
  pruneOldScans,
  type StoreSnapshot,
} from "../models/scan.server";
import { getHandledTitles } from "../models/recommendationStatus.server";
import { getShopSettings } from "../models/settings.server";
import { notifyWeeklyDigest } from "../models/notify.server";
import { getAppUrl } from "../utils/app-url";

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when
// CRON_SECRET is set as an env var and referenced in vercel.json. Reject
// anything else so this endpoint can't be used to trigger scans for free.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function activePlanFor(shop: string): Promise<string | null> {
  try {
    const { admin } = await unauthenticated.admin(shop);
    const response = await admin.graphql(`#graphql
      query ActiveSubscriptions {
        currentAppInstallation {
          activeSubscriptions { name status }
        }
      }
    `);
    const json = await response.json();
    const subs: Array<{ name: string; status: string }> =
      json.data?.currentAppInstallation?.activeSubscriptions ?? [];
    const active = subs.find(
      (s) => s.status === "ACTIVE" && (ALL_PLANS as readonly string[]).includes(s.name),
    );
    return active?.name ?? null;
  } catch {
    return null;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const billingEnforced = process.env.NODE_ENV === "production";
  const appUrl = getAppUrl();

  const shops = await prisma.session.findMany({
    where: { isOnline: false },
    select: { shop: true },
    distinct: ["shop"],
  });

  const results: Array<{ shop: string; ok: boolean; reason?: string }> = [];

  for (const { shop } of shops) {
    try {
      const settings = await getShopSettings(shop);
      if (settings?.weeklyDigestEnabled === false) {
        results.push({ shop, ok: false, reason: "digest disabled" });
        continue;
      }

      const hasApiKey = Boolean(settings?.anthropicApiKey || process.env.ANTHROPIC_API_KEY);
      if (!hasApiKey) {
        results.push({ shop, ok: false, reason: "no API key" });
        continue;
      }

      if (billingEnforced) {
        const plan = await activePlanFor(shop);
        if (!plan) {
          results.push({ shop, ok: false, reason: "no active plan" });
          continue;
        }
      }

      const { admin } = await unauthenticated.admin(shop);
      const previousScan = await getLatestScan(shop);
      const previousStoreData: StoreSnapshot | null =
        previousScan?.storeData ? JSON.parse(previousScan.storeData) : null;

      const scan = await createScan(shop);
      try {
        const storeData = await collectStoreData(admin);
        const excludeTitles = await getHandledTitles(shop);
        const recommendations = await generateRecommendations(
          shop,
          storeData,
          undefined,
          excludeTitles,
        );
        await completeScan(scan.id, storeData, recommendations);
        await pruneOldScans(shop);

        const trends = computeScanTrends(storeData, previousStoreData);
        const storeOwnerEmail = await getStoreOwnerEmail(admin);

        await notifyWeeklyDigest({
          shop,
          storeOwnerEmail,
          trends: trends.map((t) => ({
            label: t.label,
            delta: t.delta,
            higherIsBetter: t.higherIsBetter,
          })),
          topRecommendations: recommendations.slice(0, 3).map((r) => ({
            title: r.title,
            description: r.description,
          })),
          appUrl,
        });

        results.push({ shop, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Scan failed";
        await failScan(scan.id, message);
        results.push({ shop, ok: false, reason: message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      results.push({ shop, ok: false, reason: message });
    }
  }

  return Response.json({ ranAt: new Date().toISOString(), results });
};
