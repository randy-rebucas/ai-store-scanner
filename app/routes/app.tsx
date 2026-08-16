import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { BILLING_ENFORCED, getActivePlan } from "../models/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, redirect } = await authenticate.admin(request);

  const url = new URL(request.url);
  if (BILLING_ENFORCED && url.pathname !== "/app/plans") {
    const activePlan = await getActivePlan(billing);
    if (!activePlan) {
      return redirect("/app/plans");
    }
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Store Scanner</s-link>
        <s-link href="/app/build-queue">Build Queue</s-link>
        <s-link href="/app/settings">Settings</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
