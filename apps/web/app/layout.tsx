import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
export const metadata: Metadata = {
  metadataBase: new URL("https://almostformal.shop"),
  title: {
    default: "Almost Formal | Curated Neckties in Pakistan",
    template: "%s | Almost Formal",
  },
  description:
    "Shop curated, one-of-one patterned neckties in Pakistan. Explore the current collection and find a tie with character.",
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "Almost Formal", title: "Almost Formal | Curated Neckties in Pakistan", description: "One-of-one patterned neckties, chosen with care in Pakistan.", url: "https://almostformal.shop" },
  robots: { index: true, follow: true },
  other: { "geo.region": "PK", "geo.placename": "Lahore" },
  icons: {
    icon: [{ url: "/images/almost-formal-green-logo.webp", type: "image/webp", sizes: "256x256" }],
    apple: [{ url: "/images/almost-formal-green-logo.webp", sizes: "256x256" }],
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-PK">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: "Almost Formal", url: "https://almostformal.shop", logo: "https://almostformal.shop/images/almost-formal-green-logo.webp", sameAs: ["https://www.instagram.com/almost.formal/"], areaServed: { "@type": "Country", name: "Pakistan" } }) }} />
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
