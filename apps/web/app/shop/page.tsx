import { Suspense } from "react";
import { Collection, ProductSkeletons } from "@/components/products";
export const metadata = { title: "Shop the drop" };
export default function Shop() {
  return (
    <Suspense fallback={<ProductSkeletons />}>
      <Collection />
    </Suspense>
  );
}
