import type { Metadata } from "next";

// Crawlable (so Google can read this tag) but kept out of search results.
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in or create your Outbox account to send email from your own Gmail or Outlook address.",
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
