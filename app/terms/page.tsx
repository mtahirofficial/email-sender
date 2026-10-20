import type { Metadata } from "next";
import LegalPage from "@/components/marketing/LegalPage";
import JsonLd from "@/components/JsonLd";
import { breadcrumbNode, graph, organizationNode, webPageNode, websiteNode } from "@/lib/jsonld";
import { CONTACT_EMAIL, LEGAL_UPDATED, OG_IMAGE, SITE_NAME } from "@/lib/site";

const description =
  "The terms for using Outbox: acceptable use, your connected mail accounts, sending limits, and our responsibilities.";

export const metadata: Metadata = {
  title: "Terms of Service",
  description,
  alternates: { canonical: "/terms" },
  openGraph: { type: "article", url: "/terms", title: `Terms of Service | ${SITE_NAME}`, description, siteName: SITE_NAME, images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", title: `Terms of Service | ${SITE_NAME}`, description, images: [OG_IMAGE.url] },
};

export default function TermsPage() {
  return (
    <>
    <JsonLd
      data={graph(
        organizationNode(),
        websiteNode(),
        webPageNode({ path: "/terms", name: "Terms of Service", description }),
        breadcrumbNode([
          { name: "Home", path: "/" },
          { name: "Terms of Service", path: "/terms" },
        ])
      )}
    />
    <LegalPage title="Terms of Service" updated={LEGAL_UPDATED}>
      <p>
        By creating an account or using {SITE_NAME} you agree to these terms. If you do not agree, please do not
        use the service.
      </p>

      <h2>The service</h2>
      <p>
        {SITE_NAME} is a tool that sends email through a Gmail or Outlook account that you connect and control.
        Messages are delivered by Google or Microsoft from your own address; {SITE_NAME} does not send mail from
        its own servers and does not let you send as an address you do not own.
      </p>

      <h2>Your account and connected mailboxes</h2>
      <ul>
        <li>You must provide accurate information and keep your sign-in credentials secure.</li>
        <li>You may connect only mailboxes you own or are authorised to use.</li>
        <li>You are responsible for everything sent from your account and connected mailboxes.</li>
        <li>You can disconnect a mailbox or stop using the service at any time.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>You agree not to use {SITE_NAME} to:</p>
      <ul>
        <li>send spam, unsolicited bulk email, phishing, scams or deceptive messages;</li>
        <li>impersonate another person or organisation, or misrepresent who a message is from;</li>
        <li>send unlawful, harassing, hateful or malicious content, or malware;</li>
        <li>break the terms or sending limits of Google, Microsoft or any other provider; or</li>
        <li>violate anti-spam, privacy or data-protection laws that apply to you or your recipients.</li>
      </ul>
      <p>
        Gmail and Outlook apply their own daily sending limits and abuse controls. They may restrict your mailbox
        independently of {SITE_NAME}, and we are not responsible for those decisions.
      </p>

      <h2>Third-party services</h2>
      <p>
        The service depends on Google, Microsoft, Supabase and Vercel. Their availability and terms are outside our
        control, and your use of Google and Microsoft accounts is also governed by their terms.
      </p>

      <h2>Availability and changes</h2>
      <p>
        We work to keep {SITE_NAME} reliable, but it is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;
        without warranties of any kind. We may change, suspend or discontinue features, and we may suspend accounts
        that break these terms.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, {SITE_NAME} and its operators are not liable for indirect,
        incidental or consequential damages, or for lost profits, data or business, arising from your use of the
        service, including messages that are delayed, rejected or not delivered.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms from time to time. Continuing to use the service after an update means you accept
        the new terms.
      </p>

      {CONTACT_EMAIL && (
        <>
          <h2>Contact</h2>
          <p>
            Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </>
      )}
    </LegalPage>
    </>
  );
}
