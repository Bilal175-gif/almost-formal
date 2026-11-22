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
    <html lang="en">
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
