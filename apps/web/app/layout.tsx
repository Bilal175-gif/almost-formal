import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
export const metadata: Metadata = {
  title: {
    default: "Almost Formal — Old Ties. New Stories.",
    template: "%s | Almost Formal",
  },
  description:
    "One-of-one vintage ties and pre-loved finds, with a little history and a lot of character. Almost Formal, Pakistan.",
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
