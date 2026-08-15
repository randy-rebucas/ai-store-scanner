# Deploying to Vercel

This app is configured to deploy on [Vercel](https://vercel.com) using the `@vercel/react-router` preset. This guide walks through taking it from a local dev store app to a production deployment.

Reference: [Vercel's Shopify app deployment guide](https://vercel.com/kb/guide/deploy-shopify-app-to-vercel).

## What's already set up in this repo

- `react-router.config.ts` — enables `vercelPreset()` so React Router builds a Vercel-compatible output with zero extra config (no `vercel.json` or `Dockerfile` needed).
- `app/utils/app-url.ts` — resolves the app's public URL at runtime: uses `SHOPIFY_APP_URL` if set, otherwise falls back to Vercel's auto-injected `VERCEL_PROJECT_PRODUCTION_URL`, otherwise `localhost:3000` for local dev. Used by both `app/shopify.server.ts` and `vite.config.ts`.
- `prisma/schema.prisma` — datasource is `postgresql` via `DATABASE_URL`. Vercel's serverless functions have an ephemeral filesystem, so the template's default SQLite database will not persist between requests/deploys.
- `package.json` `build` script — runs `prisma generate` before `react-router build`, so the Prisma client is always regenerated against the schema at build time.
- `.env.example` — documents every environment variable this app needs.

## One-time setup

### 1. Log in and link the project

```shell
vercel login
vercel link
```

Follow the prompts to link this directory to a (new or existing) Vercel project.

### 2. Provision a Postgres database

Use Vercel's Marketplace integration (recommended) or bring your own Postgres provider:

```shell
vercel install prisma
```

This provisions a database and automatically adds a `DATABASE_URL` environment variable to your Vercel project. If you use a different provider, add `DATABASE_URL` manually via `vercel env add`.

### 3. Add Shopify environment variables

Get the current values from the Shopify CLI:

```shell
shopify app env show
```

Then add each to Vercel:

```shell
vercel env add SHOPIFY_API_KEY
vercel env add SHOPIFY_API_SECRET
vercel env add SCOPES
```

`SCOPES` should be the comma-separated list from `shopify.app.toml`'s `[access_scopes]` block (currently `read_products,read_orders,read_customers,read_themes,read_discounts,read_content`).

Optional, depending on what you use:

```shell
vercel env add ANTHROPIC_API_KEY          # fallback if a shop hasn't set its own key in Settings
vercel env add ADMIN_NOTIFICATION_EMAIL   # default notification recipient
```

Do **not** set `SHOPIFY_APP_URL` manually unless you're using a custom domain — leaving it unset lets `app-url.ts` auto-detect the Vercel production URL.

### 4. Create the initial Postgres migration

Locally, point `DATABASE_URL` at the new Postgres instance (pull it from Vercel) and generate the first migration:

```shell
vercel env pull .env.local
npx prisma migrate dev --name init
```

This creates `prisma/migrations/` against Postgres. Commit the generated migration files — `vercel-build`/`npm run setup` uses `prisma migrate deploy`, which only applies committed migrations, it does not generate new ones.

## Deploying

```shell
vercel deploy --prod
```

Vercel builds with `npm run build` (`prisma generate && react-router build`) and serves the app — no `vercel.json` is required.

## Pointing Shopify at the deployed app

After the first successful deploy, note the production URL (e.g. `https://ai-store-scanner.vercel.app` or your custom domain), then update `shopify.app.toml`:

```toml
application_url = "https://<your-vercel-url>"

[auth]
redirect_urls = [ "https://<your-vercel-url>/auth/callback" ]
```

Push the config to Shopify and reinstall on your dev store to verify the OAuth flow:

```shell
shopify app deploy
```

Then reinstall the app on a development store and confirm login/auth completes successfully.

## Ongoing deploys

Once linked, `vercel deploy --prod` (or a Git integration pushing to your production branch) redeploys the app. Database migrations are **not** applied automatically — run `prisma migrate deploy` against the production `DATABASE_URL` as part of your release process whenever `prisma/migrations/` changes.

## Troubleshooting

- **OAuth redirect fails / "invalid redirect_uri"** — `application_url` and `redirect_urls` in `shopify.app.toml` must exactly match the Vercel production URL (protocol + host, no trailing slash mismatch), and must be redeployed with `shopify app deploy`.
- **"Prisma Client could not locate the Query Engine"** — make sure `prisma generate` is running as part of the build (already wired into `npm run build`); if you changed the build command in the Vercel project settings, restore it to `npm run build`.
- **Data disappears between requests** — this means `DATABASE_URL` isn't set or still points at SQLite; check `vercel env ls` and confirm `prisma/schema.prisma` uses `provider = "postgresql"`.
