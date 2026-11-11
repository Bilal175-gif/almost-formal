# Cloudflare Workers + Cloudinary preparation

Prepared on 12 November 2026. This branch contains configuration only; no Cloudflare Worker, DNS record, Cloudinary account setting, or production service has been changed.

## Architecture and compatibility

- **Frontend:** Next.js 16.4.5 can be built for Workers with `@opennextjs/cloudflare`. This repository uses OpenNext because it preserves the existing `next dev` and `next build` workflows. [Cloudflare currently recommends vinext by default](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), while [OpenNext supports Next.js 16](https://opennext.js.org/cloudflare). A successful build is a prerequisite, not proof that this application will fit Workers Free under real traffic.
- **Backend:** Keep Express on a persistent Node.js host. Prisma uses a local SQLite file; uploads use disk; the API also uses native image/password modules and SMTP. Workers' [filesystem is temporary and request-local](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/), and D1 needs a different database integration. No backend Worker or database migration is included.
- **Images:** The existing admin upload route optionally uses Cloudinary's server-side signed SDK when all three Cloudinary credentials are configured. Otherwise it continues writing local WebP files. Existing `/uploads` and `/images` URLs continue to work. New Cloudinary images are stored under `almost-formal/products` and delivered with `f_auto,q_auto` responsive URLs.
- **Traffic:** Browser → frontend Worker → HTTPS Node API. Browser API calls remain same-origin at `/api/*`; the Worker proxies them to `API_URL`. The Node API must be reachable from Cloudflare over public HTTPS. `127.0.0.1` works only for local development.

## Zero-to-staging order for almostformal.shop

1. Create/sign in to Cloudinary Free and copy the automatically assigned **Cloud name** from the dashboard. Find the API key and secret under **Settings → API Keys**; keep the secret out of chat and Git.
2. Put all three `CLOUDINARY_*` values in the Node API host's private environment and restart the API. Confirm a test admin upload appears in Cloudinary's Media Library. No unsigned upload preset is needed because the Node SDK signs uploads.
3. Create/sign in to Cloudflare Free. The first staging frontend can use `workers.dev` without changing `almostformal.shop` DNS. Expose the localhost API temporarily with a [Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) for a short test, or use a named Tunnel and `api-staging.almostformal.shop` after the domain is active on Cloudflare.
4. Build/deploy only `almost-formal-web-staging`, using the HTTPS tunnel origin as `API_URL` and the Cloudinary cloud name as `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`. Verify `/api/health`, products, admin upload, and a test COD order.
5. Before changing nameservers for `almostformal.shop`, copy all existing DNS records (including email MX/TXT records) into Cloudflare and check the current site's routing. Nameserver changes affect the whole domain. Keep production routing unchanged until a separate approved cutover.

A Quick Tunnel URL changes on restart and is only for temporary testing. A named Tunnel has a stable hostname but still depends on the laptop staying online. A production Node API needs persistent hosting for SQLite and historical uploads.

## 1. Cloudflare account and staging Worker

1. A staging Worker can use its `workers.dev` URL without a custom domain. For a stable staging API hostname through Cloudflare Tunnel, add your domain to Cloudflare in **Websites → Add a domain**, choose Free, and follow the displayed nameserver instructions at your registrar. Do not change the production website DNS record until staging is verified.
2. In **Workers & Pages**, note the account ID shown in the dashboard/account URL (or the account details panel). Create an account-scoped API token at **Profile → API Tokens → Create Token → Edit Cloudflare Workers**. Restrict it to this account. [Cloudflare's GitHub Actions guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) describes the token and account ID requirements.
3. The staging Worker name is `almost-formal-web-staging`; the production Worker name is `almost-formal-web`. They are declared in `apps/web/wrangler.jsonc`. No custom domain is configured in that file, so staging can be checked on its `workers.dev` URL first.
4. In the staging Worker dashboard, use **Settings → Variables and Secrets** for runtime values if needed. The frontend's `API_URL` rewrite is compiled at build time, so the same value must be present in the build environment. Set it to the public HTTPS Node API origin, for example `https://api-staging.example.com`, with no trailing `/api`. Set `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` to the Cloudinary cloud name at build time. Never put `CLOUDINARY_API_SECRET` in the frontend Worker.
5. The OpenNext config does not enable the optional Cloudflare Images binding or R2 cache. Cloudinary provides product image transformations. Static Next assets use immutable cache headers; `/api/*` responses use `private, no-store`.

## 2. Cloudinary account and Node API

1. Create a [Cloudinary Free](https://cloudinary.com/pricing) account. In the Cloudinary Console, find **Cloud name** in the Product Environment dashboard and **API key / API secret** at **Settings → API Keys**. [Cloudinary's credential guide](https://cloudinary.com/documentation/finding_your_credentials_tutorial) shows these locations.
2. On the **Node API host only**, set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in its secret environment. Set the public cloud name as `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` in the frontend build environment. The API secret must never be a `NEXT_PUBLIC_*` variable or a GitHub repository variable.
3. The admin upload remains authenticated and CSRF protected. It accepts one JPEG, PNG, or WebP under 5 MB, verifies that Sharp can decode it, limits pixels, converts to WebP, and signs the upload on the server. The database stores Cloudinary's HTTPS URL. Replacing or deleting a saved product schedules deletion of assets not referenced by products or historical orders. Unsaved uploads abandoned before a product is saved may need cleanup in the Cloudinary Media Library.
4. Existing local uploads are **not migrated**. Keep the Node host's `UPLOAD_DIR` and all existing files. Do not enable Cloudinary and remove the local directory until historical URLs have been separately migrated and checked.

### If the Node API currently runs only on localhost

The frontend Worker cannot reach `127.0.0.1` on your laptop. For **staging only**, keep the Node API running locally and create a remotely managed [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/get-started/) in **Networking → Tunnels → Create Tunnel**. Name it `almost-formal-staging-api`, install `cloudflared` using the dashboard's Ubuntu command on the machine running the API, then add a **Published application** route for `api-staging.almostformal.shop` to `http://localhost:4100` (or the actual `PORT`). Start the tunnel connector and check `https://api-staging.almostformal.shop/api/health` returns `service: almost-formal-api`. Use `https://api-staging.almostformal.shop` as `STAGING_API_URL` and `API_URL` when building the frontend. The laptop and connector must stay running for staging to work.

Do not use a temporary Quick Tunnel URL in the committed build: it changes when restarted. For production, move the Node API, SQLite database, and historical uploads together to a persistent Node host with HTTPS before cutting over the frontend.

## 3. Environment variables

The root `.env.example` preserves existing values and adds the new placeholders. Keep actual `.env`, `.env.local`, and `.dev.vars` files out of Git.

| Variable | Where | Purpose |
| --- | --- | --- |
| `API_URL` | Frontend build | Public HTTPS origin of the Node API; required for Worker builds |
| `NEXT_PUBLIC_API_URL` | Frontend build | Optional public mirror of the API origin; fallback for the rewrite |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Frontend build | Public Cloudinary cloud name for responsive image URLs |
| `CLOUDINARY_CLOUD_NAME` | Node API | Cloudinary account cloud name |
| `CLOUDINARY_API_KEY` | Node API secret | Signed upload API key |
| `CLOUDINARY_API_SECRET` | Node API secret | Signed upload/deletion secret; never client-side |
| `DATABASE_URL` | Node API secret/config | Persistent absolute SQLite URL on the Node host |
| `ALLOWED_ORIGINS` | Node API | Comma-separated exact staging and production frontend origins |
| `APP_ORIGIN` | Node API | Primary frontend origin, also used in order emails |
| `UPLOAD_DIR` | Node API | Persistent local upload directory for existing images/fallback |
| `PORT` | Node API | Local listening port behind the HTTPS reverse proxy |
| `SMTP_*` | Node API secrets/config | Existing order/contact email setup |

Keep `ALLOWED_ORIGINS` exact, for example `https://almost-formal-web-staging.<account>.workers.dev,https://shop.example.com`. The API accepts local development origins separately. `NEXT_PUBLIC_*` values are embedded in the browser bundle at build time.

## 4. Local validation and staging deployment commands

From the repository root:

```bash
npm ci
npm run db:generate
npm run typecheck
npm run lint
npm test
CF_WORKERS=1 API_URL=https://api-staging.example.com NEXT_PUBLIC_API_URL=https://api-staging.example.com NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name npm run cf:build -w @almost-formal/web
cd apps/web
npx wrangler deploy --dry-run --env staging
```

The last command validates the bundle and Wrangler config; it does not deploy. Replace example hostnames first. For a local Workers preview, return to the root and run `npm run cf:preview -w @almost-formal/web` with the same build variables; this may require Wrangler login but makes no production change.

**This checkout path contains an apostrophe (`Don't Open`).** OpenNext 1.20.16 currently generates invalid JavaScript for that path during its bundle step. For local Cloudflare builds, copy the current work (including uncommitted files) to a path without an apostrophe, then run the build commands there:

```bash
mkdir -p "$HOME/cloudflare-check/almost-formal"
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude '.next-dev-*' --exclude .open-next --exclude .env --exclude '.env.*.local' ./ "$HOME/cloudflare-check/almost-formal/"
cd "$HOME/cloudflare-check/almost-formal"
npm ci
```

GitHub Actions checks out into an apostrophe-free path. The regular Next.js build works in the current path. This path issue does not affect the existing Node/Vercel deployments. Keep the copied checkout free of real `.env` credentials.

When staging deployment is explicitly approved, authenticate with `npx wrangler login` locally or provide `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, then run:

```bash
CF_WORKERS=1 API_URL=https://api-staging.example.com NEXT_PUBLIC_API_URL=https://api-staging.example.com NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name npm run cf:deploy:staging -w @almost-formal/web
```

The **backend has no Workers deployment command**. On its persistent Node host, configure the environment and HTTPS reverse proxy, back up the SQLite database, and later run the existing backend commands:

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run build -w @almost-formal/api
NODE_ENV=production npm run start -w @almost-formal/api
```

The database migration above is a future operator step; this branch does not run it against production.

## 5. GitHub Actions

`.github/workflows/cloudflare-deploy.yml` is **manual only** (`workflow_dispatch`). Its default run validates the Node API and builds the frontend; it does not deploy. Selecting `deploy_staging=true` deploys only the staging frontend Worker. There is no production deployment job.

GitHub only displays/runs a `workflow_dispatch` workflow after its file exists on the repository's default branch. While this configuration is only on the feature branch, use the local Wrangler staging command in section 4. After the pull request is reviewed and merged, the workflow can be run on `main` with `deploy_staging=false` for validation, then `true` for a later staging deployment.

In GitHub **Settings → Secrets and variables → Actions**:

- Repository **secrets**: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (scoped Workers edit token).
- Repository **variables**: `STAGING_API_URL` (public HTTPS Node API origin), `STAGING_CLOUDINARY_CLOUD_NAME` (public cloud name).

Set Node API Cloudinary and SMTP secrets on the Node host, not in this frontend workflow. If using GitHub Environments, configure the `staging` environment and reviewers there before allowing staging deployment.

## 6. Custom domain, DNS, SSL, and production

After staging checks pass, add a staging subdomain in the staging Worker dashboard: **Workers & Pages → almost-formal-web-staging → Settings → Domains & Routes → Add → Custom Domain**. Cloudflare creates the DNS record and certificate for that hostname. [Cloudflare's custom domain guide](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) describes this flow. Keep the current production hostname and Node/Vercel setup unchanged during staging.

For a later approved production cutover, first set `API_URL` to the production HTTPS Node API and set the Cloudinary public name in the build environment. Build and preview. Then deploy manually from `apps/web` with `npx opennextjs-cloudflare deploy --env production` using those variables and Cloudflare credentials. Only after verification should the production custom domain be attached to `almost-formal-web`; record the old DNS/Worker routing first. Use Cloudflare's default SSL certificate and keep the Node API origin on valid HTTPS.

## 7. Staging verification checklist

- Worker build and `wrangler deploy --dry-run --env staging` complete within account limits.
- Open `/`, `/shop`, a product page, `/cart`, `/checkout`, and `/admin` on staging.
- `GET /api/health` through the Worker returns `service: almost-formal-api`, not another API.
- Product list, filters and image thumbnails load; old `/uploads/*` and new Cloudinary images both work.
- Sign in as admin, upload a test image, edit/remove a test product, and verify the Cloudinary Media Library state.
- Place one test COD order, confirm stock decreases once, review admin order status, and verify SMTP notifications.
- Confirm `Cache-Control: private, no-store` on API responses and immutable caching on `/_next/static/*`.
- Test on a phone-sized viewport and check console/network errors.
- Confirm the Node SQLite database and upload directory are backed up before any production cutover.

## 8. Rollback

If staging fails, stop using the staging Worker; the current Node/Vercel deployment is unchanged. For a later production cutover, use **Workers & Pages → Worker → Versions and Deployments → Rollback** or restore the recorded old DNS/custom-domain routing. Keep the Node API, database and old uploads running throughout the rollback window. Do not delete Cloudinary assets or local uploads as part of a frontend rollback. If a product image was replaced, restore its previous URL from the product record or backup before deleting any asset.

## 9. Free-plan constraints and remaining blockers

- [Workers Free](https://developers.cloudflare.com/workers/platform/limits/) currently lists 100,000 requests/day, 10 ms CPU per invocation, and 128 MB memory. A Next.js Worker may exceed a Free limit under real SSR traffic even if it builds; validate on staging.
- [Cloudinary Free](https://cloudinary.com/pricing) currently includes 25 monthly credits for transformation, storage and bandwidth. Track usage; it is not unlimited hosting.
- No production API URL, Cloudflare account, domain, Cloudinary account credentials, or live test environment was supplied. No deployment or live Cloudinary upload has been verified.
- The current SQLite database and local uploads block a safe backend move to Workers. Moving the API later would require a separate database/storage/authentication design and a planned data migration.
