import {
  BASIC_PLAN,
  GROWTH_PLAN,
  PLAN_SCAN_LIMITS,
  PRO_PLAN,
  authenticate,
} from "../shopify.server";

export const ALL_PLANS = [BASIC_PLAN, PRO_PLAN, GROWTH_PLAN] as const;

type Billing = Awaited<ReturnType<typeof authenticate.admin>>["billing"];

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
  if (!plan) return 0;
  return PLAN_SCAN_LIMITS[plan] ?? 0;
}

export { isTest as billingIsTest };
