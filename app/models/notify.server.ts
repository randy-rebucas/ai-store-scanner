import nodemailer from "nodemailer";
import { getShopSettings } from "./settings.server";

// Default app-builder inbox. Any shop can override the recipient via
// Settings > Feature request notifications.
const DEFAULT_ADMIN_NOTIFICATION_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL || "admin@localpro.asia";

type FeatureRequestNotification = {
  shop: string;
  title: string;
  description: string;
  impactLabel: string;
  storeOwnerEmail: string | null;
};

export async function notifyFeatureRequested(
  notification: FeatureRequestNotification,
) {
  const settings = await getShopSettings(notification.shop);
  const adminEmail =
    settings?.adminNotificationEmail || DEFAULT_ADMIN_NOTIFICATION_EMAIL;

  await Promise.allSettled([
    sendEmailNotification(adminEmail, notification),
    settings?.slackWebhookUrl
      ? sendSlackNotification(settings.slackWebhookUrl, notification)
      : Promise.resolve(),
  ]);
}

async function sendSlackNotification(
  webhookUrl: string,
  notification: FeatureRequestNotification,
) {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🛠️ New feature request from *${notification.shop}*\n*${notification.title}* (${notification.impactLabel})\n${notification.description}`,
      }),
    });
  } catch (error) {
    console.error("Failed to send Slack notification", error);
  }
}

function getSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: Number(port),
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === "true"
      : Number(port) === 465,
    auth: { user, pass },
  });
}

async function sendEmailNotification(
  to: string,
  notification: FeatureRequestNotification,
) {
  const transport = getSmtpTransport();
  if (!transport) {
    console.warn(
      "SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS not fully set; skipping email notification",
    );
    return;
  }

  // Prefer the store owner's email as the visible sender so the notification
  // reads as coming from that merchant; fall back to a fixed sender if the
  // shop query didn't return one.
  const fromEmail =
    notification.storeOwnerEmail ||
    process.env.NOTIFICATION_FROM_EMAIL ||
    process.env.SMTP_USER;

  try {
    await transport.sendMail({
      from: `"${escapeHtml(notification.shop)}" <${fromEmail}>`,
      replyTo: notification.storeOwnerEmail || undefined,
      to,
      subject: `New feature request: ${notification.title} (${notification.shop})`,
      html: `<p>A merchant clicked &ldquo;Build this feature&rdquo; on an AI Store Scanner audit.</p>
<ul>
  <li><strong>Shop:</strong> ${escapeHtml(notification.shop)}</li>
  <li><strong>Store owner email:</strong> ${escapeHtml(notification.storeOwnerEmail || "unknown")}</li>
  <li><strong>Feature:</strong> ${escapeHtml(notification.title)}</li>
  <li><strong>Impact:</strong> ${escapeHtml(notification.impactLabel)}</li>
  <li><strong>Requested at:</strong> ${new Date().toLocaleString()}</li>
</ul>
<p><strong>Description:</strong><br />${escapeHtml(notification.description)}</p>`,
    });
  } catch (error) {
    console.error("Failed to send email notification", error);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
