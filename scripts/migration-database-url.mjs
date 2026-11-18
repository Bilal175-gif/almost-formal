// Prisma Migrate needs session-level advisory locks. Neon's transaction pooler
// cannot provide those, while the application should keep using the pooler.
export function migrationDatabaseUrl(databaseUrl, directUrl) {
  if (!databaseUrl?.match(/^postgres(ql)?:/))
    throw new Error("DATABASE_URL must be a PostgreSQL URL for production migrations.");

  const url = new URL(directUrl || databaseUrl);
  const firstLabel = url.hostname.split(".")[0];
  if (url.hostname.endsWith(".neon.tech") && firstLabel.endsWith("-pooler")) {
    if (directUrl)
      throw new Error("DIRECT_URL must use the Neon direct endpoint, without -pooler.");
    url.hostname = url.hostname.replace("-pooler.", ".");
  } else if (firstLabel.endsWith("-pooler")) {
    throw new Error("Set DIRECT_URL to a non-pooled PostgreSQL endpoint for migrations.");
  }
  url.searchParams.delete("pgbouncer");
  url.searchParams.delete("connection_limit");
  url.searchParams.delete("pool_timeout");
  return url.toString();
}
