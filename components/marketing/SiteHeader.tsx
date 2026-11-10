import Link from "next/link";
import { Logo } from "@/components/icons";
import HeaderActions from "@/components/marketing/HeaderActions";
import ThemeToggle from "@/components/ThemeToggle";

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#security", label: "Security" },
  { href: "/#faq", label: "FAQ" },
  { href: "/blog", label: "Blog" },
];

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Outbox home">
          <Logo className="h-8 w-16" />
          <span className="font-brand text-2xl font-semibold tracking-wide text-ink">Outbox</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="btn-ghost">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle signedInOnly className="grid h-11 w-11 place-items-center rounded-xl border border-line text-ink-soft transition-colors hover:bg-mist hover:text-ink" />
          <HeaderActions />
        </div>
      </div>
    </header>
  );
}
