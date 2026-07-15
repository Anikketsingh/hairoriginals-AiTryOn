import type { Metadata } from "next";
import { Mail } from "lucide-react";
import TopBar from "@/components/flow/TopBar";
import BottomNav from "@/components/BottomNav";

/** LinkedIn glyph — lucide dropped brand icons, so it's inlined. */
function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

export const metadata: Metadata = {
  title: "About — HairOriginals AI Try-On",
  description: "Who built the HairOriginals AI hairstyle try-on app.",
};

const CONTACTS = [
  {
    href: "https://www.linkedin.com/in/-aniket-singh-/",
    label: "LinkedIn",
    icon: LinkedinIcon,
    external: true,
  },
  {
    href: "mailto:its.aniketsingh04@gmail.com",
    label: "its.aniketsingh04@gmail.com",
    icon: Mail,
    external: false,
  },
];

export default function AboutPage() {
  return (
    <>
      <TopBar home />

      <main className="mx-auto w-full max-w-md px-5 pt-[calc(env(safe-area-inset-top)+5.5rem)] pb-[calc(env(safe-area-inset-bottom)+7.5rem)] animate-fade-in lg:max-w-2xl lg:pt-[calc(env(safe-area-inset-top)+7rem)] lg:pb-16">
        <h1 className="text-center text-[1.75rem] font-extrabold tracking-tight text-ink lg:text-4xl">
          About this app
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-[15px] leading-relaxed text-ink-soft lg:mt-4 lg:max-w-lg lg:text-base">
          HairOriginals AI Try-On lets you preview any hairstyle on your own
          selfie in seconds — add a photo, pick a look, and see yourself
          wearing it before you commit.
        </p>

        {/* Creator card */}
        <div className="mt-8 rounded-[2rem] bg-surface p-7 text-center shadow-[var(--shadow-card)] lg:mt-10 lg:p-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-grad-1 via-grad-2 to-grad-3 text-2xl font-extrabold tracking-wide text-white shadow-[var(--shadow-brand)]">
            AS
          </div>
          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
            Created by
          </p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-ink lg:text-3xl">
            Aniket Singh
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">
            Designer &amp; developer of this AI try-on experience.
          </p>

          <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
            {CONTACTS.map(({ href, label, icon: Icon, external }) => (
              <a
                key={href}
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold text-ink transition hover:bg-surface-sunken active:scale-[0.98]"
              >
                <Icon className="h-[1.1rem] w-[1.1rem] shrink-0 text-brand" />
                <span className="truncate">{label}</span>
              </a>
            ))}
          </div>
        </div>
      </main>

      <BottomNav />
    </>
  );
}
