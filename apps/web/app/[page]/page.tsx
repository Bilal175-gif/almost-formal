import { notFound } from "next/navigation";
import { InfoPage, Contact, FAQ, Tracking } from "@/components/content-pages";
const slugs = [
  "our-story",
  "why-thrift",
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
  return {
    title: page
      .split("-")
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" "),
  };
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
