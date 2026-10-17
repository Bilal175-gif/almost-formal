"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, LogOut, Upload, Trash2, Save } from "lucide-react";
import { api, type Settings } from "@/lib/api";
import { useStore } from "@/lib/store";
import { type Product, money } from "../../../packages/shared";
import type { Order } from "./checkout";
import { ErrorBox, Modal } from "./ui";
type Session = { name: string; email: string; csrfToken: string };
type Dashboard = {
  totalOrders: number;
  pending: number;
  completed: number;
  available: number;
  soldOut: number;
  revenue: number;
  recent: Order[];
};
type Category = { id: string; name: string; slug: string };
type Movement = {
  id: string;
  delta: number;
  reason: string;
  createdAt: string;
  product: { title: string; sku: string; stock: number };
};
type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  orders: { id: string; number: string; total: number; status: string }[];
};
const emptyProduct = {
  title: "",
  slug: "",
  sku: "",
  description: "",
  price: 0,
  stock: 1,
  category: "Regular Ties",
  pattern: "Striped",
  color: "Green",
  condition: "Good",
  conditionNote: "",
  flaws: "None noted",
  length: 147,
  width: 9,
  material: null as string | null,
  era: null as string | null,
  featured: false,
  archived: false,
  imageUrls: [] as string[],
};
type Editable = typeof emptyProduct;
export function Admin() {
  const cache = useQueryClient();
  const notify = useStore((s) => s.notify);
  const [tab, setTab] = useState("Overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Editable | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const session = useQuery({
    queryKey: ["admin-session"],
    queryFn: () => api<Session>("/auth/me"),
    retry: false,
  });
  const auth = !!session.data;
  const dashboard = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => api<Dashboard>("/admin/dashboard"),
    enabled: auth && tab === "Overview",
  });
  const products = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => api<Product[]>("/admin/products"),
    enabled: auth && tab === "Products",
  });
  const orders = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => api<Order[]>("/admin/orders"),
    enabled: auth && tab === "Orders",
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Category[]>("/categories"),
    enabled: auth,
  });
  const inventory = useQuery({
    queryKey: ["admin-inventory"],
    queryFn: () => api<Movement[]>("/admin/inventory"),
    enabled: auth && tab === "Inventory",
  });
  const customers = useQuery({
    queryKey: ["admin-customers"],
    queryFn: () => api<Customer[]>("/admin/customers"),
    enabled: auth && tab === "Customers",
  });
  const messages = useQuery({
    queryKey: ["admin-messages"],
    queryFn: () =>
      api<
        {
          id: string;
          name: string;
          email: string;
          message: string;
          createdAt: string;
        }[]
      >("/admin/messages"),
    enabled: auth && tab === "Messages",
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/settings"),
    enabled: auth,
  });
  const headers = { "x-csrf-token": session.data?.csrfToken || "" };
  async function mutate(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      await cache.invalidateQueries();
      notify("Saved.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (session.isPending)
    return (
      <section className="admin-page paper">
        <p>Checking your session…</p>
      </section>
    );
  if (!auth)
    return (
      <section className="admin-page paper">
        <div className="admin-login">
          <span className="eyebrow">BEHIND THE GOOD FINDS.</span>
          <h1>Store sign in</h1>
          <p>For the people giving old ties new stories.</p>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const form = new FormData(e.currentTarget);
              try {
                await api("/auth/login", {
                  method: "POST",
                  body: JSON.stringify(Object.fromEntries(form)),
                });
                await cache.invalidateQueries({ queryKey: ["admin-session"] });
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {error && <ErrorBox message={error} />}
            <button className="button" disabled={busy}>
              {busy ? "Signing in…" : "Sign in securely"}
            </button>
            <p className="tiny">
              Administrator accounts are created by the store operator. There is
              no default password.
            </p>
          </form>
        </div>
      </section>
    );
  const queryError = [
    dashboard.error,
    products.error,
    orders.error,
    inventory.error,
    customers.error,
    messages.error,
  ].find(Boolean);
  return (
    <section className="admin-page paper">
      <div className="admin-header">
        <div>
          <span className="eyebrow">ALMOST FORMAL / STORE STUDIO</span>
          <h1>The good stuff, managed.</h1>
        </div>
        <button
          className="button outline"
          onClick={async () => {
            try {
              await api("/auth/logout", { method: "POST", headers });
              cache.clear();
              await session.refetch();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
      <nav className="admin-tabs">
        {[
          "Overview",
          "Products",
          "Orders",
          "Inventory",
          "Customers",
          "Messages",
          "Settings",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => {
              setTab(t);
              setError("");
            }}
          >
            {t}
          </button>
        ))}
      </nav>
      {(error || queryError) && (
        <ErrorBox message={error || queryError!.message} />
      )}
      {tab === "Overview" && (
        <>
          {dashboard.isPending ? (
            <p>Loading store overview…</p>
          ) : (
            dashboard.data && (
              <>
                <div className="dashboard-stats">
                  {[
                    ["Total orders", dashboard.data.totalOrders],
                    ["Collected revenue", money(dashboard.data.revenue)],
                    ["Pending orders", dashboard.data.pending],
                    ["Completed orders", dashboard.data.completed],
                    ["Available pieces", dashboard.data.available],
                    ["Sold out", dashboard.data.soldOut],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <div className="admin-section-header">
                  <h2>Recent orders</h2>
                  <button
                    className="text-link"
                    onClick={() => setTab("Orders")}
                  >
                    Manage orders →
                  </button>
                </div>
                <OrderTable orders={dashboard.data.recent} />
                <p className="subtle">
                  One-of-one inventory: every available demo piece starts with
                  one unit. Check Inventory for stock changes.
                </p>
              </>
            )
          )}
        </>
      )}
      {tab === "Products" && (
        <>
          <div className="admin-section-header">
            <h2>Your catalogue</h2>
            <button
              className="button"
              onClick={() => {
                setEditId(null);
                setEditor({ ...emptyProduct });
              }}
            >
              <Plus size={17} />
              Add product
            </button>
          </div>
          {products.isPending ? (
            <p>Loading products…</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Product</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Visibility</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.data?.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <img src={p.images[0]?.url} alt={p.title} />
                      </td>
                      <td>
                        <strong>{p.title}</strong>
                        <br />
                        {p.sku}
                      </td>
                      <td>{money(p.price)}</td>
                      <td>{p.stock}</td>
                      <td>
                        {p.archived
                          ? "Archived"
                          : p.stock
                            ? "Available"
                            : "Sold out"}
                        {p.featured ? " · Featured" : ""}
                      </td>
                      <td>
                        <button
                          className="text-link"
                          onClick={() => {
                            setEditId(p.id);
                            setEditor({
                              ...emptyProduct,
                              ...p,
                              imageUrls: p.images.map((i) => i.url),
                            } as Editable);
                          }}
                        >
                          Edit
                        </button>{" "}
                        ·{" "}
                        <button
                          className="text-link"
                          disabled={busy}
                          onClick={() =>
                            void mutate(`/admin/products/${p.id}`, "PATCH", {
                              archived: !p.archived,
                            })
                          }
                        >
                          {p.archived ? "Restore" : "Archive"}
                        </button>{" "}
                        ·{" "}
                        <button
                          className="text-link"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Permanently delete ${p.title}? Products with order history can only be archived.`,
                              )
                            )
                              void mutate(`/admin/products/${p.id}`, "DELETE");
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="admin-section-header">
            <h2>Categories</h2>
          </div>
          <p className="subtle">
            {categories.data?.map((c) => c.name).join(" · ")}
          </p>
          <form
            className="form-row"
            style={{ maxWidth: 500, marginTop: 15 }}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const name = String(new FormData(form).get("name"));
              if (
                await mutate("/admin/categories", "POST", {
                  name,
                  slug: name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, ""),
                })
              )
                form.reset();
            }}
          >
            <input
              aria-label="New category name"
              name="name"
              required
              minLength={2}
              placeholder="New category name"
            />
            <button className="button outline" disabled={busy}>
              Add category
            </button>
          </form>
        </>
      )}
      {tab === "Orders" && (
        <>
          <h2 style={{ marginBottom: 20 }}>The next chapters</h2>
          {orders.isPending ? (
            <p>Loading orders…</p>
          ) : orders.data?.length ? (
            orders.data.map((o) => (
              <AdminOrder
                key={o.id}
                order={o}
                busy={busy}
                update={async (status, trackingNumber, carrier) => {
                  await mutate(`/admin/orders/${o.id}/status`, "PATCH", {
                    status,
                    trackingNumber,
                    carrier,
                  });
                }}
              />
            ))
          ) : (
            <p>No orders yet.</p>
          )}
        </>
      )}
      {tab === "Inventory" && (
        <>
          <div className="admin-section-header">
            <h2>Inventory history</h2>
          </div>
          {inventory.isPending ? (
            <p>Loading inventory…</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Change</th>
                    <th>Current stock</th>
                    <th>Reason</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.data?.map((m) => (
                    <tr key={m.id}>
                      <td>
                        {m.product.title}
                        <br />
                        <small>{m.product.sku}</small>
                      </td>
                      <td>
                        {m.delta > 0 ? "+" : ""}
                        {m.delta}
                      </td>
                      <td>
                        {m.product.stock}
                        {m.product.stock === 1
                          ? " · One left"
                          : m.product.stock === 0
                            ? " · Sold out"
                            : ""}
                      </td>
                      <td>{m.reason}</td>
                      <td>{new Date(m.createdAt).toLocaleString("en-PK")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {tab === "Customers" && (
        <>
          <h2 style={{ marginBottom: 20 }}>People behind the stories</h2>
          {customers.isPending ? (
            <p>Loading customers…</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>City</th>
                    <th>Order history</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.data?.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>
                        {c.email}
                        <br />
                        {c.phone}
                      </td>
                      <td>{c.city}</td>
                      <td>
                        {c.orders.map((o) => (
                          <div key={o.id}>
                            {o.number} · {money(o.total)} · {o.status}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {tab === "Messages" && (
        <>
          <h2 style={{ marginBottom: 20 }}>A little hello</h2>
          {messages.isPending ? (
            <p>Loading messages…</p>
          ) : messages.data?.length ? (
            messages.data.map((m) => (
              <article className="admin-order" key={m.id}>
                <h3>{m.name}</h3>
                <p>
                  {m.email} ·{" "}
                  {new Date(m.createdAt).toLocaleDateString("en-PK")}
                </p>
                <p style={{ whiteSpace: "pre-wrap" }}>{m.message}</p>
              </article>
            ))
          ) : (
            <p>No messages yet.</p>
          )}
        </>
      )}
      {tab === "Settings" && settings.data && (
        <form
          className="form-stack admin-settings"
          key={settings.data.announcement}
          onSubmit={async (e) => {
            e.preventDefault();
            const values = new FormData(e.currentTarget);
            await mutate("/admin/settings", "PATCH", {
              name: values.get("name"),
              email: values.get("email"),
              phone: values.get("phone"),
              instagram: values.get("instagram"),
              shipping: Math.round(Number(values.get("shipping")) * 100),
              announcement: values.get("announcement"),
              codEnabled: values.get("codEnabled") === "on",
            });
          }}
        >
          <h2>Make it your store.</h2>
          {[
            ["name", "Store name"],
            ["email", "Contact email"],
            ["phone", "Contact phone"],
            ["instagram", "Instagram profile URL"],
            ["announcement", "Announcement"],
          ].map(([name, label]) => (
            <label key={name}>
              {label}
              <input
                name={name}
                defaultValue={String(settings.data![name as keyof Settings])}
                type={
                  name === "email"
                    ? "email"
                    : name === "instagram"
                      ? "url"
                      : "text"
                }
              />
            </label>
          ))}
          <label>
            Shipping charge (PKR)
            <input
              name="shipping"
              type="number"
              min={0}
              step={1}
              defaultValue={settings.data.shipping / 100}
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              name="codEnabled"
              defaultChecked={settings.data.codEnabled}
            />
            Enable cash on delivery
          </label>
          <button className="button" disabled={busy}>
            <Save size={17} />
            {busy ? "Saving…" : "Save settings"}
          </button>
        </form>
      )}
      <Modal
        open={!!editor}
        onClose={() => {
          if (!busy) setEditor(null);
        }}
        label={editId ? "edit product" : "add product"}
        className="product-editor"
      >
        {editor && (
          <ProductEditor
            initial={editor}
            saveError={error}
            categories={categories.data || []}
            csrf={headers}
            busy={busy}
            onSave={async (data) => {
              if (
                await mutate(
                  editId ? `/admin/products/${editId}` : "/admin/products",
                  editId ? "PATCH" : "POST",
                  data,
                )
              )
                setEditor(null);
            }}
          />
        )}
      </Modal>
    </section>
  );
}
function OrderTable({ orders }: { orders: Order[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.number}</td>
              <td>{o.address.name}</td>
              <td>{money(o.total)}</td>
              <td>
                <span className="status-badge">{o.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!orders.length && <p style={{ padding: "20px 0" }}>No orders yet.</p>}
    </div>
  );
}
function AdminOrder({
  order: o,
  busy,
  update,
}: {
  order: Order;
  busy: boolean;
  update: (
    status: string,
    tracking?: string,
    carrier?: string,
  ) => Promise<void>;
}) {
  const [tracking, setTracking] = useState(o.shipment?.trackingNumber || "");
  const [carrier, setCarrier] = useState(o.shipment?.carrier || "");
  const next: Record<string, string> = {
    pending: "confirmed",
    confirmed: "packed",
    packed: "shipped",
    shipped: "delivered",
  };
  return (
    <article className="admin-order">
      <header>
        <h3>{o.number}</h3>
        <span className="status-badge">{o.status}</span>
        <strong>{money(o.total)}</strong>
      </header>
      <p>
        <strong>{o.address.name}</strong> · {o.address.email} ·{" "}
        {o.address.phone}
      </p>
      <p>
        {o.address.line1}, {o.address.city}, {o.address.state}{" "}
        {o.address.postalCode}
      </p>
      <p>{o.items.map((i) => `${i.title} × ${i.quantity}`).join(" · ")}</p>
      {o.note && <p>Note: {o.note}</p>}
      <p>Cash on delivery · {o.payment?.status}</p>
      {o.status === "packed" && (
        <div className="form-row">
          <input
            aria-label="Courier name"
            placeholder="Courier name"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
          />
          <input
            aria-label="Tracking number"
            placeholder="Tracking number (required)"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
          />
        </div>
      )}
      {o.shipment?.trackingNumber && (
        <p>
          Tracking: {o.shipment.carrier} {o.shipment.trackingNumber}
        </p>
      )}
      <div className="admin-order-actions">
        {next[o.status] && (
          <button
            className="button"
            disabled={busy || (o.status === "packed" && !tracking.trim())}
            onClick={() =>
              void update(
                next[o.status],
                tracking || undefined,
                carrier || undefined,
              )
            }
          >
            Mark {next[o.status]}
          </button>
        )}
        {["pending", "confirmed", "packed"].includes(o.status) && (
          <button
            className="button outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Cancel this order and restore its stock?"))
                void update("cancelled");
            }}
          >
            Cancel & restore stock
          </button>
        )}
      </div>
    </article>
  );
}
function ProductEditor({
  initial,
  categories,
  csrf,
  busy,
  onSave,
  saveError,
}: {
  saveError: string;
  initial: Editable;
  categories: Category[];
  csrf: Record<string, string>;
  busy: boolean;
  onSave: (data: Editable) => Promise<void>;
}) {
  const [urls, setUrls] = useState(initial.imageUrls);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <h2>{initial.title ? "Edit this find" : "A new story for the shop."}</h2>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (!urls.length) {
            setError("Upload at least one product image.");
            return;
          }
          const f = new FormData(e.currentTarget);
          const data = {
            ...emptyProduct,
            ...Object.fromEntries(f),
            price: Math.round(Number(f.get("price")) * 100),
            stock: Number(f.get("stock")),
            length: Number(f.get("length")),
            width: Number(f.get("width")),
            material: String(f.get("material") || "") || null,
            era: String(f.get("era") || "") || null,
            featured: f.get("featured") === "on",
            archived: initial.archived,
            imageUrls: urls,
          } as Editable;
          await onSave(data);
        }}
      >
        <div className="form-row">
          <label>
            Product title
            <input
              name="title"
              required
              minLength={2}
              defaultValue={initial.title}
            />
          </label>
          <label>
            URL slug
            <input
              name="slug"
              required
              pattern="[a-z0-9-]+"
              placeholder="forest-club-tie"
              defaultValue={initial.slug}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            SKU
            <input name="sku" required defaultValue={initial.sku} />
          </label>
          <label>
            Category
            <select name="category" defaultValue={initial.category}>
              {categories.map((c) => (
                <option key={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Description
          <textarea
            name="description"
            required
            minLength={10}
            defaultValue={initial.description}
          />
        </label>
        <div className="form-row">
          <label>
            Price (PKR)
            <input
              name="price"
              required
              type="number"
              min={1}
              step={1}
              defaultValue={initial.price / 100}
            />
          </label>
          <label>
            Available quantity
            <input
              name="stock"
              required
              type="number"
              min={0}
              max={10000}
              defaultValue={initial.stock}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Pattern
            <select name="pattern" defaultValue={initial.pattern}>
              {[
                "Striped",
                "Paisley",
                "Geometric",
                "Floral",
                "Solid",
                "Novelty",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Color
            <select name="color" defaultValue={initial.color}>
              {[
                "Green",
                "Red",
                "Blue",
                "Yellow",
                "Brown",
                "Multicolor",
                "Black",
                "Pink",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Condition
          <select name="condition" defaultValue={initial.condition}>
            {["Excellent", "Good", "Worn (character)"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Condition description
          <input
            name="conditionNote"
            required
            defaultValue={initial.conditionNote}
          />
        </label>
        <label>
          Visible flaws
          <input name="flaws" required defaultValue={initial.flaws} />
        </label>
        <div className="form-row">
          <label>
            Length (cm)
            <input
              name="length"
              type="number"
              step="0.1"
              min="0.1"
              required
              defaultValue={initial.length}
            />
          </label>
          <label>
            Width (cm)
            <input
              name="width"
              type="number"
              step="0.1"
              min="0.1"
              required
              defaultValue={initial.width}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Verified material (leave blank if unknown)
            <input name="material" defaultValue={initial.material || ""} />
          </label>
          <label>
            Verified era (leave blank if unknown)
            <input name="era" defaultValue={initial.era || ""} />
          </label>
        </div>
        <label className="check-label">
          <input
            name="featured"
            type="checkbox"
            defaultChecked={initial.featured}
          />
          Feature on the homepage
        </label>
        <div>
          <h3>Product photographs</h3>
          <div className="editor-images">
            {urls.map((url, i) => (
              <div key={url}>
                <img src={url} alt={`Product image ${i + 1}`} />
                <button
                  type="button"
                  aria-label={`Remove image ${i + 1}`}
                  onClick={() => setUrls(urls.filter((_, n) => n !== i))}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <label>
            <Upload size={18} />
            {uploading ? "Uploading…" : "Add JPEG, PNG or WebP (max 5 MB)"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading || urls.length >= 8}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const form = new FormData();
                form.append("image", file);
                setUploading(true);
                setError("");
                try {
                  const result = await api<{ url: string }>("/admin/uploads", {
                    method: "POST",
                    headers: csrf,
                    body: form,
                  });
                  setUrls((prev) => [...prev, result.url]);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
        </div>
        {(error || saveError) && <ErrorBox message={error || saveError} />}
        <button className="button full" disabled={busy || uploading}>
          <Save size={17} />
          {busy ? "Saving…" : "Save product"}
        </button>
      </form>
    </>
  );
}
