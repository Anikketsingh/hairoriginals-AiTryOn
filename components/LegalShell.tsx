import Link from "next/link";
import TopBar from "@/components/flow/TopBar";
import BottomNav from "@/components/BottomNav";
import { LEGAL, isPlaceholder } from "@/lib/legal";

/** Renders a company detail, or a visible warning if it's still a placeholder. */
export function LegalValue({ value }: { value: string }) {
  if (!isPlaceholder(value)) return <>{value}</>;
  return (
    <span className="rounded bg-danger-soft px-1.5 py-0.5 font-semibold text-danger">
      {value}
    </span>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

export default function LegalShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <TopBar home />
      <main className="mx-auto w-full max-w-md px-5 pt-[calc(env(safe-area-inset-top)+5.5rem)] pb-[calc(env(safe-area-inset-bottom)+7.5rem)] animate-fade-in lg:max-w-2xl lg:pt-[calc(env(safe-area-inset-top)+7rem)] lg:pb-16">
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
            <p className="text-xs text-ink-faint">Last updated {LEGAL.lastUpdated}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{intro}</p>
          </header>

          {children}

          <footer className="mt-2 flex gap-4 border-t border-line pt-4 text-xs font-semibold text-ink-soft">
            <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
              Privacy Policy
            </Link>
            <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
              Terms of Use
            </Link>
          </footer>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
