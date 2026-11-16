"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertIcon, SpinnerIcon } from "@/components/icons";

export default function AuthLinkConfirm({ tokenHash, type }: { tokenHash: string; type: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(!tokenHash || !["signup", "recovery"].includes(type) ? "This verification link is invalid." : "");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify-link", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenHash, type }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not verify this link.");
      router.replace(result.next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify this link.");
      setBusy(false);
    }
  }

  return <main id="main" className="flex flex-1 items-center justify-center px-5 py-12"><section className="card w-full max-w-md p-7 text-center"><h1 className="font-serif text-3xl text-ink">{type === "recovery" ? "Continue password reset" : "Confirm your email"}</h1><p className="mt-3 text-sm leading-relaxed text-ink-soft">Press the button to securely verify this request and continue to Outbox.</p>{error && <p role="alert" className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-left text-sm text-red-800"><AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}<button type="button" onClick={() => void confirm()} disabled={busy || !tokenHash || Boolean(error)} className="btn-primary mt-6 w-full">{busy && <SpinnerIcon />} {busy ? "Verifying…" : "Continue securely"}</button>{error && <Link href="/forgot-password" className="mt-4 inline-block text-sm text-accent-deep underline underline-offset-2">Request a new email</Link>}</section></main>;
}
