import type { Product } from "../../../packages/shared";
import featuredFallback from "./featured-fallback.json";
import { serverApi } from "./server-api";

type ProductList = { products: Product[]; total: number; pages: number; page: number };

export async function catalog(page = 1, limit = 12, inStock = false): Promise<ProductList | null> {
  try {
    const response = await serverApi(`/products?page=${page}&limit=${limit}${inStock ? "&inStock=true" : ""}`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(8000),
    });
    return response.ok ? (await response.json()) as ProductList : null;
  } catch {
    return null;
  }
}

export async function featuredCatalog(): Promise<ProductList | null> {
  try {
    const response = await serverApi(`/products?featured=true&limit=4`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? (await response.json()) as ProductList : featuredFallback as ProductList;
  } catch {
    return featuredFallback as ProductList;
  }
}

export async function product(slug: string): Promise<Product | null> {
  try {
    const response = await serverApi(`/products/${encodeURIComponent(slug)}`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(8000),
    });
    return response.ok ? (await response.json()) as Product : null;
  } catch {
    return null;
  }
}
