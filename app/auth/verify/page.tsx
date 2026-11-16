import type { Metadata } from "next";
import AuthLinkConfirm from "@/components/AuthLinkConfirm";

export const metadata: Metadata = { title: "Verify account email", robots: { index: false, follow: false } };

export default async function VerifyAuthLinkPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const params = await searchParams;
  return <AuthLinkConfirm tokenHash={params.token_hash ?? ""} type={params.type ?? ""} />;
}
