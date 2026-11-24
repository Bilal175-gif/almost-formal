import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/cart", "/checkout", "/wishlist", "/order-tracking", "/api/"] }, sitemap: "https://almostformal.shop/sitemap.xml" };
}
