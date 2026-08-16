import Anthropic from "@anthropic-ai/sdk";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { getAnthropicApiKey, getShopSettings } from "./settings.server";
import { extractJsonArrayText } from "./scan.server";
import prisma from "../db.server";

export type SeoSuggestion = {
  id: string;
  title: string;
  suggestedSeoTitle: string;
  suggestedSeoDescription: string;
};

const SEO_FIX_SYSTEM_PROMPT = `You write SEO metadata for Shopify products.
Given a JSON array of products (id, title), write a custom SEO title and meta
description for each one, grounded only in the product title provided — do
not invent product details, materials, or claims that aren't in the title.
- suggestedSeoTitle: 50-60 characters, includes the product name
- suggestedSeoDescription: 120-155 characters, a compelling but factual summary

Respond ONLY with a JSON array of objects shaped like:
{ "id": "...", "title": "...", "suggestedSeoTitle": "...", "suggestedSeoDescription": "..." }
No prose, no markdown fences.`;

export async function generateSeoSuggestions(
  shop: string,
  products: Array<{ id: string; title: string }>,
): Promise<SeoSuggestion[]> {
  if (products.length === 0) return [];

  const apiKey = await getAnthropicApiKey(shop);
  if (!apiKey) {
    throw new Error(
      "No Anthropic API key configured. Add one in Settings before generating SEO fixes.",
    );
  }

  const settings = await getShopSettings(shop);
  const model = settings?.aiModel || "claude-sonnet-5";
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model,
    max_tokens: 4000,
    system: SEO_FIX_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Products:\n${JSON.stringify(products, null, 2)}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned an unexpected response. Please try again.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonArrayText(textBlock.text));
  } catch {
    throw new Error("Claude returned a response we couldn't read. Please try again.");
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.filter(isValidSeoSuggestion);
}

function isValidSeoSuggestion(value: unknown): value is SeoSuggestion {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    s.id.length > 0 &&
    typeof s.title === "string" &&
    typeof s.suggestedSeoTitle === "string" &&
    s.suggestedSeoTitle.length > 0 &&
    typeof s.suggestedSeoDescription === "string" &&
    s.suggestedSeoDescription.length > 0
  );
}

const PRODUCT_UPDATE_SEO_MUTATION = `#graphql
  mutation UpdateProductSeo($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id }
      userErrors { field message }
    }
  }
`;

export type SeoFixInput = {
  id: string;
  productTitle: string;
  seoTitle: string;
  seoDescription: string;
};

export type SeoFixResult = {
  succeeded: SeoFixInput[];
  failed: Array<{ id: string; productTitle: string; error: string }>;
};

export async function applySeoFixes(
  admin: AdminApiContext,
  fixes: SeoFixInput[],
): Promise<SeoFixResult> {
  const succeeded: SeoFixInput[] = [];
  const failed: Array<{ id: string; productTitle: string; error: string }> = [];

  for (const fix of fixes) {
    try {
      const response = await admin.graphql(PRODUCT_UPDATE_SEO_MUTATION, {
        variables: {
          product: {
            id: fix.id,
            seo: { title: fix.seoTitle, description: fix.seoDescription },
          },
        },
      });
      const json = await response.json();
      const userErrors = json.data?.productUpdate?.userErrors ?? [];

      if (userErrors.length > 0) {
        failed.push({
          id: fix.id,
          productTitle: fix.productTitle,
          error: userErrors.map((e: { message: string }) => e.message).join(", "),
        });
      } else {
        succeeded.push(fix);
      }
    } catch (error) {
      failed.push({
        id: fix.id,
        productTitle: fix.productTitle,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return { succeeded, failed };
}

export async function logSeoFixes(shop: string, fixes: SeoFixInput[]) {
  if (fixes.length === 0) return;

  await prisma.seoFixLog.createMany({
    data: fixes.map((fix) => ({
      shop,
      productId: fix.id,
      productTitle: fix.productTitle,
      // These products were selected because SEO title/description were
      // missing, so there is no meaningful "previous" value to record.
      previousSeoTitle: null,
      previousSeoDescription: null,
      newSeoTitle: fix.seoTitle,
      newSeoDescription: fix.seoDescription,
    })),
  });
}

export async function deleteShopSeoFixLogs(shop: string) {
  return prisma.seoFixLog.deleteMany({ where: { shop } });
}
