# Almost Formal — LIVE CUTOVER: Render + Neon → Cloudflare Worker + D1

Branch: `cloudflare-backend` (work copy `~/workspace/almost-formal-cloudflare/`).
This branch is **code-complete, not yet live**. Nothing here has been
deployed, and the live shop still runs on Render + Neon. Read this
whole file before touching any dashboard.

## What changes

| Piece | Before (live now) | After (this branch) |
|---|---|---|
| Frontend | Cloudflare Worker (OpenNext) → Render API | Cloudflare Worker (OpenNext) → API Worker |
| Backend | Express 5 on Render Free | Hono on Cloudflare Workers |
| Database | Neon PostgreSQL (29 live products) | Cloudflare D1 `almost-formal-db` (starts **empty**) |
| Images | Cloudinary (`dmwgexmef`) | Cloudinary (`dmwgexmef`) — unchanged |
| Auth hashing | argon2 | PBKDF2 (WebCrypto) — **admin password MUST be reset** |
| Email | Resend HTTPS on Render (SMTP disabled) | Resend HTTPS on Workers (SMTP gone) |
| Keep-alive cron | GitHub `keep-api-awake.yml` every 10 min | Deleted — Workers don't sleep |

The old Express code is preserved in `apps/api/src/express-legacy/`
and the Render config (`render.yaml`, `docs/RENDER_FREE_SETUP.md`)
is untouched, so rollback is a frontend re-point, not a rebuild.

## Live-deploy readiness

- [x] Code ported (Hono + Prisma adapter-d1, D1 batch orders,
      PBKDF2 auth, Cloudinary signed-fetch uploads, Resend email,
      product-filters + inStock, health `service` field, public
      cache, ALLOWED_ORIGINS CORS, security headers, D1 UNIQUE→409
      mapping).
- [x] Local D1 test suite: `npm test` — 11/11 pass (see "Test log"
      in the handover report). Live-HTTP verified over
      `wrangler dev --local`: health, catalogue, filters, admin
      login (PBKDF2 test admin), COD order + idempotent replay,
      cancel/restore exactly once, CSRF 403, evil-origin 403,
      `/uploads` 410, upload-without-secrets 503.
- [x] **Data migration file ready — no Neon export needed.**
      `d1-import-live-products.sql` was generated from the live
      Render API backup
      (`~/workspace/almost-formal-live-backup-2026-11-19/`) with
      `scripts/migrate-neon-to-d1/03-json-to-d1.mjs` and dry-run
      verified against a fresh SQLite DB with the migrations
      applied: **29 products, 29 images, 29 product-category links,
      6 categories, 1 settings row; 0 archived, 0 orphans, 0
      non-Cloudinary images.** NOTE: orders/customers from Neon are
      NOT in this file (the backup captured catalogue only) — order
      history stays on Neon/Render until/unless a full export runs.
- [ ] **BLOCKED — Cloudflare account/token:** no `CLOUDFLARE_API_TOKEN`
      / account access on this machine, no `wrangler login`. Nothing
      remote (D1 state, deploy, secrets) could be verified.
- [ ] **BLOCKED — D1 remote state:** `almost-formal-db`
      (`24bd6c7d-0cf3-408d-bd98-516d96018170`) was claimed created
      2026-11-09 with 0 tables; unverified. Needs
      `wrangler d1 info almost-formal-db` after login.
- [ ] **BLOCKED — Cloudinary secrets:** no `CLOUDINARY_API_KEY` /
      `CLOUDINARY_API_SECRET` here. Live upload test is unverified;
      the signing path was exercised with dummy values only and the
      request to api.cloudinary.com timed out after 30s from this
      VM (proxy) — needs a real-key test at cutover.
- [ ] **BLOCKED — Admin password reset:** argon2 hashes can't verify
      on Workers. Reset on remote D1 at cutover (step 6).
- [ ] **BLOCKED — Frontend re-point:** GitHub var
      `PRODUCTION_API_URL` must be set to the live API Worker origin
      before the frontend workflow runs.

