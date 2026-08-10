/**
 * lib/legal.ts
 *
 * Company details referenced by the privacy policy and terms.
 *
 * Values are taken from the storefront's published policies at
 * hairoriginals.com/pages/privacy-policy and /pages/terms-conditions, so the
 * app names the same legal entity, address, and grievance officer as the parent
 * company rather than inventing its own.
 *
 * ⚠️  The policy text in app/privacy and app/terms is a substantive draft
 * written to match what the code actually does — it is NOT legal advice and has
 * not been reviewed by a lawyer. Two points are still open:
 *
 *   1. `minimumAge` is 16, chosen over the storefront's stated 13 because this
 *      app collects facial images. 16 is the highest GDPR Art. 8 digital-consent
 *      age across EEA states, but it still admits minors, whose biometric data
 *      attracts heightened exposure under Illinois BIPA ($1,000–$5,000 statutory
 *      damages per violation) and GDPR Art. 9.
 *   2. The policy promises deletion within 30 days but there is no self-service
 *      deletion flow — the promise depends on `privacyEmail` being monitored and
 *      actioned manually.
 *
 * The storefront policies cover purchases; they do not mention image or
 * biometric processing, so the app-specific sections here are additive and
 * cannot be replaced by linking to the parent documents.
 */

export const LEGAL = {
  /** Registered legal name of the operating entity. */
  companyName: "KrisOriginals Pvt. Ltd",
  /** Trading name customers recognise. */
  tradingName: "HairOriginals",
  /** Corporate Identity Number, as published on the storefront policies. */
  cin: "U51909HR2018PTC074470",
  /** Registered address. Required for GDPR Art. 13 and India DPDP notices. */
  address:
    "Plot No. 220, Udyog Vihar, Phase IV, Sector 18, Gurugram, Haryana – 122015, India",
  /** Where privacy requests (access, deletion, objection) are received. */
  privacyEmail: "aniket.kushwaha@hairoriginals.com",
  /**
   * India DPDP Act 2023 requires a named Grievance Officer with contact
   * details published for data principals. Same officer as the storefront.
   */
  grievanceOfficer: "Mayank Sharma",
  grievanceEmail: "feedback@hairoriginals.com",
  grievancePhone: "+91 9267993875",
  /** Storefront support line, for users who reach the app first. */
  supportEmail: "help@hairoriginals.com",
  supportPhone: "+91 8700797103",
  /**
   * Minimum age to use the app. Higher than the storefront's 13 because the
   * app processes facial images. See the header note before changing.
   */
  minimumAge: 16,
  /** Courts named in the governing-law clause of the terms. */
  courts: "the courts at Gurugram, Haryana, India",
  /** Storefront policies, which govern purchases rather than the app. */
  parentPrivacyUrl: "https://www.hairoriginals.com/pages/privacy-policy",
  parentTermsUrl: "https://www.hairoriginals.com/pages/terms-conditions",
  /** Last substantive revision, shown on both documents. */
  lastUpdated: "8 August 2026",
} as const;

/** True when a field is still an unfilled placeholder. */
export function isPlaceholder(value: string): boolean {
  return value.startsWith("TODO:");
}
