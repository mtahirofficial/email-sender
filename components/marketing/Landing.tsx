import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import GetStartedLink from "@/components/GetStartedLink";
import SiteFooter from "@/components/marketing/SiteFooter";
import { CheckIcon, InboxIcon, LockIcon, MailIcon, SendIcon, ShieldIcon, UsersIcon } from "@/components/icons";
import JsonLd from "@/components/JsonLd";
import { ORG_ID, graph, organizationNode, webPageNode, websiteNode } from "@/lib/jsonld";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";

const STEPS = [
  {
    title: "Connect your mailbox",
    body: "Sign in with Google or Microsoft and approve send-only access. Outbox never asks to read your mail.",
  },
  {
    title: "Write your message",
    body: "Pick the sender, add as many recipients as you need, and use one subject for everyone or a different one for each.",
  },
  {
    title: "Send individually",
    body: "Every recipient gets their own email from your real address, never a shared To, Cc or Bcc line.",
  },
];

const FEATURES = [
  {
    Icon: MailIcon,
    title: "Your real address",
    body: "Mail goes out through Google's or Microsoft's own servers, so it is authenticated exactly like a message you sent yourself.",
  },
  {
    Icon: UsersIcon,
    title: "One email per recipient",
    body: "No Cc, no Bcc. Nobody sees who else received your message, and each send succeeds or fails on its own.",
  },
  {
    Icon: SendIcon,
    title: "Subjects that fit each person",
    body: "Keep one subject for all, or flip a switch and tailor the subject line for every recipient in seconds.",
  },
  {
    Icon: InboxIcon,
    title: "Sent history",
    body: "See every send attempt with its recipient, subject, time and result, so you always know what went out.",
  },
  {
    Icon: CheckIcon,
    title: "Gmail and Outlook",
    body: "Connect one account or several, personal or work, and choose the sender for each message.",
  },
  {
    Icon: LockIcon,
    title: "Private by design",
    body: "Send-only permissions, encrypted tokens and a Disconnect button you can press whenever you like.",
  },
];

const FAQ = [
  {
    q: "Is this email spoofing?",
    a: "No. Spoofing means forging a sender address. Outbox does the opposite: you connect your real Gmail or Outlook account, and Google or Microsoft sends the message from it. You can only send as mailboxes you have actually connected and approved.",
  },
  {
    q: "Can Outbox read my inbox?",
    a: "No. Outbox asks only for permission to send mail (Gmail's gmail.send and Microsoft's Mail.Send) plus your address, so it can label the connection. It cannot read, search or delete your messages. If you choose to turn on spreadsheet automation, it separately asks for Google Sheets access, which is optional.",
  },
  {
    q: "Which email accounts work?",
    a: "Gmail and Google Workspace accounts, plus Outlook.com, Hotmail and Microsoft 365 accounts. You can connect more than one and choose the sender per message.",
  },
  {
    q: "Will recipients see each other's addresses?",
    a: "No. Each recipient receives a separate email, so there is no shared To, Cc or Bcc line. This also lets you give each person their own subject.",
  },
  {
    q: "Are there sending limits?",
    a: "Yes, but they come from Google and Microsoft, not from Outbox. Each provider caps how many messages a mailbox can send per day, and those limits apply to mail sent through Outbox too.",
  },
  {
    q: "How do I disconnect an account?",
    a: "Press Disconnect next to the account in your dashboard to delete its stored tokens. You can also revoke access any time from your Google or Microsoft account's app permissions page.",
  },
];

const jsonLd = graph(
  organizationNode(),
  websiteNode(),
  webPageNode({ path: "/", name: SITE_TITLE, description: SITE_DESCRIPTION }),
  {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#app`,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any (web browser)",
    publisher: { "@id": ORG_ID },
    featureList: [
      "Send from your own Gmail or Outlook address",
      "Separate email for every recipient",
      "Per-recipient subject lines",
      "Sent history",
      "Send-only access",
    ],
  },
  {
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  }
);

