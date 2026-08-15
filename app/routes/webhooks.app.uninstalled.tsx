import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteShopSettings } from "../models/settings.server";
import { deleteShopScans } from "../models/scan.server";
import { deleteShopFeatureRequests } from "../models/featureRequest.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await Promise.all([
      db.session.deleteMany({ where: { shop } }),
      deleteShopSettings(shop),
      deleteShopScans(shop),
      deleteShopFeatureRequests(shop),
    ]);
  }

  return new Response();
};
