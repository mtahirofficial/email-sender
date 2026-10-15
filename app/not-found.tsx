import Link from "next/link";
import { Logo } from "@/components/icons";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md text-center">
        <Logo className="mx-auto h-12 w-12" />
        <p className="mt-6 font-serif text-6xl text-accent">404</p>
        <h1 className="mt-2 font-serif text-2xl text-ink">This page could not be found</h1>
        <p className="mt-3 text-ink-soft">
          The link may be broken, or the page may have moved. Head back and try again.
        </p>
        <Link href="/" className="btn-primary mt-8">
          Back to Outbox
        </Link>
      </div>
    </main>
  );
}
