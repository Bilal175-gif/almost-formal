import { v2 as cloudinary } from "cloudinary";

const folder = "almost-formal/products";
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

export function cloudinaryConfigured() {
  return Boolean(cloudName && apiKey && apiSecret);
}

function configureCloudinary() {
  if (!cloudinaryConfigured())
    throw new Error("Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET together.");
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
}

export function cloudinaryPublicId(url: string) {
  if (!cloudName) return null;
  try {
    const parsed = new URL(url);
    const prefix = `/${cloudName}/image/upload/`;
    if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com" || !parsed.pathname.startsWith(prefix))
      return null;
    const path = parsed.pathname.slice(prefix.length);
    if (!/^v\d+\/almost-formal\/products\/[a-zA-Z0-9_-]+\.webp$/.test(path)) return null;
    return path.replace(/^v\d+\//, "").replace(/\.webp$/, "");
  } catch {
    return null;
  }
}

export function isCloudinaryProductUrl(url: string) {
  return cloudinaryPublicId(url) !== null;
}

export async function uploadProductImage(buffer: Buffer) {
  configureCloudinary();
  return new Promise<string>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image", format: "webp", overwrite: false, unique_filename: true },
      (error, result) => {
        if (error || !result?.secure_url) reject(error || new Error("Cloudinary returned no secure URL."));
        else resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}

export async function destroyCloudinaryImage(url: string) {
  const publicId = cloudinaryPublicId(url);
  if (!publicId) return;
  configureCloudinary();
  const result = await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
  if (result.result !== "ok" && result.result !== "not found")
    throw new Error(`Cloudinary could not delete ${publicId}: ${result.result}`);
}
