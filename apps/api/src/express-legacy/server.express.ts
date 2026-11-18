import { app } from "./app.js";
import { db } from "./db.js";
import { mailStatus } from "./mail.js";
if (process.env.DATABASE_URL?.startsWith("file:")) {
  await db.$queryRawUnsafe("PRAGMA journal_mode = WAL");
  await db.$queryRawUnsafe("PRAGMA busy_timeout = 10000");
}
const host = process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
const server = app.listen(Number(process.env.PORT || 4100), host, () =>
  console.log(
    `Almost Formal API: http://${host}:${process.env.PORT || 4100} · Email ${mailStatus()}`,
  ),
);
const shutdown = () =>
  server.close(() => {
    void db.$disconnect().finally(() => process.exit(0));
  });
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
