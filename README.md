# Almost Formal

A reference-led vintage thrift store built with Next.js App Router, React, TypeScript, Tailwind CSS, Motion, Lucide, Zustand, TanStack Query and React Hook Form. A separate Express API uses Zod, Prisma and persistent SQLite storage.

## Run locally

Requires Node.js 22 and npm. From this directory:

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

The dev runner automatically picks the next free web port when 3000 is already in use, so `npm run dev` keeps working without manual cleanup. If you want to force a specific port, set `WEB_PORT=3100` and it will also update `APP_ORIGIN` for the API. Open the chosen URL shown in the terminal, usually **http://localhost:3000** or the next available port. The API listens on `127.0.0.1:4000`; Next.js proxies `/api` and `/uploads`. The seeded catalogue is explicitly demo content. Seeding is idempotent and does not reset existing stock.

For the defaults, no environment file is needed at runtime: the API defaults to `file:./dev.db` relative to its Prisma schema. Prisma CLI commands require `DATABASE_URL`, supplied by `.env`. If using a custom database, prefer an absolute `file:/absolute/path/store.db` URL and export it to both processes. Root `npm run dev` and `npm start` load the root `.env` through the dotenv preload configured in the scripts.

## Administrator access

There are no hardcoded or default credentials. Create an account with a password of at least 14 characters:

```bash
read -r -p 'Admin email: ' ADMIN_EMAIL
read -r -s -p 'Admin password: ' ADMIN_PASSWORD
export ADMIN_EMAIL ADMIN_PASSWORD
npm run admin:create
unset ADMIN_EMAIL ADMIN_PASSWORD
```

Open `/admin`. Accounts use Argon2id password hashing, expiring database sessions, HTTP-only cookies, same-origin request checks, CSRF tokens and rate limiting. Production requires HTTPS so secure cookies work.

Admin screens include product CRUD, archive/sold-out controls, image upload, categories, featured products, order status and tracking updates, cancellation with inventory restoration, customer order records, contact messages, inventory movements and store settings.

## Customer routes

`/`, `/shop`, `/product/[slug]`, `/wishlist`, `/cart`, `/checkout`, `/our-story`, `/why-thrift`, `/care-guide`, `/contact`, `/faq`, `/shipping-policy`, `/returns-policy`, `/privacy-policy`, `/terms-and-conditions`, `/order-tracking`.

Search, category/pattern/color/condition/price filters, sorting and pagination use API product data. The bag and wishlist persist on the device. Cart stock is advisory until checkout revalidates it. Product photos support multiple images when uploaded in admin; each seeded demo product currently has one generated photograph.

Checkout supports cash on delivery only, including customer/address validation, delivery selection, payment selection, review and real order confirmation. It atomically checks and decrements stock, calculates prices on the server, snapshots purchased products and prevents repeated checkout submissions through an idempotency key. A private 256-bit access token is required to view an order; order IDs alone never reveal customer information.

Cancellation is available only before shipment. It restores stock once. Shipped and delivered orders cannot be cancelled through this workflow; returns and refunds require a future business-approved process. Revenue in the dashboard means collected COD revenue from delivered orders.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

API tests use a temporary isolated SQLite database and remove it afterward. Browser tests create a specifically named temporary catalogue product, exercise a real checkout and remove only their own fixture records afterward. Screenshots go to `docs/screenshots/`.

Playwright defaults to the installed Chrome executable at `/opt/google/chrome/chrome` in this workspace. On another machine set `CHROME_PATH` to your installed Chrome/Chromium path. If no system browser is available, install Playwright Chromium with `npx playwright install chromium`, remove the configured executablePath, and use its bundled browser.

## Build and deploy

```bash
npm run db:generate
npm run db:migrate
npm run build
NODE_ENV=production npm start
```

Deploy both Node services on one persistent Linux VM/container host with an HTTPS reverse proxy in front of Next.js. Configure `APP_ORIGIN` to the exact public origin, `API_URL` to the internal API address, `DATABASE_URL` to a SQLite file on persistent storage, and `UPLOAD_DIR` to a persistent upload directory. Keep the API port private. This project requires a persistent filesystem and is not a stateless serverless SQLite deployment.

The Next.js application and API must have access to the same configured backend. Use one API instance for this SQLite deployment. Take regular SQLite online backups (for example `sqlite3 /data/store.db ".backup '/backups/store.db'"`) and copy the uploads directory; test restoring both. Run migrations before new application code starts. Do not copy a live SQLite database file without accounting for its WAL.

## Important production work remaining

- Replace generated demo imagery and catalogue records with verified physical inventory, actual dimensions/condition/defects and multiple real photographs.
- Approve shipping coverage, courier arrangements, delivery timelines, returns/refunds, legal terms and privacy content. Policy pages are visibly marked as drafts.
- Configure business contact details, delivery charges, featured inventory and COD availability in admin.
- Register and secure production hosting, TLS, backups, monitoring, operational rate-limit/proxy configuration and a restore process. No deployment is claimed by this local delivery.
- Newsletter subscriptions and contact messages are persisted; outbound email, marketing campaigns and automatic order email/SMS are not configured.
- Online payments, customer account registration, cross-device cart/wishlist synchronization, automated courier integration and returns/refund processing are not implemented. Guest cart/wishlist are browser-local; schema models are present for future account-backed persistence.
- Admin lists currently cap orders and inventory at 200 records and customer address records at 500; server pagination/export should be added as the store grows.
- Complete a security/accessibility review and approve real commercial policies before accepting real orders. This is a runnable development store, not a claim of production readiness.

See `docs/design-reference.md` for component mapping and known visual differences, `docs/assets.md` for asset prompts/provenance, and `docs/validation.md` for actual check results.

Implementation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Prisma 6 SQLite connector](https://docs.prisma.io/docs/orm/v6/overview/databases/sqlite), [Prisma 6 transactions](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions).
