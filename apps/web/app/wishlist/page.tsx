import { Suspense } from "react";
import { Collection, ProductSkeletons } from "@/components/products";
export const metadata = { title: "Your saved finds", robots: { index: false, follow: false } };
export default function Wishlist() {
  return (
    <Suspense fallback={<ProductSkeletons />}>
      <Collection wishlist />
    </Suspense>
  );
}
