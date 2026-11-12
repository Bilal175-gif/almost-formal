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

export function validateHostedEnvironment() {
  if (!/^postgres(ql)?:/.test(process.env.DATABASE_URL || ""))
    throw new Error(
      "Render requires a persistent PostgreSQL DATABASE_URL (Neon). Local SQLite is not durable on Render Free.",
    );
  const origin = new URL(process.env.APP_ORIGIN || "");
  if (origin.protocol !== "https:" || origin.origin !== process.env.APP_ORIGIN)
    throw new Error(
      "APP_ORIGIN must be the exact HTTPS frontend origin, without a trailing slash.",
    );
  for (const key of [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ])
    if (!process.env[key])
      throw new Error(
        `${key} is required; Render uploads must use Cloudinary.`,
      );
}
