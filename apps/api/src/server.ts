import { app } from "./app.js";
import { db } from "./db.js";
await db.$queryRawUnsafe("PRAGMA journal_mode = WAL");
await db.$queryRawUnsafe("PRAGMA busy_timeout = 10000");
const server = app.listen(Number(process.env.PORT || 4000), "127.0.0.1", () =>
  console.log(
    `Almost Formal API: http://127.0.0.1:${process.env.PORT || 4000}`,
  ),
);
const shutdown = () =>
  server.close(() => {
    void db.$disconnect().finally(() => process.exit(0));
  });
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
