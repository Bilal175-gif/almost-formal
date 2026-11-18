// Cloudinary for the Worker runtime — signed uploads over fetch.
//
// The Express API used the `cloudinary` Node SDK (upload_stream) plus
// Sharp (resize to WebP). Neither runs in Workers: the SDK needs Node
// streams/crypto and Sharp is a native binary. So this module signs
// uploads with WebCrypto (HMAC-SHA1, the signature scheme Cloudinary's
// upload API requires) and POSTs a multipart FormData to
// https://api.cloudinary.com/v1_1/<cloud>/image/upload.
//
// Differences vs the Express uploader, all deliberate:
// - No server-side resize: the original file (<= 5 MB, JPEG/PNG/WebP)
//   is stored as WebP via Cloudinary's `format=webp` upload parameter.
//   Responsive delivery is already `f_auto,q_auto,w_<n>,c_limit` in
//   apps/web/lib/cloudinary-image.ts, so no Sharp step is needed.
// - No R2, no local disk. Images live only in Cloudinary under
//   `almost-formal/products`, exactly as on Render.
// - Secrets are Worker secrets (CLOUDINARY_API_KEY /
//   CLOUDINARY_API_SECRET), never committed and never NEXT_PUBLIC_*.
//   Only CLOUDINARY_CLOUD_NAME is public (already in the frontend
//   workflow env as NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME).

import type { Env } from "./env.js";

const FOLDER = "almost-formal/products";

export function cloudinaryConfigured(env: Env): boolean {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME &&
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET,
  );
}

/** True when at least one Cloudinary variable is set (partial config). */
export function cloudinaryPartiallyConfigured(env: Env): boolean {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME ||
      env.CLOUDINARY_API_KEY ||
      env.CLOUDINARY_API_SECRET,
  );
}

async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Same public-ID parsing as the Express cloudinary.ts (same URL shape). */
export function cloudinaryPublicId(url: string, cloudName?: string): string | null {
  if (!cloudName) return null;
  try {
    const parsed = new URL(url);
    const prefix = `/${cloudName}/image/upload/`;
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "res.cloudinary.com" ||
      !parsed.pathname.startsWith(prefix)
    )
      return null;
    const path = parsed.pathname.slice(prefix.length);
    if (!/^v\d+\/almost-formal\/products\/[a-zA-Z0-9_-]+\.webp$/.test(path))
      return null;
    return path.replace(/^v\d+\//, "").replace(/\.webp$/, "");
  } catch {
    return null;
  }
}

export function isCloudinaryProductUrl(url: string, cloudName?: string): boolean {
  return cloudinaryPublicId(url, cloudName) !== null;
}

export async function uploadProductImage(
  env: Env,
  file: File,
): Promise<string> {
  if (!cloudinaryConfigured(env))
    throw new Error(
      "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET together.",
    );
  const cloudName = env.CLOUDINARY_CLOUD_NAME!;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // Signature string: parameters sorted alphabetically, api_secret appended.
  const toSign = `folder=${FOLDER}&format=webp&overwrite=false&timestamp=${timestamp}&unique_filename=true${env.CLOUDINARY_API_SECRET}`;
  const signature = await sha1Hex(toSign);
  const form = new FormData();
  form.set("file", file);
  form.set("api_key", env.CLOUDINARY_API_KEY!);
  form.set("timestamp", timestamp);
  form.set("signature", signature);
  form.set("folder", FOLDER);
  form.set("format", "webp");
  form.set("overwrite", "false");
  form.set("unique_filename", "true");
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: form, signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok)
    throw new Error(
      `Cloudinary upload failed (${response.status}). Check the Cloudinary secrets.`,
    );
  const result = (await response.json()) as { secure_url?: string };
  if (!result.secure_url)
    throw new Error("Cloudinary returned no secure URL.");
  return result.secure_url;
}

export async function destroyCloudinaryImage(
  env: Env,
  url: string,
): Promise<void> {
  const publicId = cloudinaryPublicId(url, env.CLOUDINARY_CLOUD_NAME);
  if (!publicId || !cloudinaryConfigured(env)) return;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const toSign = `invalidate=true&public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`;
  const signature = await sha1Hex(toSign);
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        public_id: publicId,
        api_key: env.CLOUDINARY_API_KEY,
        timestamp,
        signature,
        invalidate: true,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) return;
  const result = (await response.json()) as { result?: string };
  if (result.result !== "ok" && result.result !== "not found")
    throw new Error(
      `Cloudinary could not delete ${publicId}: ${result.result}`,
    );
}
