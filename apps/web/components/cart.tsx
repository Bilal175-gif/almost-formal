"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useStore } from "@/lib/store";
import { api, type Settings } from "@/lib/api";
import { money } from "../../../packages/shared";
export function CartContents({ drawer = false }: { drawer?: boolean }) {
  const s = useStore();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/settings"),
  });
  const subtotal = s.items.reduce(
    (n, i) => n + i.product.price * i.quantity,
    0,
  );
  return (
    <div className="cart-content">
      <h2>Your Bag ({s.items.reduce((n, i) => n + i.quantity, 0)})</h2>
      {s.items.length === 0 ? (
        <div className="empty-state">
          <ShoppingBag size={48} strokeWidth={1} />
          <h3>A good story starts with a find.</h3>
          <p>Your bag is waiting for something with character.</p>
          <Link
            className="button"
            href="/shop"
            onClick={() => s.setCart(false)}
          >
            Explore the drop <ArrowRight size={18} />
          </Link>
        </div>
      ) : (
        <>
          <p className="subtle">One-of-one pieces. Just for you.</p>
          <div className="cart-items">
            {s.items.map(({ product: p, quantity }) => (
              <div className="cart-item" key={p.id}>
                <Link
                  href={`/product/${p.slug}`}
                  onClick={() => s.setCart(false)}
                >
                  <img src={p.images[0]?.url} alt={p.title} />
                </Link>
                <div>
                  <Link
                    href={`/product/${p.slug}`}
                    onClick={() => s.setCart(false)}
                  >
                    {p.title}
                  </Link>
                  <strong>{money(p.price)}</strong>
                  <div className="quantity">
                    <button
                      aria-label={`Decrease ${p.title} quantity`}
                      onClick={() => s.quantity(p.id, quantity - 1)}
                      disabled={quantity === 1}
                    >
                      <Minus size={14} />
                    </button>
                    <span>{quantity}</span>
                    <button
                      aria-label={`Increase ${p.title} quantity`}
                      onClick={() => s.quantity(p.id, quantity + 1)}
                      disabled={quantity >= p.stock}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Remove ${p.title}`}
                  onClick={() => s.remove(p.id)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          <label className="sr-only" htmlFor={`note-${drawer}`}>
            Order note
          </label>
          <textarea
            id={`note-${drawer}`}
            rows={2}
            maxLength={1000}
            placeholder="Add a note (optional)"
            value={s.note}
            onChange={(e) => s.setNote(e.target.value)}
          />
          <div className="totals">
            <div>
              <strong>Subtotal</strong>
              <strong>{money(subtotal)}</strong>
            </div>
            <div>
              <span>Delivery estimate</span>
              <span>
                {settings ? money(settings.shipping) : "Calculated at checkout"}
              </span>
            </div>
          </div>
          <Link
            className="button full"
            href="/checkout"
            onClick={() => s.setCart(false)}
          >
            Proceed to Checkout <ArrowRight size={19} />
          </Link>
          <p className="tiny center">
            Cash on delivery · Carefully packed with love
          </p>
          {drawer && (
            <Link
              className="text-link center"
              href="/cart"
              onClick={() => s.setCart(false)}
            >
              View your bag
            </Link>
          )}
        </>
      )}
    </div>
  );
}
