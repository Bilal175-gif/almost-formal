import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const dir = await mkdtemp(join(tmpdir(), "almost-formal-test-"));
await writeFile(join(dir, "test.db"), "");
const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: `file:${join(dir, "test.db")}`,
};
let status = 1;
try {
  const migration = spawnSync(
    "node",
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--schema",
      "apps/api/prisma/schema.prisma",
    ],
    { stdio: "inherit", env },
  );
  if (migration.status === 0) {
    const result = spawnSync(
      "node",
      ["--import", "tsx", "--test", "tests/api.test.ts"],
      { stdio: "inherit", env },
    );
    status = result.status ?? 1;
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
process.exit(status);
