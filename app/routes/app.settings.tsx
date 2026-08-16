import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getShopSettings, upsertShopSettings } from "../models/settings.server";
import { AI_MODELS } from "../models/ai-models";
import { BILLING_ENFORCED, getActivePlan } from "../models/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const settings = await getShopSettings(session.shop);
  const activePlan = await getActivePlan(billing);

  return {
    activePlan,
    billingEnforced: BILLING_ENFORCED,
    aiModel: settings?.aiModel || "claude-sonnet-5",
    hasApiKey: Boolean(settings?.anthropicApiKey),
    maskedApiKey: settings?.anthropicApiKey
      ? `sk-ant-...${settings.anthropicApiKey.slice(-4)}`
      : null,
    slackWebhookUrl: settings?.slackWebhookUrl || "",
    adminNotificationEmail: settings?.adminNotificationEmail || "",
    weeklyDigestEnabled: settings?.weeklyDigestEnabled ?? true,
    defaultAdminNotificationEmail:
      process.env.ADMIN_NOTIFICATION_EMAIL || "admin@localpro.asia",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "clear-key") {
    await upsertShopSettings(session.shop, { anthropicApiKey: null });
    return { ok: true, cleared: true };
  }

  const apiKey = formData.get("anthropicApiKey");
  const aiModel = formData.get("aiModel");
  const slackWebhookUrl = formData.get("slackWebhookUrl");
  const adminNotificationEmail = formData.get("adminNotificationEmail");
  const weeklyDigestEnabled = formData.get("weeklyDigestEnabled") === "true";

  const data: {
    anthropicApiKey?: string;
    aiModel?: string;
    slackWebhookUrl?: string | null;
    adminNotificationEmail?: string | null;
    weeklyDigestEnabled?: boolean;
  } = {
    aiModel: typeof aiModel === "string" && aiModel ? aiModel : undefined,
    slackWebhookUrl:
      typeof slackWebhookUrl === "string" && slackWebhookUrl.trim()
        ? slackWebhookUrl.trim()
        : null,
    adminNotificationEmail:
      typeof adminNotificationEmail === "string" &&
      adminNotificationEmail.trim()
        ? adminNotificationEmail.trim()
        : null,
    weeklyDigestEnabled,
  };

  if (typeof apiKey === "string" && apiKey.trim().length > 0) {
    data.anthropicApiKey = apiKey.trim();
  }

  await upsertShopSettings(session.shop, data);

  return { ok: true };
};

