/**
 * Minimal class-name joiner. Matches the existing convention of
 * composing Tailwind classes with a filtered array join — no extra deps.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
