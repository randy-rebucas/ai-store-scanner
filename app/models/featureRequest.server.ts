import prisma from "../db.server";
import type { FeatureRequestStatus } from "./feature-request-status";

export async function createFeatureRequest(
  shop: string,
  scanId: string,
  recommendation: { title: string; description: string; impactLabel: string },
) {
  return prisma.featureRequest.upsert({
    where: {
      shop_scanId_title: { shop, scanId, title: recommendation.title },
    },
    create: {
      shop,
      scanId,
      title: recommendation.title,
      description: recommendation.description,
      impactLabel: recommendation.impactLabel,
    },
    update: {},
  });
}

export async function getRequestedTitles(shop: string, scanId: string) {
  const requests = await prisma.featureRequest.findMany({
    where: { shop, scanId },
    select: { title: true },
  });
  return requests.map((r) => r.title);
}

export async function listFeatureRequests(shop: string) {
  return prisma.featureRequest.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateFeatureRequestStatus(
  shop: string,
  id: string,
  status: FeatureRequestStatus,
) {
  return prisma.featureRequest.updateMany({
    where: { id, shop },
    data: { status },
  });
}

export async function deleteFeatureRequest(shop: string, id: string) {
  return prisma.featureRequest.deleteMany({
    where: { id, shop },
  });
}

export async function deleteShopFeatureRequests(shop: string) {
  return prisma.featureRequest.deleteMany({ where: { shop } });
}
