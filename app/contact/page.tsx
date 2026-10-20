import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";
import ContactForm from "@/components/ContactForm";
import JsonLd from "@/components/JsonLd";
import { MailIcon, ShieldIcon } from "@/components/icons";
import { breadcrumbNode, graph, organizationNode, webPageNode, websiteNode } from "@/lib/jsonld";
import { CONTACT_EMAIL, OG_IMAGE, SITE_NAME } from "@/lib/site";

const description =
  "Questions about Outbox, sending from Gmail or Outlook, or your account? Send us a message and we'll get back to you by email.";

export const metadata: Metadata = {
  title: "Contact",
  description,
  alternates: { canonical: "/contact" },
  openGraph: { type: "website", url: "/contact", title: `Contact | ${SITE_NAME}`, description, siteName: SITE_NAME, images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", title: `Contact | ${SITE_NAME}`, description, images: [OG_IMAGE.url] },
};

export default function ContactPage() {
  return (
    <>
      <JsonLd
        data={graph(
          organizationNode(),
          websiteNode(),
          webPageNode({ path: "/contact", name: "Contact", description, type: "ContactPage" }),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Contact", path: "/contact" },
          ])
        )}
      />
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h1 className="font-serif text-4xl text-ink sm:text-5xl">Get in touch</h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-soft">
              Have a question, found a problem, or want to suggest something? Send us a message and we&rsquo;ll reply by email.
            </p>

            <ul className="mt-8 space-y-5 text-sm">
              {CONTACT_EMAIL && (
                <li className="flex gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-deep">
                    <MailIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-medium text-ink">Email</p>
                    <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent-deep underline underline-offset-2">{CONTACT_EMAIL}</a>
                  </div>
                </li>
              )}
              <li className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-deep">
                  <ShieldIcon className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium text-ink">Your privacy</p>
                  <p className="text-ink-soft">
                    We only use your details to reply. See our <Link href="/privacy" className="text-accent-deep underline underline-offset-2">Privacy Policy</Link>.
                  </p>
                </div>
              </li>
            </ul>

            <p className="mt-8 text-sm text-ink-soft">
              Looking for quick answers? Check the <Link href="/#faq" className="text-accent-deep underline underline-offset-2">FAQ</Link> or
              browse the <Link href="/blog" className="text-accent-deep underline underline-offset-2">blog</Link>.
            </p>
          </div>

          <ContactForm />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
