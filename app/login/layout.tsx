import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth";

// Crawlable (so Google can read this tag) but kept out of search results.
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in or create your Outbox account to send email from your own Gmail or Outlook address.",
  robots: { index: false, follow: true },
};

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  // Already signed in? Nothing to do here, go to Compose.
  const user = await getOptionalUser();
  if (user) redirect("/compose");

  return children;
}
