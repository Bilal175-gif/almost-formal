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
      "Almost Formal started with a simple idea: the right tie can change the whole look. We choose pieces with personality, polish and details worth noticing.",
    sections: [
      [
        "Details make the difference.",
        "We look for the unexpected: a rich paisley, a confident stripe, a color you didn’t know you needed. Every piece is chosen for the details that make it stand out.",
      ],
      [
        "Chosen one by one.",
        "Every piece gets a close look. We describe its condition honestly, photograph the details and let each tie speak for itself.",
      ],
      [
        "Your style. Your rules.",
        "For the everyday, the almost occasion, or just because. Wear it your way and make the look yours.",
      ],
    ],
  },
  "care-guide": {
    title: "Keep the story going.",
    eyebrow: "THE CARE GUIDE",
    intro:
      "A little care goes a long way. Delicate fabrics deserve a gentle touch, especially when their fiber content is unknown.",
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
        "Store away from moisture and direct sunlight. Avoid placing a hot iron directly on delicate fabric. Ask a professional about safe pressing for your particular piece.",
      ],
      [
        "A note on materials",
        "We list a material or era only when verified. If it’s unknown, treat the piece as delicate and ask before cleaning.",
      ],
    ],
  },
  "shipping-policy": {
    title: "A Little Journey to Your Door",
    eyebrow: "SHIPPING & DELIVERY",
    intro: "Every Almost Formal tie is packed by hand in Lahore and sent across Pakistan. Last updated: 25 November 2026.",
    sections: [
      ["Where we deliver", "We deliver across Pakistan. International shipping is not available yet. If a courier cannot serve your address, we’ll contact you before dispatch."],
      ["Delivery charges", "The delivery charge is shown at checkout before you place your order. There are no hidden delivery fees. For Instagram DM orders, we’ll confirm the exact total before you commit."],
      ["Dispatch and delivery", "We check each one-of-one tie again before packing. Delivery times depend on the courier, your location, weather and holidays; we’ll share the available estimate when your order is confirmed."],
      ["Order confirmation", "We confirm your name, phone number and full address before dispatch. Cash on delivery orders are shipped after you reply ‘Confirm’. If we cannot reach you, we may release the one-of-one tie for sale again."],
      ["Tracking", "Once your order ships, we’ll share the courier tracking number. It also appears on your private order page. Keep your order number and private access link to yourself."],
      ["Payment on delivery", "Please keep the exact cash amount ready. Check that the parcel is sealed when it arrives. If it is damaged, photograph it and contact us within three days of delivery."],
      ["Failed, lost or delayed parcels", "If delivery fails because the address is wrong, the phone is unreachable or a COD parcel is refused, contact us to arrange another attempt. A new delivery charge may apply. If the courier confirms a parcel is lost, we’ll offer a refund or another tie."],
      ["Contact", "Message @almost.formal on Instagram or use the website contact form with your order number. Do not share your private order access link publicly."],
    ],
  },
  "returns-policy": {
    title: "Returns, Exchanges & Refunds",
    eyebrow: "RETURNS & EXCHANGES",
    intro: "Last updated: 25 November 2026. Every Almost Formal tie is a one-of-one piece, and most are vintage or pre-loved. We cannot restock an identical tie, so we work with you on a fair resolution, with exchanges considered first.",
    sections: [
      ["Product condition", "Every listing shows the Tie ID, available fabric details, length, width and a condition grade. Excellent means no visible flaws. Good means very light signs of wear. Has character means visible marks, small snags or fading, described and photographed on the listing. We clean, steam and inspect every tie before listing it. A flaw clearly listed or visible in photos is not grounds for a return. Colours may differ slightly between screens."],
      ["If your order is not as described", "This covers a wrong tie, an unlisted flaw or damage in transit. Contact @almost.formal on Instagram or use the website contact form within three days of delivery. Include your order number, Tie ID and clear photos or a short video. For transit damage, include the packaging too."],
      ["Exchange or refund", "If we agree the tie is not as described, you may exchange it for an available tie of equal or lower price; we cover delivery of the replacement. If no suitable exchange is available, we refund the tie price. Delivery charges are refunded when the mistake is ours. COD refunds are sent by bank transfer or mobile wallet after approval; share account details only in a private channel."],
      ["If you change your mind", "We do not refund change-of-mind returns for one-of-one pieces. Within three days of delivery, you may request an exchange or store credit if the tie is unworn, in its original condition, free of perfume, smoke or marks, and returned with its tag and packaging. You pay return shipping for a change-of-mind exchange."],
      ["What we cannot accept", "We cannot accept ties worn, altered, stained or damaged after delivery, or claims reported more than three days after delivery. Items explicitly marked Final sale on their listing cannot be exchanged for change of mind."],
      ["Cash on delivery and cancellation", "Check that your parcel is sealed and addressed to you. We confirm your address and phone number before dispatching COD orders. Repeated refused COD parcels may require advance payment on later orders. You may cancel before dispatch by messaging us; once the parcel is with the courier, the exchange rules apply."],
      ["Order privacy and contact", "Never post your order number or private order access code publicly. We never ask for card PINs or one-time passwords. Message @almost.formal on Instagram or use the website contact form. Wait for return instructions before shipping a tie back."],
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
      "Our demo catalogue has one unit of each find. Availability is checked again when you place an order. Once a piece sells, its listing is marked as sold out.",
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
      "How should I care for my tie?",
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
