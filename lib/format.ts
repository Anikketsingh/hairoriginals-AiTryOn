/**
 * lib/format.ts
 *
 * Money formatting.
 *
 * Replaces hardcoded `₹{n.toLocaleString()}` across the app. That pattern had
 * two distinct bugs:
 *
 *   1. The currency symbol was a literal, so every price rendered as rupees
 *      regardless of what currency the number actually was.
 *   2. `toLocaleString()` was called with NO locale argument, so grouping came
 *      from the *viewer's* browser. A German visitor saw "₹24.999" — a rupee
 *      symbol with European separators, i.e. the symbol and the number format
 *      disagreeing with each other.
 *
 * Intl.NumberFormat with an explicit currency fixes both: it picks the correct
 * symbol, placement, separators, and decimal count for the currency/locale
 * pair together.
 */

/** Currency every existing price is denominated in (no currency column existed). */
export const DEFAULT_CURRENCY = "INR";

/**
 * Currencies selectable in the product editor — the markets we sell into.
 * Kept alongside SUPPORTED_COUNTRIES in lib/phone.ts.
 */
export const SUPPORTED_CURRENCIES: readonly { code: string; label: string }[] = [
  { code: "INR", label: "Indian Rupee" },
  { code: "USD", label: "US Dollar" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "GBP", label: "Pound Sterling" },
  { code: "EUR", label: "Euro" },
  { code: "AED", label: "UAE Dirham" },
  { code: "SAR", label: "Saudi Riyal" },
  { code: "SGD", label: "Singapore Dollar" },
  { code: "MYR", label: "Malaysian Ringgit" },
  { code: "IDR", label: "Indonesian Rupiah" },
] as const;

/**
 * Formats a money amount for display.
 *
 * @param amount   Value in MAJOR units (rupees, dollars) — matching how
 *                 `products.price` is stored as NUMERIC(10,2), not minor units.
 * @param currency ISO 4217 code. Defaults to INR for rows predating the
 *                 `currency` column.
 * @param locale   Formatting locale. Defaults to undefined, which uses the
 *                 viewer's locale — correct here because Intl keeps the symbol
 *                 and separators consistent with each other either way.
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: string = DEFAULT_CURRENCY,
  locale?: string,
): string {
  const value = amount ?? 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      // Prices are whole numbers in practice; showing ".00" on every card is
      // noise. Fractional amounts still render their decimals.
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Unknown/malformed currency code — don't blow up a product card over it.
    return `${currency} ${value.toLocaleString(locale)}`;
  }
}

/**
 * Formats a cost figure, always with 2 decimals. For admin cost dashboards
 * where sub-unit precision is the point.
 */
export function formatCost(
  amount: number | null | undefined,
  currency: string = DEFAULT_CURRENCY,
  locale?: string,
): string {
  const value = amount ?? 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/** Percentage discount from MRP/compare-at price, or null when there isn't one. */
export function discountPercent(
  price: number | null | undefined,
  compareAt: number | null | undefined,
): number | null {
  if (!price || !compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}