function LetterMock() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="absolute inset-0 translate-x-4 translate-y-5 rotate-3 rounded-2xl border border-line bg-mist" />
      <div className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-lift">
        <div className="airmail h-2.5" />
        <div className="space-y-4 p-6 text-sm">
          <div className="flex items-center gap-3 border-b border-line pb-3">
            <span className="w-14 text-ink-soft">From</span>
            <span className="rounded-md bg-accent-soft px-2 py-1 text-accent-deep">you@gmail.com</span>
          </div>
          <div className="flex items-center gap-3 border-b border-line pb-3">
            <span className="w-14 text-ink-soft">To</span>
            <span className="rounded-md bg-mist px-2 py-1 text-ink">maya@studio.co</span>
            <span className="rounded-md bg-mist px-2 py-1 text-ink">omar@firm.com</span>
          </div>
          <div className="flex items-center gap-3 border-b border-line pb-3">
            <span className="w-14 text-ink-soft">Subject</span>
            <span className="text-ink">Your invoice for October</span>
          </div>
          <div className="space-y-2 pt-1">
            <div className="h-2.5 w-11/12 rounded-full bg-line" />
            <div className="h-2.5 w-4/5 rounded-full bg-line" />
            <div className="h-2.5 w-3/5 rounded-full bg-line" />
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 font-medium text-white">
              <SendIcon className="h-4 w-4" /> Send 2 separate emails
            </span>
            <span className="pill border-accent/20 bg-accent-soft text-accent-deep">
              <CheckIcon className="h-3.5 w-3.5" /> Sent
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <>
      <JsonLd data={jsonLd} />
      <SiteHeader />

      <main id="main" className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 md:pt-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="pill border-accent/20 bg-accent-soft text-accent-deep">
              <ShieldIcon className="h-3.5 w-3.5" /> Send-only access to Gmail and Outlook
            </p>
            <h1 className="mt-6 font-serif text-4xl leading-[1.1] text-ink sm:text-5xl lg:text-6xl">
              Send email that arrives from <span className="text-accent">your own address.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
              Connect your Gmail or Outlook account once, then send individual emails, each with its own
              subject, straight from your real mailbox. No spoofing, no shared sending domain, nothing for a
              recipient to doubt.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <GetStartedLink className="btn-primary px-6" />
              <Link href="/#how-it-works" className="btn-secondary px-6">
                See how it works
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
              {["Your inbox stays private", "One email per recipient", "Disconnect anytime"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckIcon className="h-4 w-4 text-accent" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <LetterMock />
        </section>

        {/* Providers */}
        <section aria-label="Supported providers" className="border-y border-line bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-6 text-sm text-ink-soft sm:px-6">
            <span className="font-medium text-ink">Works with</span>
            <span>Gmail &amp; Google Workspace</span>
            <span>Outlook.com &amp; Hotmail</span>
            <span>Microsoft 365</span>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
          <h2 className="font-serif text-3xl text-ink sm:text-4xl">How it works</h2>
          <p className="mt-3 max-w-2xl text-ink-soft">Three steps, and the first one only happens once.</p>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="card p-6">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-accent font-serif text-lg text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-serif text-xl text-ink">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-24 bg-mist">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="font-serif text-3xl text-ink sm:text-4xl">Everything you need to send, nothing you do not</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ Icon, title, body }) => (
                <article key={title} className="rounded-2xl border border-line bg-white p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent-soft text-accent-deep">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-serif text-xl text-ink">{title}</h3>
                  <p className="mt-2 leading-relaxed text-ink-soft">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="mx-auto grid max-w-6xl scroll-mt-24 gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="font-serif text-3xl text-ink sm:text-4xl">Permission to send. Nothing more.</h2>
            <p className="mt-4 max-w-lg leading-relaxed text-ink-soft">
              Outbox asks only for the access it needs to deliver the message you wrote. You stay in control of
              your mailbox the whole time.
            </p>
          </div>
          <ul className="space-y-5">
            {[
              ["Send-only permissions", "We request gmail.send and Mail.Send. Outbox cannot read, search or delete anything in your mailbox."],
              ["Encrypted at rest", "Access and refresh tokens are encrypted with AES-256-GCM before they are stored."],
              ["Isolated accounts", "Row-level security means every record is reachable only by the account that owns it."],
              ["Revoke whenever you want", "Disconnect inside Outbox, or remove access from your Google or Microsoft account's app permissions."],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-deep">
                  <ShieldIcon className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="font-medium text-ink">{title}</h3>
                  <p className="mt-1 leading-relaxed text-ink-soft">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24 border-t border-line bg-white">
          <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
            <h2 className="font-serif text-3xl text-ink sm:text-4xl">Frequently asked questions</h2>
            <div className="mt-8 divide-y divide-line border-y border-line">
              {FAQ.map((item) => (
                <details key={item.q} className="group py-1">
                  <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span
                      aria-hidden="true"
                      className="text-xl text-accent transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="pb-5 pr-8 leading-relaxed text-ink-soft">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 py-20 sm:px-6">
          <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl bg-accent-deep px-8 py-14 text-center text-white">
            <div className="airmail absolute inset-x-0 top-0 h-2.5" aria-hidden="true" />
            <h2 className="font-serif text-3xl sm:text-4xl">Ready to send from your own address?</h2>
            <p className="mx-auto mt-4 max-w-xl text-white/80">
              Connect a mailbox in under a minute and send your first message.
            </p>
            <GetStartedLink className="btn-secondary mt-8 px-7" />
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
