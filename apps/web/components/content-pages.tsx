"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Mail, Phone } from "lucide-react";
import { api, type Settings } from "@/lib/api";
import { money } from "../../../packages/shared";
import { useStore } from "@/lib/store";
import { Smile } from "./doodles";
import { ErrorBox } from "./ui";
import type { Order } from "./checkout";
export const infoPages: Record<
  string,
  {
    title: string;
    eyebrow: string;
    intro: string;
    sections: [string, string][];
    draft?: boolean;
  }
> = {
  "our-story": {
    title: "Just ties. But different.",
    eyebrow: "OUR STORY",
    intro:
      "Almost Formal started with a simple idea — great style doesn’t need to be brand new. The best pieces often already have a story. We’re here to help them find their next one.",
    sections: [
      [
        "A little history. A lot of character.",
        "We look for the unexpected: a rich paisley, a beautifully faded stripe, a color you didn’t know you needed. Every find is chosen for the small details that make it its own.",
      ],
      [
        "One of one, for a reason.",
        "These are pre-loved pieces, with their own quirks and histories. We describe the condition honestly, photograph the details and let each tie speak for itself.",
      ],
      [
        "Same ties. Different stories.",
        "For the everyday, the almost occasion, or just because. Wear it your way. A second life looks good on you.",
      ],
    ],
  },
  "why-thrift": {
    title: "Good style. A second life.",
    eyebrow: "WHY THRIFT?",
    intro:
      "Some things get better with a little history. Thrifting is about finding what speaks to you and making the most of what already exists.",
    sections: [
      [
        "Sustainable choices",
        "Choosing a pre-loved piece keeps an existing item in use. Care for it, wear it often and pass it on when its next chapter comes.",
      ],
      [
        "Unique finds",
        "A vintage pattern or an unusual weave can make an everyday outfit feel like your own. Our one-of-one finds are selected individually.",
      ],
      [
        "Better quality, more character",
        "We look closely at construction and condition. Age alone doesn’t guarantee quality, so the details on every product page matter.",
      ],
      [
        "Less waste, more wear",
        "A small wardrobe of pieces you love is a good place to start. Repair when you can. Reuse what you have. Thrift. Wear. Repeat.",
      ],
    ],
  },
  "care-guide": {
    title: "Keep the story going.",
    eyebrow: "THE CARE GUIDE",
    intro:
      "A little care goes a long way. Vintage fabrics deserve a gentle touch, especially when their fiber content is unknown.",
    sections: [
      [
        "After wearing",
        "Undo the knot carefully instead of pulling the narrow end through. Let the tie rest, then hang it loosely or roll it without creasing.",
      ],
      [
        "Cleaning",
        "Follow any original care label. Avoid machine washing or spot treatments on delicate or unverified fabrics; consult an experienced professional cleaner first.",
      ],
      [
        "Creases & storage",
        "Store away from moisture and direct sunlight. Avoid placing a hot iron directly on vintage fabric. Ask a professional about safe pressing for your particular piece.",
      ],
      [
        "A note on materials",
        "We list a material or era only when verified. If it’s unknown, treat the piece as delicate and ask before cleaning.",
      ],
    ],
  },
  "shipping-policy": {
    title: "A little journey to your door.",
    eyebrow: "SHIPPING & DELIVERY",
    intro:
      "This is draft store information for development. Shipping regions, dispatch timelines, carriers and delivery commitments have not yet been approved by the business.",
    draft: true,
    sections: [
      [
        "Delivery charges",
        "The configured delivery charge is calculated at checkout before an order is placed. Any free-shipping thresholds or regional exceptions must be confirmed by the store before launch.",
      ],
      [
        "Dispatch & tracking",
        "Once an administrator marks an order shipped and adds a tracking number, those details appear in the private order tracking page. A delivery estimate is not yet promised.",
      ],
      [
        "Before launch",
        "The store owner must confirm service areas, handling times, courier arrangements, failed-delivery handling and contact details. Do not treat this draft as a confirmed service commitment.",
      ],
    ],
  },
  "returns-policy": {
    title: "Let’s make it right.",
    eyebrow: "RETURNS & EXCHANGES",
    intro:
      "Draft content — the business has not approved a returns or refund policy. Review the condition and visible flaws on each product page before placing a demo order.",
    draft: true,
    sections: [
      [
        "Vintage condition",
        "Pre-loved pieces may show signs of age. Each listing records known condition details and flaws; these need physical verification before real inventory is sold.",
      ],
      [
        "Something isn’t right?",
        "Use the contact form and include your order number and a description of the issue. Never post your private order access code publicly.",
      ],
      [
        "Pending business decisions",
        "Return windows, eligibility, return shipping costs, refund methods and treatment of damaged or incorrect orders must be approved before launch. No specific refund outcome is promised by this draft.",
      ],
    ],
  },
  "privacy-policy": {
    title: "Your details, handled with care.",
    eyebrow: "PRIVACY POLICY",
    intro:
      "Draft privacy information. This describes the implemented development application and needs business and jurisdiction-specific review before public launch.",
    draft: true,
    sections: [
      [
        "Information used by the store",
        "Checkout stores your contact information, delivery address and order details. Contact form messages and newsletter signups are saved for the store team. Administrators can view customer information.",
      ],
      [
        "Browser storage",
        "Your bag and saved finds are stored in your browser. If you choose to save an address, that address is stored on the device. The last order access code is saved locally for tracking. Clear browser storage on a shared device.",
      ],
      [
        "Administration",
        "Administrator sessions use an HTTP-only cookie. Passwords are hashed. Retention periods, data request procedures and business contact information must be approved and added before launch.",
      ],
    ],
  },
  "terms-and-conditions": {
    title: "The small print.",
    eyebrow: "TERMS & CONDITIONS",
    intro:
      "Draft terms for a development store. The catalogue currently includes demo inventory and generated product imagery. These terms are not approved for commercial use.",
    draft: true,
    sections: [
      [
        "Products & pricing",
        "Prices are displayed in Pakistani rupees. A product’s current price, availability and configured delivery charge are checked on the server when an order is submitted.",
      ],
      [
        "Orders & payment",
        "The application supports cash on delivery only. An order confirmation means an order has been saved and stock deducted. Online payment processing is not enabled.",
      ],
      [
        "Before real-world sales",
        "The owner must approve business identification, contact details, fulfillment commitments, consumer terms, policies and dispute procedures, and replace demo products with verified stock.",
      ],
    ],
  },
};
export function InfoPage({ slug }: { slug: string }) {
  const page = infoPages[slug];
  return (
    <section className="content-page paper">
      <article className="editorial">
        <span className="eyebrow">{page.eyebrow}</span>
        {page.draft && (
          <span className="draft-label">DRAFT — pending business approval</span>
        )}
        <h1>{page.title}</h1>
        <p>{page.intro}</p>
        {page.sections.map(([heading, text]) => (
          <section key={heading}>
            <h2>{heading}</h2>
            <p>{text}</p>
          </section>
        ))}
        {!page.draft && (
          <>
            <p className="handwriting">Not overdressed. Just right.</p>
            <Link className="button" href="/shop">
              Find your next story <ArrowRight size={18} />
            </Link>
          </>
        )}
      </article>
    </section>
  );
}
export function Contact() {
  const notify = useStore((s) => s.notify);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/settings"),
  });
  return (
    <section className="content-page paper">
      <div className="contact-layout">
        <div>
          <span className="eyebrow">GOOD CONVERSATIONS START HERE.</span>
          <h1>Say hello.</h1>
          <p>
            A question about a find? A story to share? We’d love to hear it.
          </p>
          {data?.email && (
            <p>
              <a className="text-link" href={`mailto:${data.email}`}>
                <Mail size={17} />
                {data.email}
              </a>
            </p>
          )}
          {data?.phone && (
            <p>
              <a className="text-link" href={`tel:${data.phone}`}>
                <Phone size={17} />
                {data.phone}
              </a>
            </p>
          )}
          <p className="subtle">
            Messages are saved for the store team to review.
          </p>
          <Smile />
        </div>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fields = new FormData(form);
            setBusy(true);
            setError("");
            try {
              const result = await api<{ message: string }>("/contact", {
                method: "POST",
                body: JSON.stringify(Object.fromEntries(fields)),
              });
              notify(result.message);
              form.reset();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Your name
            <input
              name="name"
              placeholder="Full name"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
            />
          </label>
          <label>
            Email address
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </label>
          <label>
            What’s on your mind?
            <textarea
              name="message"
              rows={6}
              placeholder="Tell us a little more…"
              required
              minLength={10}
              maxLength={3000}
            />
          </label>
          {error && <ErrorBox message={error} />}
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Send your message"}
            <ArrowRight size={18} />
          </button>
        </form>
      </div>
    </section>
  );
}
export function FAQ() {
  const questions = [
    [
      "Are the pieces really one of one?",
      "Our vintage demo catalogue has one unit of each find. Availability is checked again when you place an order. Once a piece sells, its listing is marked as sold out.",
    ],
    [
      "How do I know the condition?",
      "Each product page includes a condition grade, a description of wear and any recorded flaws. Demo photos are generated and require replacement with actual product photography before sales.",
    ],
    [
      "Which payment methods are available?",
      "Cash on delivery is the initial payment method. Its availability and your total are shown in checkout. We do not take online payments.",
    ],
    [
      "How do I track an order?",
      "Keep your order number and private access code from the confirmation page. Enter them on the order tracking page to view status and shipping details.",
    ],
    [
      "Can I return a find?",
      "The returns policy is currently a draft awaiting business approval. Please read it and contact the store before making a real purchase.",
    ],
    [
      "How should I clean my vintage tie?",
      "Check the care label and seek professional advice for unverified or delicate fabrics. Our care guide covers gentle storage and handling.",
    ],
  ];
  return (
    <section className="content-page paper">
      <article className="editorial">
        <span className="eyebrow">A FEW GOOD ANSWERS.</span>
        <h1>Curious? Good.</h1>
        {questions.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
        <Link className="button" href="/contact">
          Still wondering? Say hello <ArrowRight size={18} />
        </Link>
      </article>
    </section>
  );
}
export function Tracking() {
  const [number, setNumber] = useState("");
  const [token, setToken] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("af-last-order") || "null");
      if (saved) {
        setNumber(saved.number);
        setToken(saved.token);
      }
    } catch {}
  }, []);
  return (
    <section className="content-page paper">
      <div className="checkout-header">
        <span className="eyebrow">YOUR NEXT STORY IS ON ITS WAY.</span>
        <h1>Follow your find.</h1>
        <p>
          Use the order number and private access code from your confirmation.
        </p>
      </div>
      <form
        className="form-stack tracking-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setOrder(null);
          try {
            setOrder(
              await api<Order>(`/orders/${encodeURIComponent(number)}`, {
                headers: { "x-order-token": token },
              }),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Order number
          <input
            required
            placeholder="AF-…"
            value={number}
            onChange={(e) => setNumber(e.target.value.trim())}
          />
        </label>
        <label>
          Private order access code
          <input
            required
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
            minLength={64}
            maxLength={64}
            placeholder="Your 64-character access code"
          />
        </label>
        <button className="button" disabled={busy}>
          {busy ? "Finding your order…" : "Track my order"}
          <ArrowRight size={18} />
        </button>
        {error && <ErrorBox message={error} />}
      </form>
      {order && (
        <div className="tracking-result">
          <h2>{order.number}</h2>
          <span className="status-badge">{order.status}</span>
          <p className="subtle">
            Placed {new Date(order.createdAt).toLocaleDateString("en-PK")}
          </p>
          {order.items.map((i) => (
            <div className="cart-item" key={i.id}>
              <a>
                <img src={i.image} alt={i.title} />
              </a>
              <div>
                {i.title}
                <strong>
                  {money(i.price)} × {i.quantity}
                </strong>
              </div>
            </div>
          ))}
          <div className="totals">
            <div>
              <strong>Total</strong>
              <strong>{money(order.total)}</strong>
            </div>
          </div>
          {order.shipment?.trackingNumber && (
            <p>
              Courier: {order.shipment.carrier || "Assigned courier"}
              <br />
              Tracking: <strong>{order.shipment.trackingNumber}</strong>
            </p>
          )}
          <p className="subtle">
            Payment: Cash on delivery · {order.payment?.status}
          </p>
        </div>
      )}
    </section>
  );
}
