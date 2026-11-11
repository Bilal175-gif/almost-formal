"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Heart, Plus, ArrowRight, Search, Eye, Minus } from "lucide-react";
import type { Product } from "../../../packages/shared";
import { money } from "../../../packages/shared";
import { api } from "@/lib/api";
import { productImageUrl, productImageSrcSet } from "@/lib/cloudinary-image";
import { useStore } from "@/lib/store";
import { Star, Smile } from "./doodles";
import { ErrorBox, Modal } from "./ui";
type ProductList = {
  products: Product[];
  total: number;
  pages: number;
  page: number;
};
type ProductFilters = {
  categories: string[];
  patterns: string[];
  colors: string[];
  conditions: string[];
  maxPrice: number;
};
export function ProductCard({
  product: p,
  index = 0,
}: {
  product: Product;
  index?: number;
}) {
  const s = useStore();
  const [quick, setQuick] = useState(false);
  const wished = s.wishlist.includes(p.id);
  const imageUrl = p.images[0]?.url.startsWith("/images/instagram/")
    ? p.images[0].url.replace("-0.webp", "-thumb.webp")
    : p.images[0]?.url;
  return (
    <>
      <article className={`product-card ${p.stock === 0 ? "sold" : ""}`}>
        <div className="product-image">
          <Link href={`/product/${p.slug}`}>
            <img
              src={productImageUrl(imageUrl, 640)}
              srcSet={productImageSrcSet(imageUrl, [320, 640, 960])}
              sizes="(max-width: 600px) 50vw, (max-width: 1000px) 33vw, 25vw"
              alt={p.images[0]?.alt || p.title}
              loading={index < 4 ? "eager" : "lazy"}
              width={384}
              height={512}
            />
          </Link>
          <button
            className={`wish-button ${wished ? "wished" : ""}`}
            onClick={() => s.toggleWish(p.id)}
            aria-label={`${wished ? "Remove" : "Save"} ${p.title} ${wished ? "from" : "to"} wishlist`}
            aria-pressed={wished}
          >
            <Heart size={21} fill={wished ? "currentColor" : "none"} />
          </button>
          {p.stock === 1 && (
            <span className="product-sticker yellow">Only one left</span>
          )}
          {p.stock === 0 && <span className="sold-label">Found a home</span>}
          <button
            className="quick-view"
            onClick={() => setQuick(true)}
            aria-label={`Quick view ${p.title}`}
          >
            <Eye size={16} /> Quick look
          </button>
        </div>
        <div className="product-info">
          <Link href={`/product/${p.slug}`}>{p.title}</Link>
          <div>
            <strong>{money(p.price)}</strong>
            <button
              className="add-button"
              aria-label={`Add ${p.title} to bag`}
              onClick={() => s.add(p)}
              disabled={!p.stock}
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
      </article>
      <Modal
        open={quick}
        onClose={() => setQuick(false)}
        label={p.title}
        className="quick-modal"
      >
        <img
          src={productImageUrl(p.images[0]?.url, 960)}
          srcSet={productImageSrcSet(p.images[0]?.url, [480, 960, 1280])}
          sizes="(max-width: 600px) 90vw, 480px"
          alt={p.title}
        />
        <div>
          <span className="eyebrow">
            {p.stock === 1 ? "ONE OF ONE" : "VINTAGE FIND"}
          </span>
          <h2>{p.title}</h2>
          <h3>{money(p.price)}</h3>
          <p>{p.description}</p>
          <p>{p.conditionNote}</p>
          <button
            className="button full"
            disabled={!p.stock}
            onClick={() => {
              setQuick(false);
              s.add(p);
            }}
          >
            {p.stock ? "Add to Bag" : "Found a home"}
            <Plus size={19} />
          </button>
          <Link
            className="text-link"
            href={`/product/${p.slug}`}
            onClick={() => setQuick(false)}
          >
            All the little details <ArrowRight size={16} />
          </Link>
        </div>
      </Modal>
    </>
  );
}
export function ProductSkeletons() {
  return (
    <div className="product-grid">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="product-skeleton">
          <div />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
export function Featured() {
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["featured"],
    queryFn: () => api<ProductList>("/products?featured=true&limit=4"),
  });
  return (
    <section className="featured paper">
      <div className="section-heading">
        <div>
          <span className="eyebrow">HANDPICKED. NEVER ORDINARY.</span>
          <h2>
            Featured finds
            <Star />
          </h2>
        </div>
        <Link className="text-link" href="/shop">
          See all finds <ArrowRight size={18} />
        </Link>
      </div>
      {isPending ? (
        <ProductSkeletons />
      ) : error ? (
        <ErrorBox message={error.message} retry={() => void refetch()} />
      ) : (
        <div className="product-grid">
          {data?.products.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      )}
      <div className="featured-bottom">
        <span className="handwriting">
          Here today. Someone else’s tomorrow.
        </span>
        <Link className="button outline" href="/shop">
          Shop all the good stuff <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}
export function MobileDiscovery() {
  return (
    <div className="mobile-discovery">
      <Link className="search-input" href="/shop">
        <Search size={18} />
        <span>Search ties…</span>
      </Link>
    </div>
  );
}
export function Collection({ wishlist = false }: { wishlist?: boolean }) {
  const params = useSearchParams();
  const s = useStore();
  const [search, setSearch] = useState(params.get("search") || "");
  const [debounced, setDebounced] = useState(search);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [pattern, setPattern] = useState("");
  const [color, setColor] = useState("");
  const [condition, setCondition] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [inStock, setInStock] = useState(true);
  const { data: filters } = useQuery({
    queryKey: ["product-filters"],
    queryFn: () => api<ProductFilters>("/product-filters"),
    enabled: !wishlist,
  });
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const query = new URLSearchParams({
    search: debounced,
    sort,
    page: String(page),
    limit: wishlist ? "100" : "12",
  });
  if (!wishlist) {
    if (category) query.set("category", category);
    if (pattern) query.set("pattern", pattern);
    if (color) query.set("color", color);
    if (condition) query.set("condition", condition);
    if (maxPrice) query.set("maxPrice", maxPrice);
    if (inStock) query.set("inStock", "true");
  }
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["products", query.toString()],
    queryFn: () => api<ProductList>(`/products?${query}`),
  });
  const products = wishlist
    ? data?.products.filter((p) => s.wishlist.includes(p.id))
    : data?.products;
  return (
    <section
      className={`collection paper ${wishlist ? "wishlist-collection" : ""}`}
    >
      <div className="collection-main">
        <div className="collection-heading">
          <div>
            <h1>
              {wishlist
                ? "Saved for your next story."
                : "Good finds, gone fast."}
              <Star />
            </h1>
            <p>
              {wishlist
                ? "The pieces that caught your eye."
                : "Unique vintage pieces. When it’s gone, it’s gone."}
            </p>
          </div>
        </div>
        <div className="shop-toolbar">
          <label className="search-input">
            <Search size={17} />
            <input
              aria-label="Search collection"
              placeholder="Search the good stuff…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button aria-label="Clear search" onClick={() => setSearch("")}>
                <Minus size={17} />
              </button>
            )}
          </label>
          <label className="sort-label">
            <span className="sr-only">Sort products</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="newest">Sort by: Featured</option>
              <option value="price-asc">Price: Low to high</option>
              <option value="price-desc">Price: High to low</option>
              <option value="name">Name: A to Z</option>
            </select>
          </label>
        </div>
        {!wishlist && (
          <div className="collection-filters" aria-label="Filter products">
            {(
              [
                ["Category", category, setCategory, filters?.categories],
                ["Pattern", pattern, setPattern, filters?.patterns],
                ["Color", color, setColor, filters?.colors],
                ["Condition", condition, setCondition, filters?.conditions],
              ] as const
            ).map(([label, value, setValue, options]) => (
              <label key={label}>
                <span>{label}</span>
                <select
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All {label.toLowerCase()}s</option>
                  {options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              <span>Price</span>
              <select
                value={maxPrice}
                onChange={(event) => {
                  setMaxPrice(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Any price</option>
                {[100000, 150000, 200000, 250000, 300000, 500000]
                  .filter((price) => !filters || price < filters.maxPrice)
                  .map((price) => (
                    <option key={price} value={price}>
                      Under {money(price)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="stock-filter">
              <input
                type="checkbox"
                checked={inStock}
                onChange={(event) => {
                  setInStock(event.target.checked);
                  setPage(1);
                }}
              />
              In stock only
            </label>
            {(category ||
              pattern ||
              color ||
              condition ||
              maxPrice ||
              !inStock) && (
              <button
                className="text-link"
                type="button"
                onClick={() => {
                  setCategory("");
                  setPattern("");
                  setColor("");
                  setCondition("");
                  setMaxPrice("");
                  setInStock(true);
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
        {isPending ? (
          <ProductSkeletons />
        ) : error ? (
          <ErrorBox message={error.message} retry={() => void refetch()} />
        ) : products?.length ? (
          <>
            <div className="product-grid">
              {products.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
            <div className="pagination">
              <span>
                {wishlist ? products.length : data?.total} one-of-one finds
              </span>
              {data && data.pages > 1 && (
                <div>
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    {page} / {data.pages}
                  </span>
                  <button
                    disabled={page === data.pages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <Smile />
            <h2>
              {wishlist
                ? "Your next favourite is out there."
                : "No finds this time."}
            </h2>
            <p>
              {wishlist
                ? "Tap the heart on any piece to save it here."
                : "Try another search to find your next tie."}
            </p>
            {wishlist ? (
              <Link className="button" href="/shop">
                Explore the drop
              </Link>
            ) : (
              <button className="button" onClick={() => setSearch("")}>
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
