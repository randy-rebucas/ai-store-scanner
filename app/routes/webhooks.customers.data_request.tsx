import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Mandatory GDPR webhook. This app never stores customer PII (only
// aggregate counts from the Admin API), so there is no customer data to
// return — acknowledge the request.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  return new Response();
};
