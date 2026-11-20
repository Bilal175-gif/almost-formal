import { ProductDetail } from "@/components/product-detail";
import { product } from "@/lib/catalog-server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await product(slug);
  if (!p) return { title: "Tie not found", robots: { index: false } };
  return {
    title: `${p.title}${p.width ? `, ${p.width} cm` : ""}`,
    description: `${p.title}. ${p.condition} condition. ${p.width ? `${p.width} cm wide. ` : ""}${p.stock ? "Available" : "Sold out"} at Almost Formal, Pakistan.`,
    alternates: { canonical: `/product/${p.slug}` },
  };
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = await product(slug);
  if (!p) notFound();
  const url = `https://almostformal.shop/product/${p.slug}`;
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product",
    name: p.title, description: p.description, image: p.images.map((image) => image.url),
    sku: p.sku || undefined, url,
    offers: { "@type": "Offer", url, priceCurrency: "PKR", price: (p.price / 100).toFixed(2),
      availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /><ProductDetail slug={slug} initial={p} /></>;
}
