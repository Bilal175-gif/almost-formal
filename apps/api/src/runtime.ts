import { z } from "zod";

class HostedConfigError extends Error {}

export function databaseUrl(value = process.env.DATABASE_URL) {
  if (!value) {
    if (process.env.NODE_ENV === "production")
      throw new Error("DATABASE_URL is required in production.");
    return "file:./dev.db";
  }
  if (!/^postgres(ql)?:/.test(value)) return value;
  const url = new URL(value);
  // Bound connections for a small Render instance and allow Neon to wake up.
  for (const [name, fallback] of Object.entries({
    connection_limit: "3",
    pool_timeout: "20",
    connect_timeout: "20",
  })) {
    if (!url.searchParams.has(name)) url.searchParams.set(name, fallback);
  }
  return url.toString();
}

export function validateHostedEnvironment(env = process.env) {
  if (!/^postgres(ql)?:/.test(env.DATABASE_URL || ""))
    throw new HostedConfigError(
      "Render requires a persistent PostgreSQL DATABASE_URL (Neon). Local SQLite is not durable on Render Free.",
    );
  let origin: URL;
  try {
    origin = new URL(env.APP_ORIGIN || "");
  } catch {
    throw new HostedConfigError(
      "APP_ORIGIN is missing or invalid. Set the exact HTTPS frontend origin.",
    );
  }
  if (origin.protocol !== "https:" || origin.origin !== env.APP_ORIGIN)
    throw new HostedConfigError(
      "APP_ORIGIN must be the exact HTTPS frontend origin, without a trailing slash.",
    );
  const missing = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ].filter((key) => !env[key]?.trim());
  if (missing.length)
    throw new HostedConfigError(
      `Missing environment variables: ${missing.join(", ")}. Set these in Render Environment for persistent image uploads.`,
    );
}

export function initialAdminCredentials(env = process.env) {
  const result = z
    .object({
      ADMIN_EMAIL: z.email(),
      ADMIN_PASSWORD: z.string().min(12).max(256),
    })
    .safeParse(env);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path[0])),
    ];
    throw new HostedConfigError(
      `Invalid or missing ${fields.join(", ")}. ADMIN_EMAIL must be a valid email; ADMIN_PASSWORD must be 12–256 characters for the first deploy.`,
    );
  }
  return {
    email: result.data.ADMIN_EMAIL,
    password: result.data.ADMIN_PASSWORD,
  };
}

export function startupErrorMessage(error: unknown, stage: string) {
  // Only our own messages are safe to print: Prisma errors can contain URLs or
  // credentials. Expose the stage/error code, never arbitrary provider messages.
  if (error instanceof HostedConfigError)
    return `Render startup failed: ${error.message}`;
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^P\d{4}$/.test(error.code)
      ? ` (${error.code})`
      : "";
  return `Render startup failed during ${stage}${code}. Check the database connection and deployment configuration.`;
}