**Do not stop, delete, or scale down Render until step 9 verifies
green and the shop has run on the Worker for at least a day.**
(Render is UP as of 19 Nov — health 200 after a ~38s cold start —
so the rollback target is healthy. The earlier 15s timeout was
just the Free-tier cold start, not an outage.)

## Cutover steps (in order)

### 1. Cloudflare access (Bilal)
- Sign in at dash.cloudflare.com (Google sign-in). If the CLI is
  used: `wrangler login` on Bilal's laptop, or create an API token
  at Profile → API Tokens → Create Token → **Edit Cloudflare
  Workers** (account scope) and set it as the GitHub secret
  `CLOUDFLARE_API_TOKEN` plus `CLOUDFLARE_ACCOUNT_ID` (from the
  dashboard URL / account details) as a GitHub secret.
- Verify: `wrangler d1 info almost-formal-db` shows the database.
  If it does not exist, create it:
  `wrangler d1 create almost-formal-db` and update the
  `database_id` in `apps/api/wrangler.toml` + this file.

### 2. D1 migrations (remote)
```bash
cd apps/api
wrangler d1 execute almost-formal-db --remote --file=prisma/migrations/20261014214532_init/migration.sql
wrangler d1 execute almost-formal-db --remote --file=prisma/migrations/20261109150000_update_announcement/migration.sql
```
If D1 rejects a whole file, split it into single statements first
(the splitter in `scripts/smoke-d1.mts` shows how).

### 3. Data: live backup JSON → D1 (DONE — file ready, not yet applied)
The catalogue import is already built and dry-run verified:
`d1-import-live-products.sql`, generated by
`scripts/migrate-neon-to-d1/03-json-to-d1.mjs` from the live backup
in `~/workspace/almost-formal-live-backup-2026-11-19/`
(`products-all.json`, `categories.json`, `settings.json`).
Regenerate any time with:
```bash
node scripts/migrate-neon-to-d1/03-json-to-d1.mjs \
  ~/workspace/almost-formal-live-backup-2026-11-19 \
  ./d1-import-live-products.sql
```
Verified counts (fresh SQLite + migrations): **29 products, 29
images, 29 product-category links, 6 categories, 1 settings row;
0 archived, 0 orphans, 0 non-Cloudinary images; all Rs 120,000,
stock 1; stray "Tie" included.** Neon cuid IDs and dates kept
verbatim. Apply to remote D1 only after step 2:
```bash
wrangler d1 execute almost-formal-db --remote --file=d1-import-live-products.sql
```
Then verify counts with the queries in step 3b below.
**Limitation:** this file carries catalogue only — no orders,
customers, inventory movements, or audit logs (the backup captured
the catalogue, not Neon tables). Order history stays on Neon/Render
until/unless a full export runs (the CSV path in
`scripts/migrate-neon-to-d1/README.md` covers that if ever needed).

### 3b. Verify counts on remote D1
```bash
wrangler d1 execute almost-formal-db --remote --command="SELECT 'Product', COUNT(*) FROM \"Product\" UNION ALL SELECT 'ProductImage', COUNT(*) FROM \"ProductImage\" UNION ALL SELECT 'Category', COUNT(*) FROM \"Category\" UNION ALL SELECT 'StoreSettings', COUNT(*) FROM \"StoreSettings\";"
```
Expected: **Product 29, ProductImage 29, Category 6,
StoreSettings 1.** If counts differ, STOP — do not cut over;
re-check the backup and re-generate the file. Also confirm no
`/uploads/` image URLs survived (there were none in the backup):
```bash
wrangler d1 execute almost-formal-db --remote --command="SELECT COUNT(*) FROM \"ProductImage\" WHERE url LIKE '/uploads/%';"
# expect 0
```

### 4. Worker secrets (Cloudflare dashboard → Workers & Pages →
### almost-formal-api → Settings → Variables and Secrets, or CLI)
```bash
wrangler secret put CLOUDINARY_API_KEY
wrangler secret put CLOUDINARY_API_SECRET
wrangler secret put RESEND_API_KEY        # optional; email off without it
```
Cloudinary values: Cloudinary Console → Settings → API Keys (cloud
name is already `dmwgexmef` in `wrangler.toml` vars). Resend key:
resend.com → API Keys; `EMAIL_FROM` must be a **verified**
Resend sender/domain — set it in `wrangler.toml` vars first if the
default is empty. Never paste any of these in chat or git.

