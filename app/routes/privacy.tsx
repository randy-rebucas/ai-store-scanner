export default function Privacy() {
  return (
    <div style={{ maxWidth: "40rem", margin: "0 auto", padding: "3rem 1.5rem", fontFamily: "sans-serif", lineHeight: 1.6 }}>
      <h1>Privacy Policy</h1>
      <p>Last updated: {new Date().toISOString().slice(0, 10)}</p>

      <h2>What we collect</h2>
      <ul>
        <li>Your shop&apos;s domain and basic shop info (name, currency, plan) via the Shopify Admin API.</li>
        <li>Aggregate store counts used for analysis: number of products, collections, orders, customers, and discounts. We do not read individual customer records, order line items, or any customer PII.</li>
        <li>The Anthropic API key and AI model you configure in Settings (stored encrypted).</li>
        <li>Feature requests you submit from a scan (title, description, impact label, status).</li>
        <li>Optional Slack webhook URL and notification email override you configure in Settings.</li>
        <li>Your subscription plan and billing status, provided to us by Shopify via the Billing API. We never see or store your payment card details &mdash; all billing is handled directly by Shopify.</li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Store counts are sent to Anthropic (the maker of Claude) to generate feature
        recommendations for your store. Your Anthropic API key is used only to make that
        request on your behalf and is never shared with any other shop. When you request a
        feature, a notification email (and optional Slack message) is sent so the app
        builder can follow up. Your subscription plan is used to determine your monthly
        scan allowance.
      </p>

      <h2>Third parties</h2>
      <p>
        We share store-count data with{" "}
        <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noreferrer">
          Anthropic
        </a>{" "}
        to generate recommendations, use an SMTP provider to deliver notification
        emails, and use Shopify&apos;s Billing API to process subscription charges. We do
        not sell or share your data for advertising.
      </p>

      <h2>Data retention and deletion</h2>
      <p>
        All data associated with your shop (settings, scan history, feature requests, and
        session data) is deleted automatically when you uninstall the app. We also honor
        Shopify&apos;s mandatory GDPR webhooks (customer data requests, customer redaction,
        and shop redaction).
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy? Reach us on{" "}
        <a href="https://www.facebook.com/DevComDMS" target="_blank" rel="noreferrer">
          Facebook
        </a>
        .
      </p>

      <h2>Related</h2>
      <p>
        See also our <a href="/terms">Terms of Service</a>.
      </p>
    </div>
  );
}
