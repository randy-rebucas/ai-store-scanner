import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  deleteFeatureRequest,
  listFeatureRequests,
  updateFeatureRequestStatus,
} from "../models/featureRequest.server";
import {
  FEATURE_REQUEST_STATUSES,
  type FeatureRequestStatus,
} from "../models/feature-request-status";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const requests = await listFeatureRequests(session.shop);

  return {
    requests: requests.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      impactLabel: r.impactLabel,
      status: r.status,
      createdAt: r.createdAt,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const id = String(formData.get("id") || "");

  if (!id) {
    return { ok: false, error: "Missing request id" };
  }

  if (intent === "delete") {
    await deleteFeatureRequest(session.shop, id);
    return { ok: true, deleted: id };
  }

  if (intent === "update-status") {
    const status = String(formData.get("status") || "");
    if (!FEATURE_REQUEST_STATUSES.includes(status as FeatureRequestStatus)) {
      return { ok: false, error: "Invalid status" };
    }
    await updateFeatureRequestStatus(
      session.shop,
      id,
      status as FeatureRequestStatus,
    );
    return { ok: true, updated: id };
  }

  return { ok: false, error: "Unknown action" };
};

const STATUS_TONE: Record<string, "info" | "success" | "neutral"> = {
  requested: "info",
  in_progress: "neutral",
  done: "success",
};

const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  in_progress: "In progress",
  done: "Done",
};

function RequestCard({
  request,
}: {
  request: {
    id: string;
    title: string;
    description: string;
    impactLabel: string;
    status: string;
    createdAt: string | Date;
  };
}) {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const isDeleting =
    fetcher.state !== "idle" &&
    fetcher.formData?.get("intent") === "delete";
  const isUpdating =
    fetcher.state !== "idle" &&
    fetcher.formData?.get("intent") === "update-status";

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle" && !fetcher.data.ok) {
      shopify.toast.show(fetcher.data.error || "Something went wrong", {
        isError: true,
      });
    }
  }, [fetcher.data, fetcher.state, shopify]);

  const setStatus = (status: FeatureRequestStatus) => {
    fetcher.submit(
      { intent: "update-status", id: request.id, status },
      { method: "POST" },
    );
  };

  const remove = () => {
    fetcher.submit({ intent: "delete", id: request.id }, { method: "POST" });
  };

  if (isDeleting) {
    return null;
  }

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
      <s-stack direction="block" gap="small">
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-heading>{request.title}</s-heading>
          <s-badge tone={STATUS_TONE[request.status] || "info"}>
            {STATUS_LABEL[request.status] || request.status}
          </s-badge>
        </s-stack>
        <s-paragraph>{request.description}</s-paragraph>
        <s-stack direction="inline" gap="small">
          <s-text tone="neutral">{request.impactLabel}</s-text>
          <s-text tone="neutral">
            &middot; Requested {new Date(request.createdAt).toLocaleDateString()}
          </s-text>
        </s-stack>
        <s-stack direction="inline" gap="small">
          {FEATURE_REQUEST_STATUSES.filter((s) => s !== request.status).map(
            (status) => (
              <s-button
                key={status}
                variant="tertiary"
                onClick={() => setStatus(status)}
                {...(isUpdating ? { loading: true } : {})}
              >
                Mark {STATUS_LABEL[status]}
              </s-button>
            ),
          )}
          <s-button
            variant="tertiary"
            tone="critical"
            onClick={remove}
            {...(isDeleting ? { loading: true } : {})}
          >
            Remove
          </s-button>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

export default function BuildQueue() {
  const { requests } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Build queue">
      <s-section heading="Requested features">
        {requests.length === 0 ? (
          <s-paragraph>
            No features requested yet. Run a{" "}
            <s-link href="/app">store scan</s-link> and click &ldquo;Build
            this feature&rdquo; on a recommendation to add it here.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {requests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="About">
        <s-paragraph>
          Features you request from a store scan show up here so you can
          track what&apos;s been asked for and its status.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
