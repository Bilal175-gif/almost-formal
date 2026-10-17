"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Heart,
  Ruler,
  ScanLine,
  Layers,
  Palette,
  BadgeCheck,
  ArrowLeft,
  Plus,
  Package,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { type Product, money } from "../../../packages/shared";
import { ErrorBox } from "./ui";
import { ArrowDoodle } from "./doodles";
import { ProductCard, ProductSkeletons } from "./products";
export function ProductDetail({ slug }: { slug: string }) {
  const s = useStore();
  const [selected, setSelected] = useState(0);
  const {
    data: p,
    error,
    isPending,
    refetch,
  } = useQuery({
    queryKey: ["product", slug],
    queryFn: () => api<Product>(`/products/${slug}`),
  });
  const { data: related } = useQuery({
    queryKey: ["related"],
    queryFn: () => api<{ products: Product[] }>("/products?limit=5"),
  });
  if (isPending)
    return (
      <section className="product-page paper">
        <ProductSkeletons />
      </section>
    );
  if (error || !p)
    return (
      <section className="product-page paper">
        <ErrorBox
          message={error?.message || "Product not found."}
          retry={() => void refetch()}
        />
        <Link href="/shop" className="text-link">
          Back to shop
        </Link>
      </section>
    );
  return (
    <section className="product-page paper">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/shop">
          <ArrowLeft size={14} />
        </Link>
        <Link href="/shop">The good finds</Link>
        <span>/</span>
        <span>{p.title}</span>
      </nav>
      <div className="product-detail">
        <div className="product-gallery">
          <div className="thumbnails">
            {p.images.map((img, i) => (
              <button
                key={img.id}
                className={selected === i ? "active" : ""}
                onClick={() => setSelected(i)}
                aria-label={`View photo ${i + 1}`}
                aria-pressed={selected === i}
              >
                <img src={img.url} alt={img.alt} />
              </button>
            ))}
          </div>
          <div className="product-main-image">
            <img
              src={p.images[selected]?.url || p.images[0]?.url}
              alt={p.images[selected]?.alt || p.title}
              width={384}
              height={512}
            />
            <button
              className={`wish-button ${s.wishlist.includes(p.id) ? "wished" : ""}`}
              onClick={() => s.toggleWish(p.id)}
              aria-label={`${s.wishlist.includes(p.id) ? "Unsave" : "Save"} ${p.title}`}
              aria-pressed={s.wishlist.includes(p.id)}
            >
              <Heart
                fill={s.wishlist.includes(p.id) ? "currentColor" : "none"}
              />
            </button>
            <div className="one-note">
              ONE
              <br />
              OF
              <br />
              ONE
              <ArrowDoodle />
            </div>
          </div>
        </div>
        <div className="product-detail-copy">
          <span className="eyebrow">A LITTLE HISTORY. A LOT OF CHARACTER.</span>
          <h1>{p.title}</h1>
          <p className="product-price">{money(p.price)}</p>
          <div className="tags">
            <span>Vintage</span>
            <span>{p.condition} Condition</span>
            {p.era && <span>{p.era}</span>}
          </div>
          <div className="product-specs">
            <div>
              <Ruler />
              <span>
                Length: {p.length} cm ({(p.length / 2.54).toFixed(0)} in)
              </span>
            </div>
            <div>
              <ScanLine />
              <span>
                Width: {p.width} cm ({(p.width / 2.54).toFixed(1)} in)
              </span>
            </div>
            <div>
              <Layers />
              <span>Material: {p.material || "Unverified"}</span>
            </div>
            <div>
              <Palette />
              <span>
                Pattern: {p.pattern} · {p.color}
              </span>
            </div>
            <div>
              <BadgeCheck />
              <span>Condition: {p.conditionNote}</span>
            </div>
            <div>
              <Package />
              <span>
                {p.stock > 0
                  ? `${p.stock} available · One of a kind`
                  : "Sold out — found a new home"}
              </span>
            </div>
          </div>
          <div className="old-gold">
            OLD
            <br />
            BUT
            <br />
            GOLD.
          </div>
          <p className="product-description">{p.description}</p>
          <div className="product-actions">
            <button
              className="button full"
              disabled={p.stock < 1}
              onClick={() => s.add(p)}
            >
              {p.stock ? "Add to Bag" : "Found a new home"}
              {p.stock > 0 && <Plus size={20} />}
            </button>
            <p className="subtle">One-of-one. Once it’s gone, it’s gone.</p>
          </div>
          <div className="product-details-extra">
            <details>
              <summary>The little details & visible flaws</summary>
              <p>{p.flaws}</p>
              <p>
                SKU: {p.sku}.{" "}
                {p.era ? `Era: ${p.era}.` : "Era has not been verified."}
              </p>
            </details>
            <details>
              <summary>Delivery & returns</summary>
              <p>
                Cash on delivery is available where supported. Delivery charges
                are shown before you place your order. Our business policies are
                currently drafts; please review them before ordering.
              </p>
              <Link className="text-link" href="/shipping-policy">
                Shipping policy
              </Link>{" "}
              ·{" "}
              <Link className="text-link" href="/returns-policy">
                Returns policy
              </Link>
            </details>
            <details>
              <summary>A little care goes a long way</summary>
              <p>
                Untie gently after wearing, roll or hang loosely, and keep away
                from direct sunlight. For delicate vintage fabric, consult a
                professional cleaner.
              </p>
              <Link href="/care-guide" className="text-link">
                Read the care guide
              </Link>
            </details>
          </div>
        </div>
      </div>
      {related && (
        <section className="related">
          <h2>More stories worth wearing.</h2>
          <div className="product-grid">
            {related.products
              .filter((x) => x.id !== p.id)
              .slice(0, 4)
              .map((product, i) => (
                <ProductCard key={product.id} product={product} index={i} />
              ))}
          </div>
        </section>
      )}
    </section>
  );
}
