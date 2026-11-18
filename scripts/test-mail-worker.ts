// Test the Resend HTTPS email path (Worker equivalent of the old
// `npm run smtp:test`). Reads RESEND_API_KEY, EMAIL_FROM and
// STORE_NOTIFICATION_EMAIL from the environment / .dev.vars — never
// commit real values. Sends one test email to the store notification
// inbox; exit 1 if the provider rejects it.
//
// Usage:
//   RESEND_API_KEY=... EMAIL_FROM='Almost Formal <orders@...>' \
//   STORE_NOTIFICATION_EMAIL=you@example.com npx tsx scripts/test-mail-worker.ts
import { sendTestEmail } from "../apps/api/src/mail-worker.ts";
import type { Env } from "../apps/api/src/env.js";

const env = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  STORE_NOTIFICATION_EMAIL: process.env.STORE_NOTIFICATION_EMAIL,
} as unknown as Env;
try {
  const to = await sendTestEmail(env);
  console.log(`Test email sent to ${to}.`);
} catch (error) {
  console.error("Email test failed:", (error as Error).message);
  process.exit(1);
}
