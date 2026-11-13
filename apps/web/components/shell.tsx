"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  Menu,
  Search,
  ShoppingBag,
  Home,
  Heart,
  UserRound,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import { Star, Smile } from "./doodles";
import { Modal, Toast } from "./ui";
import { CartContents } from "./cart";
const links = [
  ["Shop", "/shop"],
  ["Our story", "/our-story"],
  ["Contact", "/contact"],
];
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Almost Formal home">
      <img src="/images/almost-formal-logo-2026.webp" alt="Almost Formal" width={80} height={72} />
    </Link>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const s = useStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="site-wrap">
        <header className="header paper">
          <button
            className="icon-button mobile-menu-button"
            onClick={() => s.setMenu(true)}
            aria-label="Open menu"
          >
            <Menu />
          </button>
          <div className="brand-wrap">
            <Star />
            <Brand />
          </div>
          <nav className="desktop-nav" aria-label="Main navigation">
            {links.map(([label, href]) => (
              <Link
                className={pathname === href ? "active" : ""}
                key={href}
                href={href}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <Link
              className="icon-button desktop-wish"
              href="/wishlist"
              aria-label="Wishlist"
            >
              <Heart size={20} />
            </Link>
            <button
              className="icon-button"
              aria-label="Search products"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={22} />
            </button>
            <button
              className="bag-button"
              onClick={() => s.setCart(true)}
              aria-label={`Open bag, ${s.items.reduce((n, i) => n + i.quantity, 0)} items`}
            >
              <ShoppingBag size={19} />
              <span>({s.items.reduce((n, i) => n + i.quantity, 0)})</span>
            </button>
          </div>
        </header>
        <main id="main">{children}</main>
        <Newsletter />
        <footer className="footer paper">
          <div>
            <Brand />
          </div>
          <div>
            <h3>The good stuff</h3>
            <Link href="/shop">Shop the drop</Link>
            <Link href="/our-story">Our story</Link>
            <Link href="/care-guide">Care guide</Link>
          </div>
          <div>
            <h3>Here to help</h3>
            <Link href="/contact">Contact</Link>
            <Link href="/faq">FAQs</Link>
            <Link href="/order-tracking">Track your order</Link>
            <Link href="/shipping-policy">Shipping & delivery</Link>
            <Link href="/returns-policy">Returns</Link>
          </div>
          <div className="footer-note">
            <Smile />
            <span>
              Good ties.
              <br />
              Happier people.
            </span>
          </div>
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} Almost Formal. Dress your way.
            </span>
            <div>
              <Link href="/privacy-policy">Privacy</Link>
              <Link href="/terms-and-conditions">Terms</Link>
              <Link href="/admin">Store admin</Link>
            </div>
          </div>
        </footer>
      </div>
      <nav className="mobile-bottom" aria-label="Mobile navigation">
        <Link className={pathname === "/" ? "active" : ""} href="/">
          <Home size={21} />
          <span>Home</span>
        </Link>
        <Link
          className={pathname.startsWith("/shop") ? "active" : ""}
          href="/shop"
        >
          <ShoppingBag size={21} />
          <span>Shop</span>
        </Link>
        <button onClick={() => s.setCart(true)}>
          <ShoppingBag size={21} />
          <span>Bag {s.items.length ? `(${s.items.length})` : ""}</span>
        </button>
        <Link href="/wishlist">
          <Heart size={21} />
          <span>Saved</span>
        </Link>
        <Link href="/order-tracking">
          <UserRound size={21} />
          <span>My orders</span>
        </Link>
      </nav>
      <Modal
        open={s.menuOpen}
        onClose={() => s.setMenu(false)}
        label="navigation"
        className="menu-drawer"
      >
        <Smile />
        <nav>
          {[...links.slice(0, 2), ["Care guide", "/care-guide"], links[2]].map(
            ([label, href]) => (
              <Link onClick={() => s.setMenu(false)} key={href} href={href}>
                <span>÷</span>
                {label}
                <Star />
              </Link>
            ),
          )}
        </nav>
        <div className="sticky-note">
          GOOD TIES
          <br />
          HAPPIER
          <br />
          PEOPLE <Heart />
        </div>
        <div className="menu-social">
          <a href="https://www.instagram.com/almost.formal/" target="_blank" rel="noreferrer">
            Instagram @almost.formal <ArrowRight size={18} />
          </a>
        </div>
      </Modal>
      <Modal
        open={s.cartOpen}
        onClose={() => s.setCart(false)}
        label="shopping bag"
        className="cart-drawer"
      >
        <CartContents drawer />
      </Modal>
      <Modal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        label="product search"
        className="search-modal"
      >
        <h2>Find your next tie.</h2>
        <form
          className="search-input"
          onSubmit={(e) => {
            e.preventDefault();
            setSearchOpen(false);
            router.push(`/shop?search=${encodeURIComponent(search)}`);
          }}
        >
          <Search />
          <input
            autoFocus
            aria-label="Search ties"
            placeholder="Search ties…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="icon-button" aria-label="Submit search">
            <ArrowRight />
          </button>
        </form>
        <p>Try “striped”, “paisley” or “forest”.</p>
      </Modal>
      <Toast />
    </>
  );
}
function Newsletter() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const notify = useStore((s) => s.notify);
  return (
    <section className="newsletter">
      <div>
        <span className="handwriting">A little heads-up?</span>
        <h2>Good finds don’t wait around.</h2>
        <p>Get first dibs on new drops and fresh finds.</p>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          try {
            const r = await api<{ message: string }>("/newsletter", {
              method: "POST",
              body: JSON.stringify({ email }),
            });
            notify(r.message);
            setSubscribed(true);
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="sr-only" htmlFor="newsletter-email">
          Email address
        </label>
        <input
          id="newsletter-email"
          type="email"
          required
          value={email}
          placeholder="Your email address"
          onChange={(e) => setEmail(e.target.value)}
          disabled={subscribed}
        />
        <button className="button" disabled={pending || subscribed}>
          {subscribed
            ? "You’re on the list"
            : pending
              ? "Joining…"
              : "Count me in"}
          <ArrowRight size={18} />
        </button>
      </form>
    </section>
  );
}
