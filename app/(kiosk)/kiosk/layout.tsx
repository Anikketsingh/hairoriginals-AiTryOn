import type { Metadata, Viewport } from "next";

/**
 * Layout for the in-store standee (/kiosk). Its own route group so none of
 * the storefront chrome (header, funnel gate, maintenance screen, attribution)
 * renders here. Root app/layout.tsx still wraps it; ConsentGate opts itself
 * out for /kiosk paths.
 */

export const metadata: Metadata = {
  title: "HairOriginals Kiosk",
  robots: { index: false, follow: false },
};

// Touch kiosk: pinch-zoom would strand the next visitor on a zoomed-in screen.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 select-none overscroll-none touch-manipulation"
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
    >
      {children}
    </div>
  );
}
