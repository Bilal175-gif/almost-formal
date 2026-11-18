import decodeJpeg, { init as initJpeg } from "@jsquash/jpeg/decode";
import jpegWasm from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm";
import { decode as decodePng, init as initPng } from "@jsquash/png/decode";
import pngWasm from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm";
import decodeWebp, { init as initWebp } from "@jsquash/webp/decode";
import webpWasm from "@jsquash/webp/codec/dec/webp_dec.wasm";
import { ApiError, type Env } from "./db";

const folder = "almost-formal/products";
const maxFileSize = 5 * 1024 * 1024;
const maxPixels = 25_000_000;
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
let jpegReady: Promise<void> | undefined;
let pngReady: Promise<unknown> | undefined;
let webpReady: Promise<void> | undefined;

async function sign(params: Record<string, string>, secret: string) {
  const base = Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&") + secret;
  return hex(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(base)));
}

function credentials(env: Env) {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET)
    throw new ApiError(503, "Cloudinary credentials are not configured on the API Worker.");
  return { cloud: env.CLOUDINARY_CLOUD_NAME, key: env.CLOUDINARY_API_KEY, secret: env.CLOUDINARY_API_SECRET };
}

export function publicId(env: Env, imageUrl: string) {
  if (!env.CLOUDINARY_CLOUD_NAME) return null;
  try {
    const url = new URL(imageUrl);
    const prefix = `/${env.CLOUDINARY_CLOUD_NAME}/image/upload/`;
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || !url.pathname.startsWith(prefix)) return null;
    const path = url.pathname.slice(prefix.length);
    if (!/^v\d+\/almost-formal\/products\/[a-zA-Z0-9_-]+\.webp$/.test(path)) return null;
    return path.replace(/^v\d+\//, "").replace(/\.webp$/, "");
  } catch { return null; }
}

export function allowedImageUrl(env: Env, imageUrl: string) {
  return /^\/(images|uploads)\/[a-zA-Z0-9._-]+$/.test(imageUrl) || publicId(env, imageUrl) !== null;
}

function dimensions(bytes: Uint8Array, format: "jpeg" | "png" | "webp") {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "png") {
    if (
      bytes.length < 24 ||
      bytes[0] !== 0x89 ||
      bytes[1] !== 0x50 ||
      bytes[2] !== 0x4e ||
      bytes[3] !== 0x47 ||
      bytes[4] !== 0x0d ||
      bytes[5] !== 0x0a ||
      bytes[6] !== 0x1a ||
      bytes[7] !== 0x0a ||
      new TextDecoder().decode(bytes.subarray(12, 16)) !== "IHDR"
    ) throw new ApiError(400, "Choose a valid JPEG, PNG or WebP image under 5 MB and 25 megapixels.");
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (format === "jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
      throw new ApiError(400, "Choose a valid JPEG, PNG or WebP image under 5 MB and 25 megapixels.");
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const segmentLength = view.getUint16(offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
      const isStartOfFrame =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isStartOfFrame && segmentLength >= 7) {
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += segmentLength;
    }
    throw new ApiError(400, "Choose a valid JPEG, PNG or WebP image under 5 MB and 25 megapixels.");
  }

  if (
    bytes.length < 30 ||
    new TextDecoder().decode(bytes.subarray(0, 4)) !== "RIFF" ||
    new TextDecoder().decode(bytes.subarray(8, 12)) !== "WEBP"
  ) throw new ApiError(400, "Choose a valid JPEG, PNG or WebP image under 5 MB and 25 megapixels.");
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunk = new TextDecoder().decode(bytes.subarray(offset, offset + 4));
    const length = view.getUint32(offset + 4, true);
    const data = offset + 8;
    if (data + length > bytes.length) break;
    if (chunk === "VP8X" && length >= 10) {
      return {
        width: 1 + bytes[data + 4] + (bytes[data + 5] << 8) + (bytes[data + 6] << 16),
        height: 1 + bytes[data + 7] + (bytes[data + 8] << 8) + (bytes[data + 9] << 16),
      };
    }
    if (chunk === "VP8 " && length >= 10 && bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) {
      return {
        width: view.getUint16(data + 6, true) & 0x3fff,
        height: view.getUint16(data + 8, true) & 0x3fff,
      };
    }
    if (chunk === "VP8L" && length >= 5 && bytes[data] === 0x2f) {
      return {
        width: 1 + ((bytes[data + 2] & 0x3f) << 8) + bytes[data + 1],
        height: 1 + ((bytes[data + 4] & 0x0f) << 10) + (bytes[data + 3] << 2) + ((bytes[data + 2] & 0xc0) >> 6),
      };
    }
    offset = data + length + (length & 1);
  }
  throw new ApiError(400, "Choose a valid JPEG, PNG or WebP image under 5 MB and 25 megapixels.");
}

