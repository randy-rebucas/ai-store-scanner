import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { ALL_PLANS, billingIsTest, getActivePlan } from "../models/billing.server";
import { BASIC_PLAN, GROWTH_PLAN, PRO_PLAN } from "../models/plans";

const PLAN_DETAILS = [
  {
    name: BASIC_PLAN,
    price: "$9.99/mo",
    description: "5 store scans per month, build queue, and notifications.",
  },
  {
    name: PRO_PLAN,
    price: "$24.99/mo",
    description: "20 store scans per month, build queue, and notifications.",
  },
  {
    name: GROWTH_PLAN,
    price: "$49.99/mo",
    description: "Unlimited store scans, build queue, and notifications.",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const activePlan = await getActivePlan(billing);
  return { activePlan };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = String(formData.get("plan") || "");

  if (!ALL_PLANS.includes(plan as (typeof ALL_PLANS)[number])) {
    return { ok: false, error: "Unknown plan" };
  }

  return billing.request({
    plan: plan as (typeof ALL_PLANS)[number],
    isTest: billingIsTest,
    returnUrl: "/app",
  });
};

export default function Plans() {
  const { activePlan } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Choose a plan">
      <s-section heading="AI Store Scanner plans">
        <s-paragraph>
          Pick a plan to start scanning your store and generating AI-powered
          feature recommendations.
        </s-paragraph>
      </s-section>

      <s-section heading="Plans">
        <s-stack direction="inline" gap="base">
          {PLAN_DETAILS.map((plan) => (
            <s-box
              key={plan.name}
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-stack direction="block" gap="small">
                <s-heading>{plan.name}</s-heading>
                <s-text tone="neutral">{plan.price}</s-text>
                <s-paragraph>{plan.description}</s-paragraph>
                {activePlan === plan.name ? (
                  <s-badge tone="success">Current plan</s-badge>
                ) : (
                  <form method="post">
                    <input type="hidden" name="plan" value={plan.name} />
                    <s-button variant="primary" type="submit">
                      {activePlan ? "Switch to this plan" : "Subscribe"}
                    </s-button>
                  </form>
                )}
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}
