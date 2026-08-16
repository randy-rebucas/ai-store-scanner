// Plan name/limit constants shared between server code (shopify.server.ts,
// billing.server.ts) and client-rendered route components (app.plans.tsx).
// Deliberately has no ".server" suffix and no server-only imports, so route
// modules can reference these at module scope without pulling server code
// into the client bundle.

export const BASIC_PLAN = "Basic" as const;
export const PRO_PLAN = "Pro" as const;
export const GROWTH_PLAN = "Growth" as const;

export const ALL_PLANS = [BASIC_PLAN, PRO_PLAN, GROWTH_PLAN] as const;

export const PLAN_SCAN_LIMITS: Record<string, number | null> = {
  [BASIC_PLAN]: 5,
  [PRO_PLAN]: 20,
  [GROWTH_PLAN]: null, // unlimited
};
