import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
  openGraph: {
    title: "HairOriginals AI Try-On",
    description:
      "See how HairOriginals products look on you with our AI-powered virtual try-on tool.",
    type: "website",
  },
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
      </body>
    </html>
  );
}
