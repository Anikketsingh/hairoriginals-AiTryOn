import { ToastProvider } from "@/components/ui/Toast";

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}
