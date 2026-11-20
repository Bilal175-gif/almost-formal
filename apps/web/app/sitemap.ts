import type { MetadataRoute } from "next";
import { catalog } from "@/lib/catalog-server";

const host = "https://almostformal.shop";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = ["", "/shop", "/our-story", "/faq", "/care-guide", "/contact"];
  const first = await catalog(1, 100);
  const available = await catalog(1, 12, true);
  const products = [...(first?.products || [])];
  if (first && first.pages > 1) {
    for (let page = 2; page <= first.pages; page++) {
      const batch = await catalog(page, 100);
      if (batch) products.push(...batch.products);
    }
  }
  return [
    ...staticPaths.map((path) => ({ url: `${host}${path}` })),
    ...Array.from({ length: Math.max(0, (available?.pages || 1) - 1) }, (_, index) => ({ url: `${host}/shop?page=${index + 2}` })),
    ...products.map((p) => ({ url: `${host}/product/${p.slug}` })),
  ];
}
