import app from "./app.js";
import type { Env } from "./env.js";
import type { ExecutionContext } from "@cloudflare/workers-types";
import { mailStatus } from "./mail-worker.js";

// Cloudflare Worker entry point. Replaces src/server.ts (kept in
// src/express-legacy/server.express.ts): no listen(), no WAL pragmas,
// no localhost port — the Worker answers fetch events.
//
// Boot validation (the Worker equivalent of main's
// validateHostedEnvironment, minus the Postgres parts): in production
// APP_ORIGIN must be an exact https origin with no trailing slash.
// Cloudinary secrets are NOT required at boot — the storefront works
// without uploads — but a missing/partial set is logged once so a
// misconfigured deploy is visible in `wrangler tail`. Error messages
// never include secret values.
let validated = false;

function validateEnv(env: Env): void {
  if (validated) return;
  validated = true;
  const problems: string[] = [];
  if (env.NODE_ENV === "production") {
    let origin: URL | null = null;
    try {
      origin = new URL(env.APP_ORIGIN || "");
    } catch {
      origin = null;
    }
    if (!origin || origin.protocol !== "https:" || origin.origin !== env.APP_ORIGIN)
      problems.push(
        "APP_ORIGIN must be the exact HTTPS frontend origin, without a trailing slash.",
      );
  }
  if (
    (env.CLOUDINARY_CLOUD_NAME ||
      env.CLOUDINARY_API_KEY ||
      env.CLOUDINARY_API_SECRET) &&
    !(
      env.CLOUDINARY_CLOUD_NAME &&
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET
    )
  )
    problems.push(
      "Cloudinary credentials are incomplete: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET together.",
    );
  if (problems.length) {
    // Log, don't crash: the catalogue must stay up even if uploads
    // are misconfigured; the upload endpoint answers 503 in that case.
    console.error(`API Worker configuration: ${problems.join(" ")}`);
  }
  console.log(`Almost Formal API Worker · Email: ${mailStatus(env)}`);
}

const worker = {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    validateEnv(env);
    return app.fetch(request, env, ctx);
  },
};

export default worker;
