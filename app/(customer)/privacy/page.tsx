import type { Metadata } from "next";
import LegalShell, { LegalValue, Section } from "@/components/LegalShell";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — HairOriginals AI Try-On",
  description:
    "How the HairOriginals AI Try-On app collects, uses, shares, and retains your photos and personal data.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      intro={`This policy explains what the HairOriginals AI Try-On app collects, why, who it is shared with, and how to get it deleted. It adds to the ${LEGAL.tradingName} privacy policy rather than replacing it: the storefront policy governs browsing and purchases, while this one covers the photo you upload here and everything the try-on does with it.`}
    >
      <Section title="Who controls your data">
        <p>
          <LegalValue value={LEGAL.companyName} /> (CIN{" "}
          <LegalValue value={LEGAL.cin} />), trading as {LEGAL.tradingName}, of{" "}
          <LegalValue value={LEGAL.address} />, is the controller of the personal data
          described here. Privacy requests go to{" "}
          <LegalValue value={LEGAL.privacyEmail} />.
        </p>
        <p>
          Purchases on the {LEGAL.tradingName} storefront are governed by the{" "}
          <a
            href={LEGAL.parentPrivacyUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-ink underline underline-offset-2"
          >
            storefront privacy policy
          </a>
          . Where the two documents differ on the handling of photos you upload to this
          app, this policy applies.
        </p>
      </Section>

      <Section title="Your photo, and why it needs special consent">
        <p>
          The core feature requires a photo of your face. A facial image processed to
          generate a likeness is treated as <strong>biometric / special-category
          data</strong> under the EU/UK GDPR (Article 9) and under US state biometric
          laws including the Illinois Biometric Information Privacy Act. We process it
          only on your <strong>explicit consent</strong>, which you give by ticking the
          consent box before uploading. The box is unticked by default and is asked again
          for each new photo, so consent is never assumed from a previous try-on. You can
          withdraw consent at any time by requesting deletion.
        </p>
        <p>
          Your uploaded photo is <strong>stored</strong>, not discarded after
          processing, so your past try-ons remain visible in &ldquo;My Looks&rdquo;. Both
          the original photo and each generated image are retained until you request
          deletion or the retention period below elapses.
        </p>
        <p>
          We do not use your photo to train any AI model, and we do not use it for
          facial recognition, identification, or matching you against any database.
        </p>
      </Section>

      <Section title="What else we collect">
        <ul className="list-disc pl-5">
          <li>
            <strong>Phone number</strong> — used to sign you in via one-time code, and
            as your account identifier.
          </li>
          <li>
            <strong>Name and email</strong> — only if you provide them when requesting a
            stylist consultation.
          </li>
          <li>
            <strong>Device and usage data</strong> — a hashed device fingerprint, a
            hashed IP address, and a device cookie. These exist to meter free try-on
            credits and prevent abuse; this is strictly necessary to run the service.
          </li>
          <li>
            <strong>Try-on activity</strong> — which products you viewed, tried, and
            saved, plus any feedback or rating you submit.
          </li>
        </ul>
      </Section>

      <Section title="Who we share it with">
        <ul className="list-disc pl-5">
          <li>
            <strong>Google (Gemini API)</strong> — receives your uploaded photo and the
            product image in order to generate the try-on. Processing occurs on Google
            infrastructure, which may be outside your country.
          </li>
          <li>
            <strong>Supabase</strong> — database, authentication, and image storage.
          </li>
          <li>
            <strong>Digicuro CRM</strong> — if you request a stylist consultation, your
            contact details and links to your generated looks are sent so a stylist can
            follow up.
          </li>
          <li>
            <strong>SMS providers</strong> — your phone number is sent to the provider
            that delivers your one-time code (Nimbus for Indian numbers, Twilio
            elsewhere).
          </li>
          <li>
            <strong>Meta</strong> — if you accept analytics cookies, we send advertising
            measurement events. Email and phone are hashed before sending; your IP
            address is sent to Meta as part of this.
          </li>
        </ul>
        <p>
          Transfers outside your region rely on the relevant provider&apos;s standard
          contractual clauses or equivalent safeguards.
        </p>
      </Section>

      {/* Mobile carriers audit this page directly during SMS sender registration
          (Twilio Toll-Free Verification / A2P 10DLC campaign review) and look for
          an explicit statement that mobile opt-in data is not shared onward. The
          Meta bullet above — phone numbers hashed and sent for ad measurement —
          reads as "shares mobile numbers for marketing" without this carve-out,
          which is a common rejection reason. Keep this section in step with the
          disclosure in components/FunnelGate.tsx. */}
      <Section title="Mobile numbers and SMS consent">
        <p>
          <strong>
            We do not share mobile opt-in information or SMS consent with any third
            party or affiliate for marketing purposes, and we never sell your mobile
            number.
          </strong>{" "}
          The number you give us is used to deliver your one-time sign-in code and to
          identify your account. It is disclosed only to the SMS provider that carries
          that message, and only for that purpose.
        </p>
        <p>
          The advertising measurement described above never transmits your number in
          readable form — it is hashed irreversibly before it leaves our systems, is
          used only to match existing ad interactions, and is not sent at all unless you
          accept analytics cookies.
        </p>
        <p>
          You receive one message per sign-in attempt; we do not send marketing SMS.
          Reply <strong>STOP</strong> to any message to opt out, or <strong>HELP</strong>{" "}
          for help. Message and data rates may apply. Opting out blocks future
          verification codes, so you will not be able to sign in by SMS afterwards.
        </p>
      </Section>

      <Section title="We do not sell your data">
        <p>
          <strong>
            We do not sell, rent, or trade your personal data, and we never disclose it
            to anyone in exchange for money or other valuable consideration.
          </strong>{" "}
          That covers your photos, your generated looks, your phone number, and your
          try-on history. We have no data-broker relationships and we do not license
          your data to anyone.
        </p>
        <p>
          The companies named above are service providers working on our instructions.
          They may use your data only to deliver the specific service we have asked them
          for, and not for their own purposes. Your photo goes to Google to generate your
          try-on and for nothing else — not to train their models, and not to build a
          profile of you.
        </p>
        <p>
          To be straightforward about the one exception: if you accept analytics cookies,
          we send advertising measurement events to Meta. No money changes hands, but
          some US state privacy laws still classify that as{" "}
          <strong>&ldquo;sharing&rdquo; for cross-context behavioural advertising</strong>,
          so we would rather name it than let you find out later. Decline cookies and it
          never happens. If you have already accepted and want to undo it, clearing this
          site&apos;s data in your browser resets the choice and we will ask you again.
        </p>
      </Section>

      <Section title="Where we operate">
        <p>
          We are established in India and the app is operated from there, but it is
          available to users elsewhere. Where you are in the EEA, the UK, or a US state
          with its own privacy or biometric statute, we apply the protections that law
          gives you — including the consent, access, and deletion rights set out below —
          regardless of where we are based.
        </p>
      </Section>

      <Section title="Cookies and tracking">
        <p>
          A device cookie is set to track your free credits — this is strictly necessary
          and is not optional. Analytics and advertising scripts (Meta Pixel, Vercel
          Analytics) load <strong>only after you accept</strong> where consent is
          required, and never before. Declining leaves the app fully functional.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Photos, generated images, and account data are kept while your account is
          active. If you request deletion we remove them within 30 days, except where we
          are required to retain records by law.
        </p>
        <p>
          To ask for deletion, email <LegalValue value={LEGAL.privacyEmail} /> from the
          address or phone number on your account, or contact the Grievance Officer
          below. Deleting your photos does not affect any order you have placed on the
          storefront.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Depending on where you live, you may have the right to access, correct, delete,
          port, or restrict processing of your data, to object to processing, and to
          withdraw consent at any time without affecting prior processing. EEA/UK users
          may also complain to their local supervisory authority.
        </p>
        <p>
          To exercise any of these, email <LegalValue value={LEGAL.privacyEmail} />. We
          respond within the period required by applicable law.
        </p>
      </Section>

      <Section title="Children">
        <p>
          The app is not intended for anyone under {LEGAL.minimumAge}, and we do not
          knowingly collect data — least of all facial images — from anyone below that
          age. If you believe someone underage has used the app, contact us and we will
          delete the data.
        </p>
      </Section>

      <Section title="Grievance officer (India)">
        <p>
          Under the Digital Personal Data Protection Act 2023, Indian users may contact
          our Grievance Officer, <LegalValue value={LEGAL.grievanceOfficer} />, at{" "}
          <LegalValue value={LEGAL.grievanceEmail} /> or{" "}
          <LegalValue value={LEGAL.grievancePhone} />.
        </p>
      </Section>
    </LegalShell>
  );
}
