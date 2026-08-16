import type { StoreSnapshot } from "./scan.server";

export type CategoryScore = {
  key: string;
  label: string;
  score: number | null; // null = not enough data to score honestly
  summary: string;
  insufficientDataReason?: string;
};

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function summarize(score: number, good: string, ok: string, bad: string): string {
  if (score >= 80) return good;
  if (score >= 50) return ok;
  return bad;
}

// Every score here is derived directly from data this app actually collects
// via the Admin API — no category is estimated or guessed. Categories we
// can't back with real data (design/visual quality, page performance,
// security/compliance) are deliberately left out rather than faked.
export function computeCategoryScores(data: StoreSnapshot): CategoryScore[] {
  const scores: CategoryScore[] = [];

  // Products: catalog completeness (in stock, tagged, has an image).
  if (data.products.sampleSize > 0) {
    const n = data.products.sampleSize;
    const outOfStockRate = data.products.outOfStockCount / n;
    const untaggedRate = data.products.untaggedCount / n;
    const noImageRate = data.products.withoutImagesCount / n;
    const score = clampScore(
      100 - outOfStockRate * 40 - untaggedRate * 25 - noImageRate * 35,
    );
    scores.push({
      key: "products",
      label: "Products",
      score,
      summary: summarize(
        score,
        "Product catalog is well-stocked, tagged, and has images.",
        `${Math.round(outOfStockRate * 100)}% out of stock or ${Math.round(noImageRate * 100)}% missing images in the sample.`,
        "Many sampled products are out of stock, untagged, or missing images.",
      ),
    });
  } else {
    scores.push({
      key: "products",
      label: "Products",
      score: null,
      summary: "No products found to score.",
      insufficientDataReason: "This store has no products yet.",
    });
  }

  // SEO: share of products with a custom SEO title/description set. Note
  // Shopify falls back to the product title/description on the storefront
  // when these are unset, so this measures "customized," not "broken."
  if (data.products.sampleSize > 0) {
    const n = data.products.sampleSize;
    const missingTitleRate = data.products.missingSeoTitleCount / n;
    const missingDescRate = data.products.missingSeoDescriptionCount / n;
    const score = clampScore(100 - missingTitleRate * 50 - missingDescRate * 50);
    scores.push({
      key: "seo",
      label: "SEO",
      score,
      summary: summarize(
        score,
        "Most sampled products have custom SEO titles and descriptions.",
        `${Math.round(missingTitleRate * 100)}% of sampled products are missing a custom SEO title.`,
        "Most sampled products rely on default titles/descriptions for search — customizing them can improve organic search results.",
      ),
    });
  } else {
    scores.push({
      key: "seo",
      label: "SEO",
      score: null,
      summary: "No products found to score.",
      insufficientDataReason: "This store has no products yet.",
    });
  }

  // Marketing: discount usage and collection curation as a proxy for active
  // merchandising effort.
  {
    const hasDiscounts = data.discounts.activeCount > 0;
    const collectionEmptyRate =
      data.collectionCount > 0 ? data.collections.emptyCount / Math.min(data.collectionCount, 10) : 0;
    const discountScore = Math.min(60, data.discounts.activeCount * 15);
    const collectionScore = (1 - collectionEmptyRate) * 40;
    const score = clampScore(discountScore + collectionScore);
    scores.push({
      key: "marketing",
      label: "Marketing",
      score,
      summary: summarize(
        score,
        "Active discounts and well-curated, non-empty collections.",
        hasDiscounts
          ? "Some discounts running, but collections could be better curated."
          : "No active discounts found — consider running a promotion.",
        "No active discounts and/or several empty collections.",
      ),
    });
  }

  // Trust: how many of Shopify's standard storefront policy pages (privacy,
  // refund, terms of service, shipping) are configured. This is real,
  // queryable data — not a security audit, but a legitimate buyer-trust signal.
  if (data.trust?.policiesAccessible) {
    const CORE_POLICY_TYPES = [
      "PRIVACY_POLICY",
      "REFUND_POLICY",
      "TERMS_OF_SERVICE",
      "SHIPPING_POLICY",
    ];
    const configured = data.trust.configuredPolicyTypes.filter((t) =>
      CORE_POLICY_TYPES.includes(t),
    );
    const score = clampScore((configured.length / CORE_POLICY_TYPES.length) * 100);
    const missing = CORE_POLICY_TYPES.filter((t) => !configured.includes(t));
    scores.push({
      key: "trust",
      label: "Trust",
      score,
      summary: summarize(
        score,
        "All core storefront policy pages (privacy, refunds, terms, shipping) are configured.",
        `${configured.length}/${CORE_POLICY_TYPES.length} policy pages configured — missing: ${missing.map((m) => m.toLowerCase().replace("_", " ")).join(", ")}.`,
        "Most storefront policy pages (privacy, refunds, terms, shipping) aren't configured — buyers often check these before purchasing.",
      ),
    });
  } else {
    scores.push({
      key: "trust",
      label: "Trust",
      score: null,
      summary: "Policy data not available.",
      insufficientDataReason:
        "Reinstall or reauthorize the app to grant the newly-added permission needed to check your policy pages.",
    });
  }

  // Customer retention: repeat-purchase rate within the sampled orders.
  if (data.customers.sampleSize > 0) {
    const repeatRate = data.customers.repeatCustomerCount / data.customers.sampleSize;
    const score = clampScore(repeatRate * 100);
    scores.push({
      key: "retention",
      label: "Customer retention",
      score,
      summary: summarize(
        score,
        `${Math.round(repeatRate * 100)}% of sampled customers are repeat buyers.`,
        `${Math.round(repeatRate * 100)}% repeat-purchase rate in the sample — room to grow.`,
        "Very few repeat customers in the sampled orders.",
      ),
    });
  } else {
    scores.push({
      key: "retention",
      label: "Customer retention",
      score: null,
      summary: "Not enough order history to measure repeat purchases.",
      insufficientDataReason: "No recent orders with customer data were found.",
    });
  }

  // Fulfillment: share of sampled orders still unfulfilled.
  if (data.orders.sampleSize > 0) {
    const unfulfilledRate = data.orders.unfulfilledCount / data.orders.sampleSize;
    const score = clampScore(100 - unfulfilledRate * 100);
    scores.push({
      key: "fulfillment",
      label: "Fulfillment",
      score,
      summary: summarize(
        score,
        "Recent orders are being fulfilled promptly.",
        `${Math.round(unfulfilledRate * 100)}% of sampled orders are still unfulfilled.`,
        "A large share of sampled orders are unfulfilled — check your fulfillment queue.",
      ),
    });
  } else {
    scores.push({
      key: "fulfillment",
      label: "Fulfillment",
      score: null,
      summary: "No recent orders to measure fulfillment against.",
      insufficientDataReason: "No recent orders were found.",
    });
  }

  return scores;
}

export function computeOverallScore(scores: CategoryScore[]): number | null {
  const scored = scores.filter((s): s is CategoryScore & { score: number } => s.score !== null);
  if (scored.length === 0) return null;
  return clampScore(scored.reduce((sum, s) => sum + s.score, 0) / scored.length);
}