export default function Settings() {
  const {
    activePlan,
    billingEnforced,
    aiModel,
    hasApiKey,
    maskedApiKey,
    slackWebhookUrl,
    adminNotificationEmail,
    weeklyDigestEnabled,
    defaultAdminNotificationEmail,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(aiModel);
  const [slackWebhookInput, setSlackWebhookInput] = useState(slackWebhookUrl);
  const [adminEmailInput, setAdminEmailInput] = useState(
    adminNotificationEmail,
  );
  const [digestEnabled, setDigestEnabled] = useState(weeklyDigestEnabled);

  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.ok && fetcher.state === "idle") {
      shopify.toast.show(
        fetcher.data.cleared ? "API key removed" : "Settings saved",
      );
      setApiKeyInput("");
    }
  }, [fetcher.data, fetcher.state, shopify]);

  const saveSettings = () => {
    fetcher.submit(
      {
        anthropicApiKey: apiKeyInput,
        aiModel: selectedModel,
        slackWebhookUrl: slackWebhookInput,
        adminNotificationEmail: adminEmailInput,
        weeklyDigestEnabled: String(digestEnabled),
      },
      { method: "POST" },
    );
  };

  const clearKey = () => {
    fetcher.submit({ intent: "clear-key" }, { method: "POST" });
  };

  return (
    <s-page heading="Settings">
      <s-section heading="Anthropic API key">
        <s-paragraph>
          The AI Store Scanner uses Claude to analyze your store and generate
          feature recommendations. Provide your own Anthropic API key, or
          leave this blank to use the app&apos;s default key (if available).
          Get a key at{" "}
          <s-link href="https://console.anthropic.com/settings/keys" target="_blank">
            console.anthropic.com
          </s-link>
          .
        </s-paragraph>

        <s-stack direction="block" gap="base">
          {hasApiKey && (
            <s-paragraph>
              <s-text>Current key: </s-text>
              <s-text tone="neutral">{maskedApiKey}</s-text>
            </s-paragraph>
          )}

          <s-text-field
            name="anthropicApiKey"
            label="Anthropic API key"
            placeholder={hasApiKey ? "Enter a new key to replace it" : "sk-ant-..."}
            value={apiKeyInput}
            onChange={(event: Event) =>
              setApiKeyInput((event.target as HTMLInputElement).value)
            }
          />

          <s-select
            name="aiModel"
            label="AI model"
            value={selectedModel}
            onChange={(event: Event) =>
              setSelectedModel((event.target as HTMLSelectElement).value)
            }
          >
            {AI_MODELS.map((model) => (
              <s-option key={model.value} value={model.value}>
                {model.label}
              </s-option>
            ))}
          </s-select>
        </s-stack>
      </s-section>

      <s-section heading="Feature request notifications">
        <s-paragraph>
          Whenever a merchant clicks &ldquo;Build this feature&rdquo; on a
          scan recommendation, a full report is emailed automatically to{" "}
          <s-text tone="neutral">
            {adminNotificationEmail || defaultAdminNotificationEmail}
          </s-text>
          . Override that address below, or add a Slack webhook as a second
          channel.
        </s-paragraph>

        <s-stack direction="block" gap="base">
          <s-text-field
            name="adminNotificationEmail"
            label="Admin notification email override"
            placeholder={defaultAdminNotificationEmail}
            value={adminEmailInput}
            onChange={(event: Event) =>
              setAdminEmailInput((event.target as HTMLInputElement).value)
            }
          />

          <s-text-field
            name="slackWebhookUrl"
            label="Slack webhook URL (optional)"
            placeholder="https://hooks.slack.com/services/..."
            value={slackWebhookInput}
            onChange={(event: Event) =>
              setSlackWebhookInput((event.target as HTMLInputElement).value)
            }
          />
        </s-stack>
      </s-section>

      <s-section heading="Weekly digest">
        <s-paragraph>
          When enabled, we run a scan automatically once a week and email you
          a summary of what changed and the top new recommendations &mdash;
          no need to open the app.
        </s-paragraph>
        <s-switch
          name="weeklyDigestEnabled"
          label="Enable weekly digest"
          checked={digestEnabled}
          onChange={(event: Event) =>
            setDigestEnabled((event.target as HTMLInputElement).checked)
          }
        />
      </s-section>

      <s-section>
        <s-stack direction="inline" gap="base">
          <s-button
            variant="primary"
            onClick={saveSettings}
            {...(isSaving ? { loading: true } : {})}
          >
            Save settings
          </s-button>
          {hasApiKey && (
            <s-button variant="tertiary" tone="critical" onClick={clearKey}>
              Remove API key
            </s-button>
          )}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Plan">
        <s-paragraph>
          Current plan:{" "}
          <s-text tone="neutral">
            {activePlan || (billingEnforced ? "None" : "None (billing disabled outside production)")}
          </s-text>
        </s-paragraph>
        <s-link href="/app/plans">Manage plan</s-link>
      </s-section>

      <s-section slot="aside" heading="About">
        <s-paragraph>
          Your API key is stored securely and is only used server-side to
          call the Anthropic API on behalf of this store. It is never exposed
          to the browser.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Email delivery">
        <s-paragraph>
          Emails send over SMTP using{" "}
          <s-text tone="neutral">SMTP_HOST</s-text>,{" "}
          <s-text tone="neutral">SMTP_PORT</s-text>,{" "}
          <s-text tone="neutral">SMTP_USER</s-text>, and{" "}
          <s-text tone="neutral">SMTP_PASS</s-text> set in the app&apos;s
          environment. The sender address is this store&apos;s owner email
          when available, otherwise{" "}
          <s-text tone="neutral">NOTIFICATION_FROM_EMAIL</s-text> or{" "}
          <s-text tone="neutral">SMTP_USER</s-text>.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Support">
        <s-paragraph>
          Questions or feedback about AI Store Scanner? Reach us on{" "}
          <s-link
            href="https://www.facebook.com/DevComDMS"
            target="_blank"
          >
            Facebook
          </s-link>
          . Read our{" "}
          <s-link href="/privacy" target="_blank">
            privacy policy
          </s-link>{" "}
          and{" "}
          <s-link href="/terms" target="_blank">
            terms of service
          </s-link>
          .
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
