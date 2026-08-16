import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopSettings } from "../models/settings.server";
import {
  getLatestScan,
  getStoreOwnerEmail,
  type Recommendation,
} from "../models/scan.server";
import {
  createFeatureRequest,
  getRequestedTitles,
} from "../models/featureRequest.server";
import { notifyFeatureRequested } from "../models/notify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [settings, latestScan] = await Promise.all([
    getShopSettings(session.shop),
    getLatestScan(session.shop),
  ]);

  const requestedTitles = latestScan
    ? await getRequestedTitles(session.shop, latestScan.id)
    : [];

  return {
    hasApiKey: Boolean(settings?.anthropicApiKey || process.env.ANTHROPIC_API_KEY),
    requestedTitles,
    scan: latestScan
      ? {
          id: latestScan.id,
          status: latestScan.status,
          errorMessage: latestScan.errorMessage,
          createdAt: latestScan.createdAt,
          storeData: latestScan.storeData
            ? JSON.parse(latestScan.storeData)
            : null,
          recommendations: latestScan.recommendations
            ? (JSON.parse(latestScan.recommendations) as Recommendation[])
            : null,
        }
      : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "request-feature") {
    const scanId = String(formData.get("scanId") || "");
    const title = String(formData.get("title") || "");
    const description = String(formData.get("description") || "");
    const impactLabel = String(formData.get("impactLabel") || "");

    if (!scanId || !title) {
      return { ok: false, error: "Missing feature details" };
    }

    await createFeatureRequest(session.shop, scanId, {
      title,
      description,
      impactLabel,
    });

    const storeOwnerEmail = await getStoreOwnerEmail(admin);

    await notifyFeatureRequested({
      shop: session.shop,
      title,
      description,
      impactLabel,
      storeOwnerEmail,
    });

    return { ok: true, requested: title };
  }

  return { ok: false, error: "Unknown action" };
};

const IMPACT_TONE: Record<string, "success" | "info" | "neutral"> = {
  revenue: "success",
  retention: "success",
  aov: "info",
  conversion: "info",
  complexity: "neutral",
};

function FeatureRequestButton({
  scanId,
  recommendation,
  alreadyRequested,
}: {
  scanId: string;
  recommendation: Recommendation;
  alreadyRequested: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const isRequesting = fetcher.state !== "idle";
  const justRequested = fetcher.data?.ok && "requested" in fetcher.data;
  const requested = alreadyRequested || justRequested;

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      if (fetcher.data.ok && "requested" in fetcher.data) {
        shopify.toast.show(`${fetcher.data.requested} added to your build queue`);
      } else if (!fetcher.data.ok) {
        shopify.toast.show(fetcher.data.error || "Couldn't request this feature", {
          isError: true,
        });
      }
    }
  }, [fetcher.data, fetcher.state, shopify]);

  const requestFeature = () => {
    fetcher.submit(
      {
        intent: "request-feature",
        scanId,
        title: recommendation.title,
        description: recommendation.description,
        impactLabel: recommendation.impactLabel,
      },
      { method: "POST" },
    );
  };

  return (
    <s-button
      variant={requested ? "secondary" : "tertiary"}
      disabled={requested}
      onClick={requestFeature}
      {...(isRequesting ? { loading: true } : {})}
    >
      {requested ? "Added to build queue" : "Build this feature →"}
    </s-button>
  );
}

