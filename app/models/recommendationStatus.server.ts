import prisma from "../db.server";

export type RecommendationStatusValue = "implemented" | "dismissed";

export async function getRecommendationStatuses(
  shop: string,
): Promise<Record<string, RecommendationStatusValue>> {
  const rows = await prisma.recommendationStatus.findMany({
    where: { shop },
    select: { title: true, status: true },
  });

  return Object.fromEntries(
    rows.map((row) => [row.title, row.status as RecommendationStatusValue]),
  );
}

export async function getHandledTitles(shop: string): Promise<string[]> {
  const rows = await prisma.recommendationStatus.findMany({
    where: { shop },
    select: { title: true },
  });
  return rows.map((row) => row.title);
}

export async function setRecommendationStatus(
  shop: string,
  title: string,
  status: RecommendationStatusValue,
) {
  return prisma.recommendationStatus.upsert({
    where: { shop_title: { shop, title } },
    create: { shop, title, status },
    update: { status },
  });
}

export async function clearRecommendationStatus(shop: string, title: string) {
  return prisma.recommendationStatus.deleteMany({ where: { shop, title } });
}

export async function deleteShopRecommendationStatuses(shop: string) {
  return prisma.recommendationStatus.deleteMany({ where: { shop } });
}
