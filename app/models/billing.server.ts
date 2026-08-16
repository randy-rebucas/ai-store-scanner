import { authenticate } from "../shopify.server";
import { ALL_PLANS, PLAN_SCAN_LIMITS } from "./plans";

export { ALL_PLANS };

type Billing = Awaited<ReturnType<typeof authenticate.admin>>["billing"];

// Billing is only enforced in production. Local dev (`shopify app dev`) and
// preview deploys run with NODE_ENV unset/non-production, so plan checks and
// scan limits are skipped there to avoid needing a test charge on every dev store.
export const BILLING_ENFORCED = process.env.NODE_ENV === "production";

// Vercel deploys always run in production, so shop billing charges are real
// unless the shop itself is a Shopify test/development store.
const isTest = process.env.NODE_ENV !== "production";

export async function getActivePlan(billing: Billing): Promise<string | null> {
  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: [...ALL_PLANS],
    isTest,
  });

  if (!hasActivePayment) return null;
  return appSubscriptions[0]?.name ?? null;
}

export function scanLimitForPlan(plan: string | null): number | null {
  if (!BILLING_ENFORCED) return null;
  if (!plan) return 0;
  return PLAN_SCAN_LIMITS[plan] ?? 0;
}

export { isTest as billingIsTest };
