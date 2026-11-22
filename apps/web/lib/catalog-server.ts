import type { Product } from "../../../packages/shared";

type ProductList = { products: Product[]; total: number; pages: number; page: number };

const origin = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4100";

export async function catalog(page = 1, limit = 12, inStock = false): Promise<ProductList | null> {
  try {
    const response = await fetch(`${origin}/api/products?page=${page}&limit=${limit}${inStock ? "&inStock=true" : ""}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8000),
    });
    return response.ok ? (await response.json()) as ProductList : null;
  } catch {
    return null;
  }
}

export async function featuredCatalog(): Promise<ProductList | null> {
  try {
    const response = await fetch(`${origin}/api/products?featured=true&limit=4`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? (await response.json()) as ProductList : null;
  } catch {
    return null;
  }
}

export async function product(slug: string): Promise<Product | null> {
  try {
    const response = await fetch(`${origin}/api/products/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8000),
    });
    return response.ok ? (await response.json()) as Product : null;
  } catch {
    return null;
  }
}
