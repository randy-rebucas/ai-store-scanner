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
  computeScanTrends,
  getLatestScan,
  getPreviousCompletedScan,
  getStoreOwnerEmail,
  type Recommendation,
  type StoreSnapshot,
} from "../models/scan.server";
import {
  createFeatureRequest,
  getRequestedTitles,
} from "../models/featureRequest.server";
import { notifyFeatureRequested } from "../models/notify.server";
import {
  getRecommendationStatuses,
  setRecommendationStatus,
  clearRecommendationStatus,
  type RecommendationStatusValue,
} from "../models/recommendationStatus.server";
import { getCohortBenchmark } from "../models/benchmark.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [settings, latestScan] = await Promise.all([
    getShopSettings(session.shop),
    getLatestScan(session.shop),
  ]);

  const requestedTitles = latestScan
    ? await getRequestedTitles(session.shop, latestScan.id)
    : [];

  const currentStoreData: StoreSnapshot | null =
    latestScan?.storeData ? JSON.parse(latestScan.storeData) : null;

  let trends: ReturnType<typeof computeScanTrends> = [];
  let benchmarks: Awaited<ReturnType<typeof getCohortBenchmark>> = [];
  if (latestScan && latestScan.status === "completed" && currentStoreData) {
    const previousScan = await getPreviousCompletedScan(session.shop, latestScan.id);
    const previousStoreData: StoreSnapshot | null =
      previousScan?.storeData ? JSON.parse(previousScan.storeData) : null;
    trends = computeScanTrends(currentStoreData, previousStoreData);
    benchmarks = await getCohortBenchmark(session.shop, currentStoreData);
  }

  const recommendationStatuses = await getRecommendationStatuses(session.shop);

  return {
    hasApiKey: Boolean(settings?.anthropicApiKey || process.env.ANTHROPIC_API_KEY),
    requestedTitles,
    trends,
    benchmarks,
    recommendationStatuses,
    scan: latestScan
      ? {
          id: latestScan.id,
          status: latestScan.status,
          errorMessage: latestScan.errorMessage,
          createdAt: latestScan.createdAt,
          storeData: currentStoreData,
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

  if (intent === "mark-recommendation") {
    const title = String(formData.get("title") || "");
    const status = String(formData.get("status") || "");

    if (!title) {
      return { ok: false, error: "Missing recommendation title" };
    }

    if (status === "active") {
      await clearRecommendationStatus(session.shop, title);
    } else if (status === "implemented" || status === "dismissed") {
      await setRecommendationStatus(
        session.shop,
        title,
        status as RecommendationStatusValue,
      );
    } else {
      return { ok: false, error: "Unknown status" };
    }

    return { ok: true, title, status };
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

function RecommendationStatusControls({
  title,
  status,
}: {
  title: string;
  status: RecommendationStatusValue | undefined;
}) {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.ok && fetcher.state === "idle" && "status" in fetcher.data) {
      const label =
        fetcher.data.status === "implemented"
          ? "Marked as implemented"
          : fetcher.data.status === "dismissed"
            ? "Dismissed"
            : "Restored to active";
      shopify.toast.show(label);
    }
  }, [fetcher.data, fetcher.state, shopify]);

  const mark = (nextStatus: "implemented" | "dismissed" | "active") => {
    fetcher.submit(
      { intent: "mark-recommendation", title, status: nextStatus },
      { method: "POST" },
    );
  };

  if (status === "implemented" || status === "dismissed") {
    return (
      <s-stack direction="inline" gap="small">
        <s-badge tone={status === "implemented" ? "success" : "neutral"}>
          {status === "implemented" ? "Implemented" : "Dismissed"}
        </s-badge>
        <s-button
          variant="tertiary"
          onClick={() => mark("active")}
          {...(isSaving ? { loading: true } : {})}
        >
          Move back to active
        </s-button>
      </s-stack>
    );
  }

  return (
    <s-stack direction="inline" gap="small">
      <s-button
        variant="tertiary"
        onClick={() => mark("implemented")}
        {...(isSaving ? { loading: true } : {})}
      >
        Mark as implemented
      </s-button>
      <s-button
        variant="tertiary"
        onClick={() => mark("dismissed")}
        {...(isSaving ? { loading: true } : {})}
      >
        Dismiss
      </s-button>
    </s-stack>
  );
}

const AI_SHOPIFY_BUILDER_URL = "https://www.ai-shopify-builder.app";

