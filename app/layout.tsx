import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "HairOriginals AI Try-On — Virtual Hair Try-On Powered by Gemini",
  description:
    "Upload your photo and a HairOriginals hair product to instantly preview a photorealistic AI-generated try-on. Powered by Google Gemini.",
  keywords: ["hair try-on", "AI hair", "virtual try-on", "HairOriginals", "Gemini AI"],
  icons: {
    icon: "/LOGO-PNG.png",
    apple: "/LOGO-PNG.png",
  },
  openGraph: {
    title: "HairOriginals AI Try-On",
    description:
      "See how HairOriginals products look on you with our AI-powered virtual try-on tool.",
    type: "website",
    images: ["/LOGO-PNG.png"],
  },
};

// viewport-fit=cover is required for env(safe-area-inset-*) to resolve to real
// values on iOS notch / home-indicator devices — without it every pt-safe /
// pb-safe helper (globals.css) is a no-op.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf8f6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans bg-canvas text-ink antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
