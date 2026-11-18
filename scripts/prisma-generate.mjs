// Generates the Prisma client using locally cached engine binaries.
//
// The Prisma CLI's bundled downloader cannot reach the network in some
// sandboxes (ECONNRESET), so this script points the CLI at binaries that
// were fetched once with curl into ~/.cache/prisma and reuses them.
// It also copies the query-engine library into node_modules/.prisma/client
// under the platform-suffixed name the generated client looks for at
// runtime when running locally under tsx (Workers do not need it — the
// adapter path bundles the WASM query compiler instead).
//
// Usage: node scripts/prisma-generate.mjs [--no-engine]
import { spawnSync } from "node:child_process";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENGINES_VERSION = "c2990dca591cba766e3b7ef5d9e8a84796e47ab7";
const PLATFORM = "debian-openssl-3.0.x";
const CACHE = join(
  homedir(),
  ".cache",
  "prisma",
  "master",
  ENGINES_VERSION,
  PLATFORM,
);
const MIRROR = `https://binaries.prisma.sh/master/${ENGINES_VERSION}/${PLATFORM}`;

const BINARIES = {
  "query-engine": "query-engine",
  "schema-engine": "schema-engine",
  "prisma-fmt": "prisma-fmt",
  "libquery_engine.so.node": "libquery_engine.so.node",
};

async function ensureBinaries() {
  mkdirSync(CACHE, { recursive: true });
  for (const [file, urlName] of Object.entries(BINARIES)) {
    const dest = join(CACHE, file);
    if (existsSync(dest)) continue;
    console.log(`Downloading ${file} ...`);
    const res = await fetch(`${MIRROR}/${urlName}.gz`);
    if (!res.ok) throw new Error(`Failed to download ${file}: HTTP ${res.status}`);
    const { createGunzip } = await import("node:zlib");
    const { createWriteStream } = await import("node:fs");
    const { pipeline } = await import("node:stream/promises");
    await pipeline(res.body, createGunzip(), createWriteStream(dest));
    const { chmodSync } = await import("node:fs");
    chmodSync(dest, 0o755);
  }
}

await ensureBinaries();

const env = {
  ...process.env,
  CHECKPOINT_DISABLE: "1",
  DO_NOT_TRACK: "1",
  PRISMA_SCHEMA_ENGINE_BINARY: join(CACHE, "schema-engine"),
  PRISMA_QUERY_ENGINE_LIBRARY: join(CACHE, "libquery_engine.so.node"),
  PRISMA_QUERY_ENGINE_BINARY: join(CACHE, "query-engine"),
  PRISMA_FMT_BINARY: join(CACHE, "prisma-fmt"),
};

const args = ["generate", "--schema", "apps/api/prisma/schema.prisma"];
if (process.argv.includes("--no-engine")) args.push("--no-engine");
const result = spawnSync("npx", ["prisma", ...args], { stdio: "inherit", env });
if (result.status !== 0) process.exit(result.status ?? 1);

// Local tsx runs need the query-engine library under its platform name.
const libSrc = join(CACHE, "libquery_engine.so.node");
const libDest = join(
  process.cwd(),
  "node_modules",
  ".prisma",
  "client",
  `libquery_engine-${PLATFORM}.so.node`,
);
if (existsSync(libSrc) && !existsSync(libDest)) {
  copyFileSync(libSrc, libDest);
  console.log(`Copied query engine library to ${libDest}`);
}
