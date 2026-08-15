import Anthropic from "@anthropic-ai/sdk";
import prisma from "../db.server";
import { getAnthropicApiKey, getShopSettings } from "./settings.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export type Recommendation = {
  title: string;
  description: string;
  impact: string;
  impactLabel: string;
};

export type StoreSnapshot = {
  shop: {
    name: string;
    myshopifyDomain: string;
    currencyCode: string;
    plan: string;
  };
  productCount: number;
  collectionCount: number;
  orderCount: number;
  customerCount: number;
  discountCount: number;
  activeTheme: string | null;
  sampleProductTitles: string[];
};

// Product/collection/order/customer counts via the count endpoints, which are
// cheaper and don't require paginating full result sets.
const COUNTS_QUERY = `#graphql
  query StoreCounts {
    shop {
      name
      myshopifyDomain
      currencyCode
      plan {
        displayName
      }
    }
    productsCount {
      count
    }
    collectionsCount {
      count
    }
    ordersCount: orders(first: 1) {
      edges { node { id } }
    }
    customersCount {
      count
    }
    discountNodes(first: 25) {
      edges { node { id } }
    }
    products(first: 10) {
      edges { node { title } }
    }
  }
`;

export async function collectStoreData(
  admin: AdminApiContext,
): Promise<StoreSnapshot> {
  const response = await admin.graphql(COUNTS_QUERY);
  const json = await response.json();
  const data = json.data;

  return {
    shop: {
      name: data.shop.name,
      myshopifyDomain: data.shop.myshopifyDomain,
      currencyCode: data.shop.currencyCode,
      plan: data.shop.plan?.displayName || "unknown",
    },
    productCount: data.productsCount?.count ?? 0,
    collectionCount: data.collectionsCount?.count ?? 0,
    orderCount: data.ordersCount?.edges?.length ?? 0,
    customerCount: data.customersCount?.count ?? 0,
    discountCount: data.discountNodes?.edges?.length ?? 0,
    activeTheme: null,
    sampleProductTitles: (data.products?.edges ?? []).map(
      (e: { node: { title: string } }) => e.node.title,
    ),
  };
}

export async function getStoreOwnerEmail(
  admin: AdminApiContext,
): Promise<string | null> {
  const response = await admin.graphql(`#graphql
    query StoreOwnerEmail {
      shop {
        email
      }
    }
  `);
  const json = await response.json();
  return json.data?.shop?.email ?? null;
}

const RECOMMENDATION_SYSTEM_PROMPT = `You are an e-commerce growth consultant analyzing a Shopify store.
Given a JSON snapshot of the store's data, recommend 3-5 features or apps the merchant
should build or install to grow the store. For each recommendation, provide:
- title: short feature name (e.g. "Frequently Bought Together")
- description: 1-2 sentence explanation tailored to this store's data
- impact: one of "revenue", "retention", "aov", "conversion", "complexity"
- impactLabel: a short label like "High revenue impact" or "Low implementation complexity"

Respond ONLY with a JSON array of objects matching this shape, no prose, no markdown fences.`;