### 5. Deploy the API Worker
```bash
# from repo root, branch cloudflare-backend merged/pushed first
npx wrangler deploy --env production   # from apps/api, or:
# GitHub: Actions → "Deploy live API Worker to Cloudflare" → Run workflow
```
Note the printed Worker URL, e.g.
`https://almost-formal-api.<subdomain>.workers.dev`.

### 6. Admin reset + init (remote D1)
```bash
ADMIN_EMAIL=<admin email> ADMIN_PASSWORD='<new 12+ char password>' npx tsx scripts/admin-reset-d1.ts --remote
npx tsx scripts/worker-init-d1.ts --remote
```
The old admin password **will not work** — it is an argon2 hash.
Tell Bilal the new password out-of-band; never in chat/git.

### 7. Verify the live API (before touching the frontend)
```bash
curl https://<api-worker>/api/health
# expect: {"ok":true,"service":"almost-formal-api"}
curl https://<api-worker>/api/products | head -c 400
# expect: 29 products, total 29
curl https://<api-worker>/api/product-filters
```
Then in a browser: sign in as admin on the Worker URL directly,
upload one test image to Cloudinary, place one test COD order,
cancel it, confirm stock restores exactly once.

### 8. Re-point the frontend
- GitHub repo → Settings → Secrets and variables → Actions →
  Variables → set `PRODUCTION_API_URL` to the API Worker origin
  from step 5 (no trailing slash, no `/api`).
- Actions → "Deploy live website to Cloudflare" → Run workflow.
  It health-checks the API first and fails fast if the Worker is down.
- Verify: `https://almostformal.shop/` lists 29 products,
  `/api/health` through the shop returns the Worker service,
  one product page, cart, checkout, and `/admin` all work.

### 9. Monitor (24h minimum, Render still live)
- `wrangler tail almost-formal-api` for errors; check D1 usage
  and Cloudinary usage in their dashboards.
- If anything fails: rollback is step 10 — Render is untouched.

### 10. Rollback (any time before Render is removed)
- GitHub var `PRODUCTION_API_URL` → back to
  `https://almost-formal-5qy4.onrender.com`, re-run "Deploy live
  website to Cloudflare". The shop is back on Render in minutes.
  (Or temporarily: nothing — Render was never stopped.)
- Only delete the Render service / Neon project after the Worker
  has served the live shop correctly for several days AND a fresh
  D1 backup exists. That deletion is a separate, explicit decision.

## Known limitations (do not paper over these)

- D1 starts empty: until step 3 runs, the shop shows **0 products**.
- Legacy `/uploads/*` images answer **410 Gone** on the Worker.
- No SMTP anywhere; email needs a verified Resend sender.
- Rate limiting and the public catalogue cache are per-isolate
  in-memory (same limits, not shared across isolates); add
  Cloudflare WAF rate-limiting rules for production hardening.
- D1 has no interactive transactions: multi-row writes use
  `d1.batch()` with compensating restores (see
  `apps/api/src/orders.ts` header). Concurrent identical checkouts
  are handled by the idempotency replay, not by a lock.
- Free-plan limits apply on both sides (Workers 100k req/day,
  10 ms CPU/invocation, 128 MB; D1 5 GB storage, 100k rows read/day
  on Free at time of writing — verify current limits in the
  Cloudflare dashboard before relying on them).

## Secrets inventory (where each comes from)

| Secret / var | Where to get it | Where it goes |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare Profile → API Tokens → Edit Cloudflare Workers | GitHub secret (frontend + API workflows) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard URL / account details | GitHub secret |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary Console → Settings → API Keys | `wrangler secret put` (API Worker) |
| `RESEND_API_KEY` | resend.com → API Keys | `wrangler secret put` (optional) |
| `EMAIL_FROM` | A verified Resend sender/domain | `wrangler.toml` [vars] |
| Neon `DATABASE_URL` | Neon dashboard → project → connection string | Local env only, for the one-off export |
| New admin password | Chosen at cutover | `admin-reset-d1.ts --remote`, told out-of-band |
