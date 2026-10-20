import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/marketing/SiteFooter";

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="font-serif text-4xl text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink-soft">Last updated: {updated}</p>
        <div
          className="mt-8 leading-relaxed text-ink-soft
            [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:text-ink
            [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-1.5
            [&_a]:text-accent-deep [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-ink"
        >
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
