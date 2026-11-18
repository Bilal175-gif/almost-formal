# Vercel API deployment

This project can run its existing Express API as a Vercel Function. Use a Vercel plan that permits a commercial storefront; Vercel Hobby is limited to personal, non-commercial use. Keep the Cloudflare frontend on its current Worker until the Vercel API is tested.

## Project settings

1. Import this repository as a separate Vercel project. Set **Root Directory** to `apps/api` and enable **Include source files outside of the Root Directory in the Build Step**. The API imports `packages/shared`, and its build reads `scripts/postgres-schema.mjs` from the repository root.
2. Use the Express framework preset. `src/app.ts` exports the Express application. `apps/api/vercel.json` generates the PostgreSQL Prisma Client during the build. Leave the output directory unset.
3. Set these Production and Preview environment variables in Vercel:

   ```text
   DATABASE_URL=<the existing Neon pooled PostgreSQL URL>
   APP_ORIGIN=https://almostformal.shop
   STORAGE_MODE=cloudinary
   TRUST_PROXY_HOPS=1
   CLOUDINARY_CLOUD_NAME=<existing cloud name>
   CLOUDINARY_API_KEY=<existing key>
   CLOUDINARY_API_SECRET=<existing secret>
   ```

   Set `ALLOWED_ORIGINS` if the site has other exact frontend origins. Add `RESEND_API_KEY`, `EMAIL_FROM`, and `STORE_NOTIFICATION_EMAIL` if order email is enabled. Keep all secrets in Vercel environment settings, never in Git.

4. Use the existing Neon database for the first deployment. Run schema migrations separately from the repository root with `DATABASE_URL` and, if needed, `DIRECT_URL`: `npm run db:migrate:production`. Do not run migrations inside a request handler. The API Function does not seed products or reset the administrator.
5. Test the Vercel deployment URL at `/api/health`, `/api/products?featured=true&limit=4`, admin login, an image upload, and a disposable test order before changing Cloudflare's `API_URL`. An empty products list means the Vercel project is using a different database.
6. Set `API_URL` and `NEXT_PUBLIC_API_URL` in the Cloudflare frontend build to the Vercel API origin, rebuild and deploy the frontend, then repeat the storefront and checkout checks. Keep the Render service available until this cutover is verified.

Vercel Functions have request duration, payload, and bundle limits. Product uploads are limited by this API to 5 MB and stored in Cloudinary. Vercel's filesystem must not be used for persistent uploads or a SQLite database.