async function decodeImage(bytes: Uint8Array, format: "jpeg" | "png" | "webp") {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  if (format === "jpeg") {
    jpegReady ??= initJpeg(jpegWasm);
    await jpegReady;
    return decodeJpeg(buffer, { preserveOrientation: true });
  }
  if (format === "png") {
    pngReady ??= initPng(pngWasm);
    await pngReady;
    return decodePng(buffer);
  }
  webpReady ??= initWebp(webpWasm);
  await webpReady;
  return decodeWebp(buffer);
}

export async function validateImage(file: File) {
  if (file.size === 0 || file.size > maxFileSize)
    throw new ApiError(400, "Choose a JPEG, PNG or WebP image under 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";
  const format = jpeg ? "jpeg" : png ? "png" : webp ? "webp" : null;
  if (!format || file.type !== `image/${format === "jpeg" ? "jpeg" : format}`)
    throw new ApiError(400, "Choose a valid JPEG, PNG or WebP image.");
  const size = dimensions(bytes, format);
  if (
    !Number.isSafeInteger(size.width) ||
    !Number.isSafeInteger(size.height) ||
    size.width < 1 ||
    size.height < 1 ||
    size.width * size.height > maxPixels
  ) throw new ApiError(400, "Choose an image no larger than 25 megapixels.");
  try {
    const decoded = await decodeImage(bytes, format);
    if (
      decoded.width !== size.width ||
      decoded.height !== size.height ||
      decoded.data.length < size.width * size.height * 3
    ) throw new Error("Decoded image dimensions do not match its header.");
  } catch {
    throw new ApiError(400, "Choose a valid JPEG, PNG or WebP image under 5 MB and 25 megapixels.");
  }
  return { bytes, format };
}

export async function uploadImage(env: Env, request: Request) {
  const { cloud, key, secret } = credentials(env);
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxFileSize + 128 * 1024)
    throw new ApiError(413, "Choose a JPEG, PNG or WebP image under 5 MB.");
  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof File)) throw new ApiError(400, "Choose a JPEG, PNG or WebP image under 5 MB.");
  const { bytes, format } = await validateImage(file);
  const params = { folder, format: "webp", timestamp: String(Math.floor(Date.now() / 1000)) };
  const body = new FormData();
  body.set("file", new Blob([bytes], { type: `image/${format}` }), file.name);
  for (const [name, value] of Object.entries(params)) body.set(name, value);
  body.set("api_key", key);
  body.set("signature", await sign(params, secret));
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`, { method: "POST", body });
  if (!response.ok) throw new ApiError(502, "Cloudinary image upload failed.");
  const result = await response.json() as { secure_url?: string };
  if (!result.secure_url || !publicId(env, result.secure_url)) throw new ApiError(502, "Cloudinary returned an unexpected image URL.");
  return result.secure_url;
}

export async function deleteImage(env: Env, imageUrl: string) {
  const imageId = publicId(env, imageUrl);
  if (!imageId) return;
  const { cloud, key, secret } = credentials(env);
  const params = { public_id: imageId, timestamp: String(Math.floor(Date.now() / 1000)) };
  const body = new URLSearchParams({ ...params, api_key: key, signature: await sign(params, secret) });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/destroy`, { method: "POST", body });
  if (!response.ok) throw new Error("Cloudinary image deletion failed.");
}
