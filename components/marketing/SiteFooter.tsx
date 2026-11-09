import Link from "next/link";
import { Logo } from "@/components/icons";
import { SITE_NAME } from "@/lib/site";

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="flex w-full flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <Logo className="h-7 w-14" />
            <span className="font-brand text-lg font-semibold tracking-wide text-ink">{SITE_NAME}</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Send individual emails from your own Gmail or Outlook address, with send-only access.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
          <Link href="/blog" className="btn-ghost">Blog</Link>
          <Link href="/contact" className="btn-ghost">Contact</Link>
          <Link href="/privacy" className="btn-ghost">Privacy Policy</Link>
          <Link href="/terms" className="btn-ghost">Terms of Service</Link>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="w-full px-4 py-5 text-xs text-ink-soft sm:px-6">
          &copy; {new Date().getFullYear()} {SITE_NAME}. Gmail is a trademark of Google LLC. Outlook and
          Microsoft 365 are trademarks of Microsoft. {SITE_NAME} is not affiliated with Google or Microsoft.
        </p>
      </div>
    </footer>
  );
}