export async function generateRecommendations(
  shop: string,
  storeData: StoreSnapshot,
): Promise<Recommendation[]> {
  const apiKey = await getAnthropicApiKey(shop);
  if (!apiKey) {
    throw new Error(
      "No Anthropic API key configured. Add one in Settings before running a scan.",
    );
  }

  const settings = await getShopSettings(shop);
  const model = settings?.aiModel || "claude-sonnet-5";

  const client = new Anthropic({ apiKey });

  let message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: 1500,
      system: RECOMMENDATION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Store snapshot:\n${JSON.stringify(storeData, null, 2)}`,
        },
      ],
    });
  } catch (error) {
    throw new Error(describeAnthropicError(error));
  }

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      "Claude returned an unexpected response. Please try running the scan again.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new Error(
      "Claude returned a response we couldn't read. Please try running the scan again.",
    );
  }

  const recommendations = Array.isArray(parsed)
    ? parsed.filter(isValidRecommendation)
    : [];

  if (recommendations.length === 0) {
    throw new Error(
      "Claude returned recommendations we couldn't understand. Please try running the scan again.",
    );
  }

  return recommendations;
}

function isValidRecommendation(value: unknown): value is Recommendation {
  if (!value || typeof value !== "object") {
    return false;
  }
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.title === "string" &&
    rec.title.length > 0 &&
    typeof rec.description === "string" &&
    rec.description.length > 0 &&
    typeof rec.impact === "string" &&
    typeof rec.impactLabel === "string" &&
    rec.impactLabel.length > 0
  );
}

function describeAnthropicError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    switch (error.status) {
      case 401:
        return "Your Anthropic API key was rejected. Double-check it in Settings and save it again.";
      case 403:
        return "Your Anthropic API key doesn't have permission for this request. Check its permissions in the Anthropic console.";
      case 429:
        return "Anthropic rate-limited this request. Wait a moment and try the scan again.";
      case 400:
        return "Anthropic rejected the request as invalid. Try again, and contact support if it keeps happening.";
      case 529:
        return "Anthropic's API is temporarily overloaded. Please try the scan again shortly.";
      default:
        if (error.status && error.status >= 500) {
          return "Anthropic's API is having issues right now. Please try the scan again shortly.";
        }
        return `Anthropic returned an error: ${error.message}`;
    }
  }

  if (error instanceof Error && error.message.includes("fetch failed")) {
    return "Couldn't reach the Anthropic API. Check your connection and try again.";
  }

  const fromEnvelope = describeAnthropicErrorEnvelope(error);
  if (fromEnvelope) {
    return fromEnvelope;
  }

  return "Something went wrong while generating recommendations. Please try again.";
}

const ANTHROPIC_ERROR_TYPE_MESSAGES: Record<string, string> = {
  authentication_error:
    "Your Anthropic API key was rejected. Double-check it in Settings and save it again.",
  permission_error:
    "Your Anthropic API key doesn't have permission for this request. Check its permissions in the Anthropic console.",
  rate_limit_error:
    "Anthropic rate-limited this request. Wait a moment and try the scan again.",
  invalid_request_error:
    "Anthropic rejected the request as invalid. Try again, and contact support if it keeps happening.",
  overloaded_error:
    "Anthropic's API is temporarily overloaded. Please try the scan again shortly.",
  api_error:
    "Anthropic's API is having issues right now. Please try the scan again shortly.",
  not_found_error:
    "The selected AI model wasn't found. Pick a different model in Settings.",
};

// Handles the raw `{"type":"error","error":{"type":"...","message":"..."}}`
// envelope Anthropic returns, in case it reaches us as a plain string rather
// than an Anthropic.APIError instance (e.g. an error message read back from
// storage).
function describeAnthropicErrorEnvelope(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : null;
  if (!raw || !raw.trim().startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      error?: { type?: string; message?: string };
    };
    const errorType = parsed.error?.type;
    if (errorType && ANTHROPIC_ERROR_TYPE_MESSAGES[errorType]) {
      return ANTHROPIC_ERROR_TYPE_MESSAGES[errorType];
    }
    if (parsed.error?.message) {
      return `Anthropic returned an error: ${parsed.error.message}`;
    }
  } catch {
    return null;
  }

  return null;
}

const SCAN_COOLDOWN_MS = 2 * 60 * 1000;
const SHARED_KEY_DAILY_SCAN_LIMIT = 3;
const MAX_STORED_SCANS_PER_SHOP = 20;

export async function checkScanAllowed(
  shop: string,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const [settings, latestScan] = await Promise.all([
    getShopSettings(shop),
    getLatestScan(shop),
  ]);

  if (latestScan) {
    const elapsed = Date.now() - latestScan.createdAt.getTime();
    if (elapsed < SCAN_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((SCAN_COOLDOWN_MS - elapsed) / 1000);
      return {
        allowed: false,
        reason: `Please wait ${waitSeconds}s before running another scan.`,
      };
    }
  }

  const usingSharedKey =
    !settings?.anthropicApiKey && Boolean(process.env.ANTHROPIC_API_KEY);
  if (usingSharedKey) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await prisma.storeScan.count({
      where: { shop, createdAt: { gte: since } },
    });
    if (recentCount >= SHARED_KEY_DAILY_SCAN_LIMIT) {
      return {
        allowed: false,
        reason: `You've used all ${SHARED_KEY_DAILY_SCAN_LIMIT} free scans for today. Add your own Anthropic API key in Settings for unlimited scans.`,
      };
    }
  }

  return { allowed: true };
}

export async function pruneOldScans(shop: string) {
  const scans = await prisma.storeScan.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    skip: MAX_STORED_SCANS_PER_SHOP,
    select: { id: true },
  });

  if (scans.length === 0) {
    return;
  }

  await prisma.storeScan.deleteMany({
    where: { id: { in: scans.map((s) => s.id) } },
  });
}

export async function deleteShopScans(shop: string) {
  return prisma.storeScan.deleteMany({ where: { shop } });
}

export async function createScan(shop: string) {
  return prisma.storeScan.create({
    data: { shop, status: "running" },
  });
}

export async function completeScan(
  scanId: string,
  storeData: StoreSnapshot,
  recommendations: Recommendation[],
) {
  return prisma.storeScan.update({
    where: { id: scanId },
    data: {
      status: "completed",
      storeData: JSON.stringify(storeData),
      recommendations: JSON.stringify(recommendations),
      completedAt: new Date(),
    },
  });
}

export async function failScan(scanId: string, errorMessage: string) {
  return prisma.storeScan.update({
    where: { id: scanId },
    data: { status: "failed", errorMessage, completedAt: new Date() },
  });
}

export async function getLatestScan(shop: string) {
  return prisma.storeScan.findFirst({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
}
