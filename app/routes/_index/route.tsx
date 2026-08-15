import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import {
  AppProvider,
  Page,
  Card,
  BlockStack,
  InlineStack,
  Box,
  Text,
  Badge,
  TextField,
  Button,
  Icon,
  Link,
} from "@shopify/polaris";
import {
  ChartVerticalIcon,
  MagicIcon,
  KeyIcon,
} from "@shopify/polaris-icons";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import polarisTranslations from "@shopify/polaris/locales/en.json";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

const FEATURES = [
  {
    icon: ChartVerticalIcon,
    title: "Full store audit",
    body: "Products, collections, orders, customers, and discounts analyzed in one pass.",
  },
  {
    icon: MagicIcon,
    title: "AI-ranked recommendations",
    body: "Features scored by revenue, retention, and AOV impact — not generic advice.",
  },
  {
    icon: KeyIcon,
    title: "Your own API key",
    body: "Bring your Anthropic key and choose the model, right from settings.",
  },
];

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <AppProvider i18n={polarisTranslations}>
      <div className={styles.index}>
        <div className={styles.content}>
          <Page narrowWidth>
            <BlockStack gap="800" inlineAlign="center">
              <BlockStack gap="400" inlineAlign="center">
                <Badge tone="success">AI Store Scanner</Badge>
                <Text
                  as="h1"
                  variant="heading2xl"
                  alignment="center"
                  fontWeight="bold"
                >
                  Know exactly what to build next for your store
                </Text>
                <Box maxWidth="34rem">
                  <Text as="p" variant="bodyLg" tone="subdued" alignment="center">
                    Connect your store and let Claude analyze your products,
                    orders, customers, and discounts &mdash; then get ranked,
                    actionable feature recommendations built for your data.
                  </Text>
                </Box>
              </BlockStack>

              {showForm && (
                <Card padding="500">
                  <Form method="post" action="/auth/login">
                    <BlockStack gap="300">
                      <InlineStack
                        gap="300"
                        blockAlign="end"
                        wrap={false}
                      >
                        <Box minWidth="20rem">
                          <TextField
                            label="Shop domain"
                            name="shop"
                            autoComplete="off"
                            placeholder="my-shop-domain.myshopify.com"
                          />
                        </Box>
                        <Button submit variant="primary" size="large">
                          Connect store
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Form>
                </Card>
              )}

              <InlineStack gap="400" wrap align="center">
                {FEATURES.map((feature) => (
                  <Box key={feature.title} width="17rem">
                    <Card padding="400">
                      <BlockStack gap="200">
                        <Box>
                          <Icon source={feature.icon} tone="success" />
                        </Box>
                        <Text as="h2" variant="headingSm">
                          {feature.title}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {feature.body}
                        </Text>
                      </BlockStack>
                    </Card>
                  </Box>
                ))}
              </InlineStack>

              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                Questions? Reach us on{" "}
                <Link
                  url="https://www.facebook.com/DevComDMS"
                  target="_blank"
                >
                  Facebook
                </Link>
                . Read our{" "}
                <Link url="/privacy" target="_blank">
                  privacy policy
                </Link>
                .
              </Text>
            </BlockStack>
          </Page>
        </div>
      </div>
    </AppProvider>
  );
}
