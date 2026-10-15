import Link from "next/link";
import { Logo } from "@/components/icons";

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#security", label: "Security" },
  { href: "/#faq", label: "FAQ" },
];

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Outbox home">
          <Logo className="h-8 w-8" />
          <span className="font-serif text-xl text-ink">Outbox</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="btn-ghost">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/login" className="btn-secondary">
            Sign in
          </Link>
          <Link href="/login" className="btn-primary hidden sm:inline-flex">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
