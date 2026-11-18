"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "../../../packages/shared";
type Item = { product: Product; quantity: number };
type Store = {
  items: Item[];
  wishlist: string[];
  cartOpen: boolean;
  menuOpen: boolean;
  toast: string;
  note: string;
  add: (p: Product) => void;
  remove: (id: string) => void;
  quantity: (id: string, n: number) => void;
  toggleWish: (id: string) => void;
  setCart: (open: boolean) => void;
  setMenu: (open: boolean) => void;
  notify: (text: string) => void;
  setNote: (text: string) => void;
  clear: () => void;
};
export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      items: [],
      wishlist: [],
      cartOpen: false,
      menuOpen: false,
      toast: "",
      note: "",
      add: (p) => {
        if (p.stock < 1)
          return get().notify("This find has already found a new home.");
        const existing = get().items.find((i) => i.product.id === p.id);
        if (existing && existing.quantity >= p.stock)
          return get().notify(
            "One of one — this piece is already in your bag.",
          );
        set({
          items: existing
            ? get().items.map((i) =>
                i.product.id === p.id ? { ...i, quantity: i.quantity + 1 } : i,
              )
            : [...get().items, { product: p, quantity: 1 }],
          cartOpen: true,
        });
      },
      remove: (id) =>
        set({ items: get().items.filter((i) => i.product.id !== id) }),
      quantity: (id, n) =>
        set({
          items: get().items.map((i) =>
            i.product.id === id
              ? { ...i, quantity: Math.max(1, Math.min(n, i.product.stock)) }
              : i,
          ),
        }),
      toggleWish: (id) =>
        set({
          wishlist: get().wishlist.includes(id)
            ? get().wishlist.filter((x) => x !== id)
            : [...get().wishlist, id],
        }),
      setCart: (cartOpen) => set({ cartOpen }),
      setMenu: (menuOpen) => set({ menuOpen }),
      notify: (toast) => set({ toast }),
      setNote: (note) => set({ note }),
      clear: () => set({ items: [], note: "" }),
    }),
    {
      name: "almost-formal-bag-v1",
      partialize: (s) => ({
        items: s.items,
        wishlist: s.wishlist,
        note: s.note,
      }),
    },
  ),
);
