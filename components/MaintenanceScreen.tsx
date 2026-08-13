import Logo from "@/components/ui/Logo";

/**
 * What every visitor sees while maintenance mode is on. Rendered in place of
 * the customer app by app/(customer)/layout.tsx, so nothing behind it — no
 * product grid, no upload flow — is ever mounted.
 *
 * Deliberately self-contained: no data fetching, no client JS, no links into
 * the app that would 404 or bounce straight back here.
 */
export default function MaintenanceScreen({ message }: { message: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 animate-fade-in">
        <Logo className="h-8 w-auto" />

        <div
          aria-hidden
          className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft"
        >
          {/* Wrench, inline rather than via lucide-react so this screen has no
              component dependencies that could themselves be mid-refactor. */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7 text-brand"
          >
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </div>

        <div className="flex flex-col gap-2.5">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            We&rsquo;ll be right back
          </h1>
          <p className="text-sm leading-relaxed text-ink-soft">{message}</p>
        </div>

        <p className="text-xs text-ink-faint">
          Please check back in a little while.
        </p>
      </div>
    </main>
  );
}
