const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

export function productImageUrl(src: string | undefined, width: number) {
  if (!src || !cloudName) return src || "";
  try {
    const url = new URL(src);
    const prefix = `/${cloudName}/image/upload/`;
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || !url.pathname.startsWith(prefix))
      return src;
    const path = url.pathname.slice(prefix.length);
    if (!/^v\d+\//.test(path)) return src;
    return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,w_${width},c_limit/${path}`;
  } catch {
    return src;
  }
}

export function productImageSrcSet(src: string | undefined, widths: number[]) {
  if (!src || productImageUrl(src, widths[0]) === src) return undefined;
  return widths.map((width) => `${productImageUrl(src, width)} ${width}w`).join(", ");
}
