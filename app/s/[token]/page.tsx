/**
 * /s/[token] — the page a standee visitor lands on after scanning the QR on
 * the standee's result screen. Opened on their own phone; see
 * components/handoff/HandoffFlow.tsx for the flow.
 */

import type { Metadata, Viewport } from "next";
import HandoffFlow from "@/components/handoff/HandoffFlow";

export const metadata: Metadata = {
  title: "Your HairOriginals looks",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fdf2f2",
};

export default async function HandoffPage(props: PageProps<"/s/[token]">) {
  const { token } = await props.params;
  return <HandoffFlow token={token} />;
}