export default function Index() {
  const { hasApiKey, scan, requestedTitles } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const revalidator = useRevalidator();

  const [isScanning, setIsScanning] = useState(false);
  const [scanLogs, setScanLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [scanLogs]);

  const runScan = async () => {
    setScanLogs([]);
    setIsScanning(true);

    try {
      const response = await fetch("/app/scan-stream", { method: "POST" });
      if (!response.body) {
        throw new Error("Scan stream unavailable");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalOk = false;
      let finalError: string | null = null;

      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        if (done) break;
        const value = chunk.value;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as
            | { type: "log"; message: string }
            | { type: "done"; ok: boolean; error?: string };

          if (event.type === "log") {
            setScanLogs((prev) => [...prev, event.message]);
          } else if (event.type === "done") {
            finalOk = event.ok;
            finalError = event.error ?? null;
          }
        }
      }

      if (finalOk) {
        setScanLogs((prev) => [...prev, "Scan complete."]);
        shopify.toast.show("Store scan complete");
      } else {
        setScanLogs((prev) => [...prev, `Failed: ${finalError}`]);
        shopify.toast.show(finalError || "Scan failed", { isError: true });
      }
      revalidator.revalidate();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scan failed";
      setScanLogs((prev) => [...prev, `Failed: ${message}`]);
      shopify.toast.show(message, { isError: true });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <s-page heading="AI Store Audit">
      <s-button
        slot="primary-action"
        onClick={runScan}
        disabled={!hasApiKey}
        {...(isScanning ? { loading: true } : {})}
      >
        {scan ? "Run new scan" : "Scan my store"}
      </s-button>

      {!hasApiKey && (
        <s-banner tone="warning" heading="Anthropic API key required">
          <s-paragraph>
            Add your Anthropic API key in{" "}
            <s-link href="/app/settings">Settings</s-link> before running a
            scan.
          </s-paragraph>
        </s-banner>
      )}

      <s-section heading="Connect a store and let AI analyze it">
        <s-paragraph>
          This scan reviews your products, collections, orders, customers,
          and discounts, then asks Claude to recommend features that could
          move the needle for your store &mdash; ranked by revenue,
          retention, AOV, and implementation complexity.
        </s-paragraph>
      </s-section>

      {(isScanning || scanLogs.length > 0) && (
        <s-section heading="Scan progress">
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small-200">
              {scanLogs.map((line, i) => (
                <s-text key={i} tone={line.startsWith("Failed") ? "critical" : "neutral"}>
                  {line}
                </s-text>
              ))}
              {isScanning && <s-spinner />}
            </s-stack>
            <div ref={logsEndRef} />
          </s-box>
        </s-section>
      )}

      {scan?.storeData && (
        <s-section heading="Store snapshot">
          <s-stack direction="inline" gap="large">
            <s-paragraph>
              <s-text>Products: </s-text>
              <s-text tone="neutral">{scan.storeData.productCount}</s-text>
            </s-paragraph>
            <s-paragraph>
              <s-text>Collections: </s-text>
              <s-text tone="neutral">{scan.storeData.collectionCount}</s-text>
            </s-paragraph>
            <s-paragraph>
              <s-text>Customers: </s-text>
              <s-text tone="neutral">{scan.storeData.customerCount}</s-text>
            </s-paragraph>
            <s-paragraph>
              <s-text>Discounts: </s-text>
              <s-text tone="neutral">{scan.storeData.discountCount}</s-text>
            </s-paragraph>
          </s-stack>
        </s-section>
      )}

      {scan?.status === "failed" && (
        <s-banner tone="critical" heading="Last scan failed">
          <s-paragraph>{scan.errorMessage}</s-paragraph>
          {scan.errorMessage?.toLowerCase().includes("api key") && (
            <s-paragraph>
              <s-link href="/app/settings">Update your API key in Settings</s-link>
            </s-paragraph>
          )}
        </s-banner>
      )}

      {scan?.recommendations && scan.recommendations.length > 0 && (
        <s-section heading="Recommended features">
          <s-stack direction="block" gap="base">
            {scan.recommendations.map((rec, index) => (
              <s-box
                key={rec.title}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="block" gap="small">
                  <s-heading>
                    {index + 1}. {rec.title}
                  </s-heading>
                  <s-paragraph>{rec.description}</s-paragraph>
                  <s-badge tone={IMPACT_TONE[rec.impact] || "info"}>
                    {rec.impactLabel}
                  </s-badge>
                  <s-box>
                    <FeatureRequestButton
                      scanId={scan.id}
                      recommendation={rec}
                      alreadyRequested={requestedTitles.includes(rec.title)}
                    />
                  </s-box>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      )}

      <s-section slot="aside" heading="How it works">
        <s-unordered-list>
          <s-list-item>Analyzes products, collections, orders, customers, and discounts</s-list-item>
          <s-list-item>Sends an anonymized snapshot to Claude</s-list-item>
          <s-list-item>Returns ranked, actionable feature recommendations</s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="Build queue">
        <s-paragraph>
          Track features you&apos;ve requested in the{" "}
          <s-link href="/app/build-queue">Build Queue</s-link>.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Settings">
        <s-paragraph>
          Manage your Anthropic API key and model in{" "}
          <s-link href="/app/settings">Settings</s-link>.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
