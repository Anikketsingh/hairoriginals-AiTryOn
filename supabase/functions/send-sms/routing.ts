// supabase/functions/send-sms/routing.ts
//
// Country resolution, allowlisting, and provider selection for the send_sms
// auth hook.
//
// This module is the last server-side checkpoint before money is spent.
// `signInWithOtp()` runs browser → Supabase directly and never touches a
// Next.js route, so no API middleware can rate-limit or gate the send path.
// Everything here is therefore DEFAULT-DENY: a number whose country we cannot
// positively identify is rejected rather than forwarded to a provider.
//
// Why this matters: SMS pumping fraud works by driving OTP sends to
// premium-rate ranges in expensive countries and collecting a carrier revenue
// share. The allowlist caps the blast radius at the set of markets we actually
// sell in.

export type Provider = "nimbus" | "twilio";

/**
 * E.164 calling code → ISO 3166-1 alpha-2.
 *
 * Matched longest-prefix-first, which is required for correctness: +97 is not
 * a country but +971/+972/+974/+977 all are, and +1 must not shadow anything.
 *
 * This covers our target markets plus enough common codes that rejections are
 * logged with a real country name instead of "unknown". Codes absent from this
 * map resolve to null and are rejected — that is the intended behaviour, not a
 * gap to be filled defensively.
 */
const CALLING_CODES: Record<string, string> = {
  // Target markets
  "91": "IN",
  "44": "GB",
  "353": "IE",
  "49": "DE",
  "33": "FR",
  "34": "ES",
  "39": "IT",
  "31": "NL",
  "46": "SE",
  "971": "AE",
  "966": "SA",
  "65": "SG",
  "60": "MY",
  "62": "ID",
  // Common non-target codes — resolved only so logs and user-facing errors are
  // legible. Being in this map does NOT grant access; the allowlist decides.
  "61": "AU", "64": "NZ", "81": "JP", "82": "KR", "86": "CN",
  "55": "BR", "52": "MX", "27": "ZA", "234": "NG", "92": "PK",
  "880": "BD", "94": "LK", "977": "NP", "63": "PH", "66": "TH",
  "84": "VN", "90": "TR", "7": "RU", "48": "PL", "351": "PT",
  "32": "BE", "41": "CH", "43": "AT", "45": "DK", "47": "NO",
  "358": "FI", "30": "GR", "420": "CZ", "40": "RO", "36": "HU",
  "972": "IL", "20": "EG", "254": "KE", "974": "QA", "965": "KW",
  "973": "BH", "968": "OM", "962": "JO", "961": "LB",
};

/** Calling codes sorted longest-first so prefix matching is unambiguous. */
const SORTED_CODES = Object.keys(CALLING_CODES).sort((a, b) => b.length - a.length);

/**
 * NANP (+1) area codes that are NOT the US or Canada.
 *
 * The +1 space is shared with ~25 Caribbean and Pacific territories, several of
 * which carry premium-rate ranges and are a classic SMS-pumping vector. Without
 * this check, allowlisting "US" would silently allow +1-876 (Jamaica) and
 * friends at a much higher per-message cost.
 */
const NON_US_CA_NANP: Record<string, string> = {
  "242": "BS", "246": "BB", "264": "AI", "268": "AG", "284": "VG",
  "340": "VI", "345": "KY", "441": "BM", "473": "GD", "649": "TC",
  "658": "JM", "664": "MS", "670": "MP", "671": "GU", "684": "AS",
  "721": "SX", "758": "LC", "767": "DM", "784": "VC", "787": "PR",
  "809": "DO", "829": "DO", "849": "DO", "868": "TT", "869": "KN",
  "876": "JM", "939": "PR",
};

/**
 * Resolves an E.164 number to an ISO 3166-1 alpha-2 country code.
 * Returns null when the country cannot be positively identified.
 *
 * Note: US and Canada are not distinguished from each other — both resolve to
 * "US". They route identically (Twilio) and are allowlisted together, so the
 * distinction would carry no behaviour. Caribbean/Pacific NANP territories ARE
 * distinguished, because those must be rejectable independently.
 */
export function resolveCountry(e164: string): string | null {
  if (!e164.startsWith("+")) return null;
  const digits = e164.slice(1).replace(/\D/g, "");
  if (!digits) return null;

  // +1 needs area-code granularity; handle it before the generic prefix match.
  if (digits.startsWith("1")) {
    const areaCode = digits.slice(1, 4);
    if (areaCode.length < 3) return null;
    return NON_US_CA_NANP[areaCode] ?? "US";
  }

  for (const code of SORTED_CODES) {
    if (digits.startsWith(code)) return CALLING_CODES[code];
  }
  return null;
}

/**
 * Parses SMS_ALLOWED_COUNTRIES ("IN,US,GB,…").
 *
 * An unset or empty allowlist returns an empty set, which denies everything.
 * That is deliberate: a misconfigured deploy should stop sending SMS, not open
 * delivery to every country on earth.
 */
export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
  );
}

/** Which provider serves this country. India is configurable; the rest is Twilio. */
export function providerFor(country: string, indiaProvider: Provider): Provider {
  return country === "IN" ? indiaProvider : "twilio";
}
