import { Suspense } from "react";
import { Collection, ProductSkeletons } from "@/components/products";
import { catalog } from "@/lib/catalog-server";
import type { Metadata } from "next";
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const params = await searchParams;
  const page = Number(params.page || 1);
  const filtered = Object.keys(params).some((key) => key !== "page");
  return {
    title: "Buy Patterned Neckties Online in Pakistan",
    description: "Explore Almost Formal's current selection of one-of-one patterned neckties in Pakistan. See each tie's price, condition and availability.",
    alternates: { canonical: Number.isInteger(page) && page > 1 && !filtered ? `/shop?page=${page}` : "/shop" },
    robots: { index: !filtered, follow: true },
  };
}
export default async function Shop({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page || 1) || 1);
  const initial = await catalog(page, 12, true);
  return (
    <Suspense fallback={<ProductSkeletons />}>
      <Collection initial={initial || undefined} initialPage={page} />
    </Suspense>
  );
}
