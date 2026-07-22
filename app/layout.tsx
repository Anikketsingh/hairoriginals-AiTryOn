import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Meta (Facebook) Pixel — base script + automatic PageView. Reads the ID from
// env so the browser snippet and the server-side Conversions API helper
// (lib/meta-capi.ts) share one source of truth. If unset, nothing renders.
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

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
        {META_PIXEL_ID && (
          <>
            {/* Meta Pixel Code */}
            <Script id="meta-pixel" strategy="afterInteractive">
              {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
            </Script>
            <noscript>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                height="1"
                width="1"
                style={{ display: "none" }}
                src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
                alt=""
              />
            </noscript>
            {/* End Meta Pixel Code */}
          </>
        )}
      </body>
    </html>
  );
}
