import type { Metadata } from "next";
import LegalPage from "@/components/marketing/LegalPage";
import JsonLd from "@/components/JsonLd";
import { breadcrumbNode, graph, organizationNode, webPageNode, websiteNode } from "@/lib/jsonld";
import { CONTACT_EMAIL, LEGAL_UPDATED, OG_IMAGE, SITE_NAME } from "@/lib/site";

const description =
  "How Outbox handles your account data, connected Gmail and Outlook accounts, and send history. Send-only access, encrypted tokens, no advertising.";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description,
  alternates: { canonical: "/privacy" },
  openGraph: { type: "article", url: "/privacy", title: `Privacy Policy | ${SITE_NAME}`, description, siteName: SITE_NAME, images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", title: `Privacy Policy | ${SITE_NAME}`, description, images: [OG_IMAGE.url] },
};

export default function PrivacyPage() {
  return (
    <>
    <JsonLd
      data={graph(
        organizationNode(),
        websiteNode(),
        webPageNode({ path: "/privacy", name: "Privacy Policy", description }),
        breadcrumbNode([
          { name: "Home", path: "/" },
          { name: "Privacy Policy", path: "/privacy" },
        ])
      )}
    />
    <LegalPage title="Privacy Policy" updated={LEGAL_UPDATED}>
      <p>
        {SITE_NAME} lets you send email from your own Gmail or Outlook account. This policy explains what
        information we handle to make that work, why, and the choices you have. We keep it short because we
        collect as little as we can.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account details.</strong> The email address and password you use to sign in to {SITE_NAME}.
          Passwords are handled by our authentication provider and are stored only as salted hashes.
        </li>
        <li>
          <strong>Profile details.</strong> Your name and profile photo, if you choose to add them. They are shown
          in your account menu.
        </li>
        <li>
          <strong>Contact messages.</strong> If you write to us through the contact form, the name, email address
          and message you send.
        </li>
        <li>
          <strong>Spreadsheet automation (optional).</strong> If you use it, the ID and tab of the Google Sheet you
          link, the column letters you choose, your daily limit, the instructions you save for the AI, and a record of
          which addresses were emailed (so nobody is emailed twice).
        </li>
        <li>
          <strong>Connected mailbox details.</strong> When you connect Gmail or Outlook we store the address of
          that mailbox and the OAuth access and refresh tokens needed to send mail for you. Tokens are encrypted
          before they are stored.
        </li>
        <li>
          <strong>Send history.</strong> For each message you send we keep the sender address, recipient address,
          subject, time and whether it succeeded. <strong>We do not store the body of your messages.</strong>
        </li>
      </ul>

      <h2>How we use Google and Microsoft data</h2>
      <p>
        We request the narrowest permissions needed. For Gmail this is <strong>gmail.send</strong> (send email on
        your behalf) and your account email address. For Outlook this is <strong>Mail.Send</strong>,
        <strong> User.Read</strong> and <strong>offline_access</strong>. {SITE_NAME} cannot read, search, modify or
        delete the messages in your mailbox.
      </p>
      <p>
        If you turn on spreadsheet automation we also request <strong>Google Sheets</strong> access
        (<strong>spreadsheets</strong>). Google words this permission as access to your spreadsheets, but {SITE_NAME}
        reads and writes only the sheet you link: it reads the websites and addresses, and writes a &ldquo;sent&rdquo;
        mark next to addresses it has emailed. This permission is optional and is requested separately from sending mail.
      </p>
      <p>
        The content you write is passed to Google or Microsoft only to deliver the message you asked us to send.
        {" "}{SITE_NAME}&rsquo;s use and transfer of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. We do not use this data for advertising, do not sell it, and do
        not allow humans to read it except where you ask for support, it is needed for security, or the law
        requires it.
      </p>

      <h2>Service providers</h2>
      <p>
        We rely on <strong>Supabase</strong> (authentication and database), <strong>Vercel</strong> (hosting), and
        <strong> Google</strong> and <strong>Microsoft</strong> (the mail services you connect). They process data
        only to provide their service to us and are bound by their own privacy terms.
      </p>

      <h2>AI-assisted drafting</h2>
      <p>
        If you use &ldquo;Generate with AI&rdquo;, the instructions you type are sent to an AI provider, Groq or
        Google (Gemini), which writes a draft. We do not send recipient addresses or the contents of your mailbox.
        Depending on the provider and plan, text sent to a free service may be retained or used by that provider to
        improve its services, so please do not put passwords or confidential information in your instructions. We
        keep only a daily count of drafts per account to apply fair-use limits; we do not store the instructions you type in the compose window or the drafts the AI writes. If you use spreadsheet automation, we store the instructions you save there so they can be reused each day.
      </p>

      <h2>Cookies</h2>
      <p>
        We use only strictly necessary cookies: a sign-in session cookie and a short-lived security cookie during
        the connect-mailbox flow. We do not use advertising or third-party analytics cookies.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        You can disconnect a mailbox at any time from the dashboard, which deletes its stored tokens. You can also
        revoke access from your Google or Microsoft account&rsquo;s app permissions page. You can delete your account at any time in Settings, which permanently removes your account, connected mailboxes, send history and profile photo. Contact messages are kept only as long as needed to reply.
      </p>

      <h2>Security</h2>
      <p>
        Tokens are encrypted at rest with AES-256-GCM, data is protected by row-level access rules so each account
        can reach only its own records, and all traffic uses HTTPS. No system is perfectly secure, but we work to
        protect your information and will tell you if a breach affects you.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live you may have the right to access, correct, export or delete your personal
        information, and to object to or restrict certain processing. To use these rights, contact us using the
        details below.
      </p>

      <h2>Children</h2>
      <p>{SITE_NAME} is not intended for anyone under 16, and we do not knowingly collect their information.</p>

      <h2>Changes to this policy</h2>
      <p>
        If we change this policy we will update the date above and, for material changes, notify you in the app or
        by email.
      </p>

      {CONTACT_EMAIL && (
        <>
          <h2>Contact</h2>
          <p>
            Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </>
      )}
    </LegalPage>
    </>
  );
}
