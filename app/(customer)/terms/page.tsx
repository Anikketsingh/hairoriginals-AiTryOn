import type { Metadata } from "next";
import LegalShell, { LegalValue, Section } from "@/components/LegalShell";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Use — HairOriginals AI Try-On",
  description: "The terms governing your use of the HairOriginals AI Try-On app.",
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Use"
      intro={`These terms govern your use of the ${LEGAL.tradingName} AI Try-On app. By using the app you agree to them. They sit alongside the ${LEGAL.tradingName} storefront terms, which continue to govern anything you buy.`}
    >
      <Section title="Who you are contracting with">
        <p>
          The app is operated by <LegalValue value={LEGAL.companyName} /> (CIN{" "}
          <LegalValue value={LEGAL.cin} />), trading as {LEGAL.tradingName}, of{" "}
          <LegalValue value={LEGAL.address} />.
        </p>
      </Section>

      <Section title="What the service does">
        <p>
          The app generates an AI preview of how a {LEGAL.tradingName} product might look
          on you, from a photo you upload. Previews are illustrative only. They are
          machine-generated approximations and will not exactly match the real product on
          your hair — colour, texture, density, and fit vary in reality.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          Accounts are created and accessed with a one-time code sent to your phone. You
          are responsible for keeping access to that number secure, and for activity
          under your account. You must be {LEGAL.minimumAge} or older to use the app. If
          you are under 18, you may use it only with the consent of a parent or guardian.
        </p>
      </Section>

      {/* Carriers read this page during SMS sender registration (Twilio Toll-Free
          Verification / A2P 10DLC) and expect message frequency, rates, and
          STOP/HELP handling stated in the terms themselves, not only in the app.
          Keep in step with components/FunnelGate.tsx and the matching section in
          the Privacy Policy. */}
      <Section title="Verification messages (SMS)">
        <p>
          When you ask to sign in, we send a single SMS containing a one-time
          verification code. Message frequency is one message per sign-in attempt. We do
          not send marketing or promotional SMS. <strong>Message and data rates may
          apply</strong>, depending on your mobile plan and carrier.
        </p>
        <p>
          Reply <strong>STOP</strong> to any message to stop receiving them, or{" "}
          <strong>HELP</strong> for help. Because these messages are how we verify your
          identity, opting out means you will no longer be able to sign in by SMS. For
          assistance, contact us at <LegalValue value={LEGAL.supportEmail} />.
        </p>
        <p>
          Delivery depends on your mobile carrier and is not guaranteed. Carriers are not
          liable for delayed or undelivered messages.
        </p>
      </Section>

      <Section title="Photos you upload">
        <p>You confirm that, for every photo you upload:</p>
        <ul className="list-disc pl-5">
          <li>it is of you, or you have the permission of the person shown;</li>
          <li>you have the right to upload it and to have it processed as described in the Privacy Policy;</li>
          <li>it does not contain anyone under {LEGAL.minimumAge}.</li>
        </ul>
        <p>
          You keep ownership of your photos. You grant us a limited licence to process,
          store, and display them solely to provide the try-on service to you. That
          licence ends when you delete the content or your account.
        </p>
        <p>
          If you upload a photo of someone else without their permission, you are
          responsible for any claim that results from it.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>You must not:</p>
        <ul className="list-disc pl-5">
          <li>upload photos of other people without their permission;</li>
          <li>use the app to create misleading, defamatory, or explicit imagery;</li>
          <li>attempt to bypass credit limits, rate limits, or authentication;</li>
          <li>scrape, resell, or automate access to the service.</li>
        </ul>
        <p>We may suspend accounts that breach these terms.</p>
      </Section>

      <Section title="Credits">
        <p>
          Try-ons are metered with credits. Credits have no cash value, are not
          transferable, are not refundable, and may be changed or withdrawn at any time.
        </p>
      </Section>

      <Section title="Our content">
        <p>
          The app, its product imagery, and the {LEGAL.tradingName} name and marks belong
          to us or our licensors. Generated previews are provided for your personal use;
          you may share them, but you may not use them to advertise or sell anything.
        </p>
      </Section>

      <Section title="Products and purchases">
        <p>
          Prices shown in the app are indicative and may differ from the storefront at
          checkout. Purchases happen on the {LEGAL.tradingName} storefront and are
          governed by its own{" "}
          <a
            href={LEGAL.parentTermsUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-ink underline underline-offset-2"
          >
            terms and conditions
          </a>
          , including everything to do with payment, shipping, returns, and exchanges —
          not these terms.
        </p>
      </Section>

      <Section title="Availability and liability">
        <p>
          The app is provided &ldquo;as is&rdquo;, without warranty of any kind. We do
          not guarantee uninterrupted availability, and generation may fail or be
          delayed. To the fullest extent permitted by law, we are not liable for
          indirect or consequential loss, or for decisions made on the basis of a
          generated preview. Nothing here limits liability that cannot be limited by
          law, including for death or personal injury caused by negligence.
        </p>
      </Section>

      <Section title="Governing law">
        <p>
          These terms are governed by the laws of India, and{" "}
          <LegalValue value={LEGAL.courts} /> have exclusive jurisdiction over any
          dispute. If you are a consumer resident elsewhere, this does not remove any
          protection your local law gives you that cannot be waived by agreement.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          We may update these terms; material changes will be reflected in the
          &ldquo;last updated&rdquo; date above. Questions about the app or your data go
          to <LegalValue value={LEGAL.privacyEmail} />. For help with an order, contact{" "}
          <LegalValue value={LEGAL.supportEmail} /> or{" "}
          <LegalValue value={LEGAL.supportPhone} />.
        </p>
      </Section>
    </LegalShell>
  );
}
