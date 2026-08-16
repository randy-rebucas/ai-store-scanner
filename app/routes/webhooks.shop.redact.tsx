import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteShopSettings } from "../models/settings.server";
import { deleteShopScans } from "../models/scan.server";
import { deleteShopFeatureRequests } from "../models/featureRequest.server";
import { deleteShopRecommendationStatuses } from "../models/recommendationStatus.server";
import { deleteShopPromptInteractions } from "../models/promptInteraction.server";

// Mandatory GDPR webhook, sent ~48h after uninstall. Erase everything this
// app stored for the shop. Uninstall already does this immediately; this is
// a safety net in case that ever fails, so every delete here is idempotent.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await Promise.all([
    db.session.deleteMany({ where: { shop } }),
    deleteShopSettings(shop),
    deleteShopScans(shop),
    deleteShopFeatureRequests(shop),
    deleteShopRecommendationStatuses(shop),
    deleteShopPromptInteractions(shop),
  ]);

  return new Response();
};
