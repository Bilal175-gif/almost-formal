"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Heart,
  Plus,
  ArrowRight,
  Search,
  SlidersHorizontal,
  Eye,
  Minus,
} from "lucide-react";
import type { Product } from "../../../packages/shared";
import { money } from "../../../packages/shared";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { Star, Smile } from "./doodles";
import { ErrorBox, Modal } from "./ui";
type ProductList = {
  products: Product[];
  total: number;
  pages: number;
  page: number;
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
  return (
    <>
      <motion.article
        initial={false}
        whileTap={{ scale: 0.985 }}
        transition={{ duration: 0.25 }}
        className={`product-card ${p.stock === 0 ? "sold" : ""}`}
      >
        <div className="product-image">
          <Link href={`/product/${p.slug}`}>
            <img
              src={p.images[0]?.url}
              alt={p.images[0]?.alt || p.title}
              loading="lazy"
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
          {index === 2 && <span className="product-sticker">Vintage</span>}
          {index === 3 && (
            <span className="product-sticker yellow">Rare find</span>
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
      </motion.article>
      <Modal
        open={quick}
        onClose={() => setQuick(false)}
        label={p.title}
        className="quick-modal"
      >
        <img src={p.images[0]?.url} alt={p.title} />
        <div>
          <span className="eyebrow">ONE OF ONE</span>
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
        <span>Search ties, patterns, colors…</span>
      </Link>
      <div className="category-bubbles">
        {[
          ["All", ""],
          ["Striped", "Striped"],
          ["Paisley", "Paisley"],
          ["Solid", "Solid"],
          ["Bow Ties", "Bow Ties"],
        ].map(([label, value], i) => (
          <Link
            key={label}
            href={`/shop?${i === 4 ? "category" : "pattern"}=${value}`}
          >
            <span className={`category-bubble bubble-${i}`}>
              {i === 0 && <img src="/images/tie-5.webp" alt="" />}
              {i === 2 && <img src="/images/tie-3.webp" alt="" />}
              {i === 4 && <img src="/images/tie-6.webp" alt="" />}
            </span>
            <small>{label}</small>
          </Link>
        ))}
      </div>
    </div>
  );
}
export function Collection({ wishlist = false }: { wishlist?: boolean }) {
  const params = useSearchParams();
  const s = useStore();
  const [search, setSearch] = useState(params.get("search") || "");
  const [debounced, setDebounced] = useState(search);
  const [filters, setFilters] = useState<Record<string, string[]>>({
    category: params.get("category") ? [params.get("category")!] : [],
    pattern: params.get("pattern") ? [params.get("pattern")!] : [],
    color: [],
    condition: [],
  });
  const [max, setMax] = useState(2500);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
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
    maxPrice: String(max * 100),
    page: String(page),
    limit: wishlist ? "100" : "12",
  });
  Object.entries(filters).forEach(([k, v]) => {
    if (v.length) query.set(k, v.join(","));
  });
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["products", query.toString()],
    queryFn: () => api<ProductList>(`/products?${query}`),
  });
  const products = wishlist
    ? data?.products.filter((p) => s.wishlist.includes(p.id))
    : data?.products;
  const toggle = (key: string, value: string) => {
    setPage(1);
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((x) => x !== value)
        : [...prev[key], value],
    }));
  };
  const clear = () => {
    setFilters({ category: [], pattern: [], color: [], condition: [] });
    setMax(2500);
    setSearch("");
    setPage(1);
  };
  const filterContent = (
    <>
      <div className="filter-title">
        <h3>Filters</h3>
        <button onClick={clear}>Clear all</button>
      </div>
      {[
        [
          "category",
          "Category",
          [
            "Regular Ties",
            "Bow Ties",
            "Pocket Squares",
            "Cufflinks",
            "Tie Bars",
          ],
        ],
        [
          "pattern",
          "Pattern",
          ["Striped", "Paisley", "Geometric", "Floral", "Solid", "Novelty"],
        ],
      ].map(([key, label, values]) => (
        <fieldset key={key as string}>
          <legend>{label}</legend>
          {(values as string[]).map((v) => (
            <label key={v}>
              <input
                type="checkbox"
                checked={filters[key as string].includes(v)}
                onChange={() => toggle(key as string, v)}
              />
              {v}
            </label>
          ))}
        </fieldset>
      ))}
      <fieldset>
        <legend>Color</legend>
        <div className="color-filters">
          {[
            ["Green", "#194b3a"],
            ["Red", "#bb332a"],
            ["Blue", "#075899"],
            ["Yellow", "#f4b544"],
            ["Brown", "#6a4b36"],
            ["Multicolor", "linear-gradient(45deg,#d68993,#eec482,#194b3a)"],
          ].map(([name, color]) => (
            <button
              key={name}
              aria-label={`Filter ${name}`}
              title={name}
              aria-pressed={filters.color.includes(name)}
              style={{ background: color }}
              className={filters.color.includes(name) ? "selected" : ""}
              onClick={() => toggle("color", name)}
            />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Price Range</legend>
        <p>Rs. 0 – Rs. {max.toLocaleString()}</p>
        <input
          aria-label="Maximum price"
          type="range"
          min={0}
          max={2500}
          step={50}
          value={max}
          onChange={(e) => {
            setMax(Number(e.target.value));
            setPage(1);
          }}
        />
      </fieldset>
      <fieldset>
        <legend>Condition</legend>
        {["Excellent", "Good", "Worn (character)"].map((v) => (
          <label key={v}>
            <input
              type="checkbox"
              checked={filters.condition.includes(v)}
              onChange={() => toggle("condition", v)}
            />
            {v}
          </label>
        ))}
      </fieldset>
      <div className="filter-note">
        <Smile />
        <span>
          EVERY TIE
          <br />
          HAS A PAST!
        </span>
        <Star />
      </div>
    </>
  );
  return (
    <section
      className={`collection paper ${wishlist ? "wishlist-collection" : ""}`}
    >
      {!wishlist && <aside className="filter-sidebar">{filterContent}</aside>}
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
          <button
            className="filter-mobile button outline"
            onClick={() => setFilterOpen(true)}
          >
            <SlidersHorizontal size={17} />
            Filters
          </button>
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
        {Object.values(filters).some((v) => v.length > 0) && (
          <div className="active-filters">
            {Object.entries(filters).flatMap(([k, values]) =>
              values.map((v) => (
                <button key={`${k}-${v}`} onClick={() => toggle(k, v)}>
                  {v} ×
                </button>
              )),
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
                : "Try a different pattern or clear your filters."}
            </p>
            {wishlist ? (
              <Link className="button" href="/shop">
                Explore the drop
              </Link>
            ) : (
              <button className="button" onClick={clear}>
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
      <Modal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        label="product filters"
        className="filters-drawer"
      >
        {filterContent}
        <button className="button full" onClick={() => setFilterOpen(false)}>
          Show finds <ArrowRight size={18} />
        </button>
      </Modal>
    </section>
  );
}
