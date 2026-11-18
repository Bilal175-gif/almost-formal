import type { D1Database } from "@cloudflare/workers-types";

// Bindings for the API Worker. Declared in apps/api/wrangler.toml.
// D1 replaces DATABASE_URL (file SQLite on the old stack, Neon
// PostgreSQL on Render). APP_ORIGIN must be the exact public origin
// of the web app (the Cloudflare Worker origin / almostformal.shop) —
// the af_session cookie and the CORS / origin checks are built from it.
//
// Secrets (set with `wrangler secret put`, never committed, never in
// wrangler.toml): CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
// RESEND_API_KEY. EMAIL_FROM / STORE_NOTIFICATION_EMAIL are plain
// vars in wrangler.toml. CLOUDINARY_CLOUD_NAME is public (it is also
// the frontend's NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME).
export interface Env {
  DB: D1Database;
  APP_ORIGIN: string;
  ALLOWED_ORIGINS?: string;
  NODE_ENV?: string;
  PUBLIC_CACHE_TTL_SECONDS?: string;
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  STORE_NOTIFICATION_EMAIL?: string;
}
