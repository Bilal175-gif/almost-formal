"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ArrowLeft, Check, Truck, ShoppingBag } from "lucide-react";
import {
  addressSchema,
  type AddressInput,
  money,
} from "../../../packages/shared";
import { api, type Settings } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ErrorBox } from "./ui";
import { Smile } from "./doodles";
export type Order = {
  id: string;
  number: string;
  accessToken: string;
  status: string;
  subtotal: number;
  shipping: number;
  total: number;
  createdAt: string;
  note: string;
  address: AddressInput;
  items: {
    id: string;
    title: string;
    price: number;
    quantity: number;
    image: string;
  }[];
  shipment: { carrier: string | null; trackingNumber: string | null } | null;
  payment: { method: string; status: string } | null;
};
export function Checkout() {
  const s = useStore();
  const cache = useQueryClient();
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [address, setAddress] = useState<AddressInput | null>(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const key = useRef("");
  const { data: settings, error: settingsError } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/settings"),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddressInput>({ resolver: zodResolver(addressSchema) });
  useEffect(() => {
    setHydrated(true);
    try {
      const saved = localStorage.getItem("af-delivery-address");
      if (saved) {
        const parsed = addressSchema.safeParse(JSON.parse(saved));
        if (parsed.success) {
          reset(parsed.data);
          setSaveAddress(true);
        }
      }
    } catch {}
  }, [reset]);
  const subtotal = s.items.reduce(
    (n, i) => n + i.product.price * i.quantity,
    0,
  );
  async function placeOrder() {
    if (!address || !settings || busy) return;
    setBusy(true);
    setError("");
    const base = {
      address,
      items: s.items.map((i) => ({
        productId: i.product.id,
        quantity: i.quantity,
      })),
      note: s.note,
      paymentMethod: "cod",
    };
    const fingerprint = JSON.stringify(base);
    let idempotencyKey = key.current;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("af-checkout-attempt") || "null",
      );
      if (saved?.fingerprint === fingerprint)
        idempotencyKey = saved.idempotencyKey;
      else idempotencyKey = crypto.randomUUID();
      sessionStorage.setItem(
        "af-checkout-attempt",
        JSON.stringify({ fingerprint, idempotencyKey }),
      );
      key.current = idempotencyKey;
      const result = await api<Order>("/orders", {
        method: "POST",
        body: JSON.stringify({ ...base, idempotencyKey }),
      });
      setOrder(result);
      s.clear();
      sessionStorage.removeItem("af-checkout-attempt");
      localStorage.setItem(
        "af-last-order",
        JSON.stringify({ number: result.number, token: result.accessToken }),
      );
      await cache.invalidateQueries({ queryKey: ["products"] });
      await cache.invalidateQueries({ queryKey: ["featured"] });
      await cache.invalidateQueries({ queryKey: ["product"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!hydrated)
    return (
      <section className="checkout-page paper">
        <p>Getting your bag ready…</p>
      </section>
    );
  if (order)
    return (
      <section className="checkout-page paper">
        <div className="order-confirmation">
          <Smile />
          <span className="eyebrow">A NEW CHAPTER STARTS HERE.</span>
          <h1>Good choice. Great story.</h1>
          <p>
            Your order <strong>{order.number}</strong> has been saved. Your
            one-of-one finds are reserved for you.
          </p>
          <p>
            Pay <strong>{money(order.total)}</strong> by cash on delivery.
          </p>
          <div className="tracking-code">
            <small>
              Save your private order access code. You’ll need it to track your
              order:
            </small>
            <code>{order.accessToken}</code>
            <button
              className="text-link"
              onClick={() => {
                void navigator.clipboard
                  .writeText(`${order.number}\n${order.accessToken}`)
                  .then(() => s.notify("Order details copied."))
                  .catch(() =>
                    s.notify("Please select and copy your order details."),
                  );
              }}
            >
              Copy order details
            </button>
          </div>
          <Link className="button" href="/order-tracking">
            Track your order <ArrowRight size={18} />
          </Link>
          <Link className="text-link center" href="/shop">
            Keep exploring
          </Link>
        </div>
      </section>
    );
  if (!s.items.length)
    return (
      <section className="checkout-page paper empty-state">
        <ShoppingBag size={45} />
        <h1>Your bag is waiting.</h1>
        <p>Add a little character before checking out.</p>
        <Link className="button" href="/shop">
          Shop the drop <ArrowRight size={18} />
        </Link>
      </section>
    );
  return (
    <section className="checkout-page paper">
      <header className="checkout-header">
        <span className="eyebrow">
          ONE LAST THING BEFORE YOUR NEXT CHAPTER.
        </span>
        <h1>Make it yours.</h1>
        <p>A few details, and your finds are on their way to a new story.</p>
      </header>
      <div className="checkout-layout">
        <div>
          <nav className="checkout-steps" aria-label="Checkout progress">
            {["Details", "Delivery", "Payment", "Review"].map((label, i) => (
              <button
                type="button"
                className={`checkout-step ${step >= i ? "active" : ""}`}
                key={label}
                disabled={i > step || busy}
                onClick={() => setStep(i)}
                aria-current={step === i ? "step" : undefined}
              >
                <span>{step > i ? <Check size={14} /> : i + 1}</span>
                {label}
              </button>
            ))}
          </nav>
          {settingsError && <ErrorBox message={settingsError.message} />}
          <div role="status">{error && <ErrorBox message={error} />}</div>
          {step === 0 && (
            <form
              className="form-stack"
              onSubmit={handleSubmit((data) => {
                setAddress(data);
                if (saveAddress)
                  localStorage.setItem(
                    "af-delivery-address",
                    JSON.stringify(data),
                  );
                else localStorage.removeItem("af-delivery-address");
                setStep(1);
              })}
            >
              <h3>Contact Information</h3>
              {(["name", "email", "phone"] as const).map((name, i) => (
                <label key={name}>
                  {["Full name", "Email address", "Phone number"][i]}
                  <input
                    {...register(name)}
                    aria-label={
                      ["Full name", "Email address", "Phone number"][i]
                    }
                    aria-describedby={
                      errors[name] ? `${name}-error` : undefined
                    }
                    placeholder={["Full Name", "Email", "Phone Number"][i]}
                    type={
                      name === "email"
                        ? "email"
                        : name === "phone"
                          ? "tel"
                          : "text"
                    }
                    autoComplete={
                      name === "name"
                        ? "name"
                        : name === "phone"
                          ? "tel"
                          : "email"
                    }
                    aria-invalid={!!errors[name]}
                  />
                  {errors[name] && (
                    <span id={`${name}-error`} className="field-error">
                      {errors[name]?.message}
                    </span>
                  )}
                </label>
              ))}
              <h3>Delivery Address</h3>
              <label>
                Street address
                <input
                  aria-label="Street address"
                  {...register("line1")}
                  autoComplete="street-address"
                  placeholder="House, street, area"
                  aria-invalid={!!errors.line1}
                />
                {errors.line1 && (
                  <span className="field-error">{errors.line1.message}</span>
                )}
              </label>
              <div className="form-row">
                <label>
                  City
                  <input
                    aria-label="City"
                    {...register("city")}
                    autoComplete="address-level2"
                    placeholder="City"
                  />
                  {errors.city && (
                    <span className="field-error">{errors.city.message}</span>
                  )}
                </label>
                <label>
                  Province
                  <select
                    aria-label="Province"
                    {...register("state")}
                    autoComplete="address-level1"
                  >
                    <option value="">Select province</option>
                    {[
                      "Punjab",
                      "Sindh",
                      "Khyber Pakhtunkhwa",
                      "Balochistan",
                      "Islamabad Capital Territory",
                      "Gilgit-Baltistan",
                      "Azad Kashmir",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                  {errors.state && (
                    <span className="field-error">{errors.state.message}</span>
                  )}
                </label>
              </div>
              <label>
                Postal code
                <input
                  aria-label="Postal code"
                  {...register("postalCode")}
                  placeholder="Postal Code"
                  autoComplete="postal-code"
                  inputMode="numeric"
                />
                {errors.postalCode && (
                  <span className="field-error">
                    {errors.postalCode.message}
                  </span>
                )}
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={saveAddress}
                  onChange={(e) => setSaveAddress(e.target.checked)}
                />
                Save this address on this device
              </label>
              <button className="button full" type="submit">
                Continue to Delivery <ArrowRight size={18} />
              </button>
            </form>
          )}
          {step === 1 && (
            <div className="form-stack">
              <h3>A little journey to your door.</h3>
              <label className="shipping-choice">
                <input type="radio" checked readOnly name="delivery" />
                <div>
                  <strong>
                    Standard delivery <Truck size={18} />
                  </strong>
                  <p>Carefully packed to keep your vintage find safe.</p>
                  <p>
                    Dispatch and delivery timing will be confirmed by the store.
                  </p>
                </div>
                <strong>
                  {settings ? money(settings.shipping) : "Loading…"}
                </strong>
              </label>
              <p className="subtle">
                Delivering to {address?.name}, {address?.line1}, {address?.city}
                .
              </p>
              <Link className="text-link" href="/shipping-policy">
                Read our draft shipping policy
              </Link>
              <div className="step-actions">
                <button className="text-link" onClick={() => setStep(0)}>
                  <ArrowLeft size={16} />
                  Back
                </button>
                <button
                  className="button"
                  disabled={!settings}
                  onClick={() => setStep(2)}
                >
                  Continue to Payment <ArrowRight size={17} />
                </button>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="form-stack">
              <h3>Payment, kept simple.</h3>
              {settings?.codEnabled ? (
                <label className="shipping-choice">
                  <input type="radio" checked readOnly name="payment" />
                  <div>
                    <strong>Cash on Delivery</strong>
                    <p>
                      Pay {money(subtotal + settings.shipping)} when your order
                      arrives. No online payment will be taken.
                    </p>
                  </div>
                </label>
              ) : (
                <ErrorBox message="Cash on delivery is currently unavailable. Please contact the store." />
              )}
              <div className="step-actions">
                <button className="text-link" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} />
                  Back
                </button>
                <button
                  className="button"
                  disabled={!settings?.codEnabled}
                  onClick={() => setStep(3)}
                >
                  Review your order <ArrowRight size={17} />
                </button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="form-stack">
              <h3>Everything look right?</h3>
              <p>
                <strong>{address?.name}</strong>
                <br />
                {address?.email}
                <br />
                {address?.phone}
                <br />
                {address?.line1}
                <br />
                {address?.city}, {address?.state} {address?.postalCode}
              </p>
              <button className="text-link" onClick={() => setStep(0)}>
                Edit delivery details
              </button>
              <p className="subtle">
                Cash on delivery ·{" "}
                {settings ? money(subtotal + settings.shipping) : ""}
              </p>
              {s.note && <p className="subtle">Your note: {s.note}</p>}
              <p className="tiny">
                By placing this order you acknowledge the{" "}
                <Link className="text-link" href="/terms-and-conditions">
                  draft terms
                </Link>{" "}
                and{" "}
                <Link className="text-link" href="/returns-policy">
                  returns policy
                </Link>
                . This store currently contains demo inventory.
              </p>
              <div className="step-actions">
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() => setStep(2)}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <button
                  className="button"
                  disabled={busy || !settings?.codEnabled}
                  onClick={() => void placeOrder()}
                >
                  {busy
                    ? "Saving your order…"
                    : "Place order — Cash on Delivery"}
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          )}
        </div>
        <aside className="order-summary">
          <h2>Your good finds</h2>
          {s.items.map(({ product: p, quantity }) => (
            <div className="cart-item" key={p.id}>
              <Link href={`/product/${p.slug}`}>
                <img src={p.images[0]?.url} alt={p.title} />
              </Link>
              <div>
                <Link href={`/product/${p.slug}`}>{p.title}</Link>
                <strong>{money(p.price * quantity)}</strong>
                <small className="tiny">Qty: {quantity}</small>
              </div>
            </div>
          ))}
          <div className="totals">
            <div>
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            <div>
              <span>Delivery</span>
              <span>{settings ? money(settings.shipping) : "Loading…"}</span>
            </div>
          </div>
          <div className="summary-total">
            <span>Total</span>
            <span>{settings ? money(subtotal + settings.shipping) : "…"}</span>
          </div>
          <p className="tiny center">
            One-of-one pieces. Reserved after order confirmation.
          </p>
          <Link className="text-link center" href="/cart">
            Edit your bag
          </Link>
        </aside>
      </div>
    </section>
  );
}
