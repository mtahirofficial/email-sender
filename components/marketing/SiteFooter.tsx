import Link from "next/link";
import { Logo } from "@/components/icons";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <Logo className="h-7 w-7" />
            <span className="font-serif text-lg text-ink">{SITE_NAME}</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Send individual emails from your own Gmail or Outlook address, with send-only access.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
          <Link href="/login" className="btn-ghost">Sign in</Link>
          <Link href="/privacy" className="btn-ghost">Privacy Policy</Link>
          <Link href="/terms" className="btn-ghost">Terms of Service</Link>
          {CONTACT_EMAIL && (
            <a href={`mailto:${CONTACT_EMAIL}`} className="btn-ghost">
              {CONTACT_EMAIL}
            </a>
          )}
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-ink-soft sm:px-6">
          &copy; {new Date().getFullYear()} {SITE_NAME}. Gmail is a trademark of Google LLC. Outlook and
          Microsoft 365 are trademarks of Microsoft. {SITE_NAME} is not affiliated with Google or Microsoft.
        </p>
      </div>
    </footer>
  );
}