function BuildPromptPanel({ buildPrompt }: { buildPrompt: string }) {
  const shopify = useAppBridge();
  const [expanded, setExpanded] = useState(false);

  if (!buildPrompt) return null;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildPrompt);
      shopify.toast.show("Build prompt copied");
    } catch {
      shopify.toast.show("Couldn't copy prompt", { isError: true });
    }
  };

  return (
    <s-stack direction="block" gap="small-200">
      <s-stack direction="inline" gap="small">
        <s-button variant="tertiary" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide build prompt" : "Show build prompt"}
        </s-button>
        <s-button variant="tertiary" onClick={copyPrompt}>
          Copy prompt
        </s-button>
        <s-button
          variant="tertiary"
          href={AI_SHOPIFY_BUILDER_URL}
          target="_blank"
        >
          Build it with AI Shopify Builder →
        </s-button>
      </s-stack>

      {expanded && (
        <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
          <s-paragraph>{buildPrompt}</s-paragraph>
        </s-box>
      )}

      <s-text tone="neutral">
        Paste this prompt into Claude, Cursor, or{" "}
        <s-link href={AI_SHOPIFY_BUILDER_URL} target="_blank">
          AI Shopify Builder
        </s-link>{" "}
        to build this feature yourself.
      </s-text>
    </s-stack>
  );
}

export default function Index() {
  const { hasApiKey, scan, requestedTitles, trends, benchmarks, recommendationStatuses } =
    useLoaderData<typeof loader>();
  const [showHandled, setShowHandled] = useState(false);
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

      {trends.length > 0 && (
        <s-section heading="Since your last scan">
          <s-stack direction="inline" gap="base">
            {trends.map((trend) => {
              const improved = trend.higherIsBetter
                ? trend.direction === "up"
                : trend.direction === "down";
              return (
                <s-badge key={trend.key} tone={improved ? "success" : "critical"}>
                  {trend.label}: {trend.delta > 0 ? "+" : ""}
                  {trend.delta} ({trend.previous} → {trend.current})
                </s-badge>
              );
            })}
          </s-stack>
        </s-section>
      )}

      {benchmarks.length > 0 && (
        <s-section heading="How you compare">
          <s-paragraph>
            Compared to {benchmarks[0].cohortSize} other stores of a similar
            size using AI Store Scanner:
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            {benchmarks.map((b) => {
              const better = b.storeValue <= b.cohortAverage;
              return (
                <s-badge key={b.key} tone={better ? "success" : "warning"}>
                  {b.label}: {b.storeValue}% (avg {b.cohortAverage}%)
                </s-badge>
              );
            })}
          </s-stack>
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

      {scan?.recommendations && scan.recommendations.length > 0 && (() => {
        const activeRecs = scan.recommendations.filter(
          (rec) => !recommendationStatuses[rec.title],
        );
        const handledRecs = scan.recommendations.filter(
          (rec) => recommendationStatuses[rec.title],
        );

        return (
          <>
            {activeRecs.length > 0 && (
              <s-section heading="Recommended features">
                <s-stack direction="block" gap="base">
                  {activeRecs.map((rec, index) => (
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
                        <s-stack direction="inline" gap="small">
                          <FeatureRequestButton
                            scanId={scan.id}
                            recommendation={rec}
                            alreadyRequested={requestedTitles.includes(rec.title)}
                          />
                          <RecommendationStatusControls
                            title={rec.title}
                            status={recommendationStatuses[rec.title]}
                          />
                        </s-stack>
                        <BuildPromptPanel buildPrompt={rec.buildPrompt} />
                      </s-stack>
                    </s-box>
                  ))}
                </s-stack>
              </s-section>
            )}

            {handledRecs.length > 0 && (
              <s-section heading="Handled recommendations">
                <s-button variant="tertiary" onClick={() => setShowHandled((v) => !v)}>
                  {showHandled
                    ? "Hide"
                    : `Show ${handledRecs.length} handled recommendation${handledRecs.length === 1 ? "" : "s"}`}
                </s-button>

                {showHandled && (
                  <s-stack direction="block" gap="base">
                    {handledRecs.map((rec) => (
                      <s-box
                        key={rec.title}
                        padding="base"
                        borderWidth="base"
                        borderRadius="base"
                        background="subdued"
                      >
                        <s-stack direction="block" gap="small">
                          <s-heading>{rec.title}</s-heading>
                          <s-paragraph>{rec.description}</s-paragraph>
                          <RecommendationStatusControls
                            title={rec.title}
                            status={recommendationStatuses[rec.title]}
                          />
                        </s-stack>
                      </s-box>
                    ))}
                  </s-stack>
                )}
              </s-section>
            )}
          </>
        );
      })()}

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
