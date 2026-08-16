import prisma from "../db.server";

export type PromptInteractionAction = "viewed" | "copied" | "opened_builder";

export async function recordPromptInteraction(
  shop: string,
  title: string,
  action: PromptInteractionAction,
) {
  return prisma.promptInteraction.create({
    data: { shop, title, action },
  });
}

export async function deleteShopPromptInteractions(shop: string) {
  return prisma.promptInteraction.deleteMany({ where: { shop } });
}

// Basic adoption metrics for the build-prompt feature, across all shops.
// Intended for the app builder's own visibility, not shown to merchants.
export async function getPromptInteractionSummary(sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.promptInteraction.groupBy({
    by: ["action"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });

  const counts: Record<PromptInteractionAction, number> = {
    viewed: 0,
    copied: 0,
    opened_builder: 0,
  };
  for (const row of rows) {
    counts[row.action as PromptInteractionAction] = row._count._all;
  }
  return counts;
}
