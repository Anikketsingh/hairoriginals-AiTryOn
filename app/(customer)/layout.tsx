import { headers } from "next/headers";
import { ToastProvider } from "@/components/ui/Toast";
import { GeoProvider } from "@/components/GeoProvider";

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Vercel injects this on every request at no cost, so the phone gate can
  // default to the visitor's country instead of always +91. Absent locally and
  // on non-Vercel hosts, in which case GeoProvider yields null.
  const country = (await headers()).get("x-vercel-ip-country");

  return (
    <GeoProvider country={country}>
      <ToastProvider>{children}</ToastProvider>
    </GeoProvider>
  );
}
