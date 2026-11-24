import { notFound } from "next/navigation";
import { InfoPage, Contact, FAQ, Tracking } from "@/components/content-pages";
import type { Metadata } from "next";
const slugs = [
  "our-story",
  "care-guide",
  "shipping-policy",
  "returns-policy",
  "privacy-policy",
  "terms-and-conditions",
  "contact",
  "faq",
  "order-tracking",
];
export function generateStaticParams() {
  return slugs.map((page) => ({ page }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  const titles: Record<string, string> = {
    "care-guide": "How to Care for a Necktie",
    faq: "Necktie FAQs",
    "our-story": "Our Story",
    contact: "Contact Almost Formal",
  };
  const title = titles[page] || page.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return {
    title,
    description: page === "care-guide" ? "Learn how to untie, store and clean a necktie, including delicate pieces with unverified fabric." : page === "faq" ? "Answers about Almost Formal ties, condition, care, payment and order tracking." : undefined,
    alternates: { canonical: `/${page}` },
    robots: { index: !["order-tracking", "privacy-policy", "terms-and-conditions"].includes(page), follow: true },
  } satisfies Metadata;
}
export default async function ContentRoute({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  if (page === "contact") return <Contact />;
  if (page === "faq") return <FAQ />;
  if (page === "order-tracking") return <Tracking />;
  if (!slugs.includes(page)) notFound();
  return <InfoPage slug={page} />;
}
