"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AlertIcon, CheckIcon, InfoIcon, SpinnerIcon } from "@/components/icons";

type Notice = { error: boolean; text: string } | null;

export default function ForgotPasswordForm({ resetOnly = false }: { resetOnly?: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("link") === "expired") {
      setNotice({ error: true, text: "That reset link has expired or was already used. Request a new reset email." });
    }
  }, []);

  async function requestReset(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    const response = await fetch("/api/auth/recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    // Keep the response generic so the form does not reveal whether the address has an account.
    if (!response.ok) {
      setNotice({ error: true, text: result.error ?? "We couldn't send the reset email. Try again." });
      return;
    }
    setSent(true);
    setNotice({ error: false, text: "If an account uses that address, a reset email is on its way. Use its link or enter its security code below." });
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "recovery" });
    setLoading(false);
    if (error) {
      setNotice({ error: true, text: "That code is invalid or has expired. Request a new reset email and try again." });
      return;
    }
    setVerified(true);
  }

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (password.length < 8) return setNotice({ error: true, text: "Use at least 8 characters for your new password." });
    if (password !== confirm) return setNotice({ error: true, text: "The passwords do not match." });
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setNotice({ error: true, text: error.message });
      return;
    }
    await fetch("/api/auth/password-changed", { method: "POST" }).catch(() => undefined);
    await supabase.auth.signOut();
    router.replace("/login?password=updated");
    router.refresh();
  }

  async function backToSignIn() {
    setLoading(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const canSetPassword = verified || resetOnly;

  return (
    <main id="main" className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <button type="button" onClick={() => void backToSignIn()} disabled={loading} className="mb-8 inline-flex items-center text-sm text-accent-deep underline underline-offset-2">Back to sign in</button>
        <h1 className="font-serif text-3xl text-ink">{canSetPassword ? "Choose a new password" : "Forgot your password?"}</h1>
        <p className="mt-2 text-sm text-ink-soft">{canSetPassword ? "Set a new password for your Outbox account." : "We’ll email you a secure reset link and a one-time security code. Use either one."}</p>
        <section className="card mt-6 space-y-5 p-6">
          {canSetPassword ? (
            <form onSubmit={updatePassword} className="space-y-4">
              <label className="block"><span className="label">New password</span><input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="input" /></label>
              <label className="block"><span className="label">Confirm new password</span><input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" /></label>
              <button type="submit" disabled={loading} className="btn-primary w-full">{loading && <SpinnerIcon />}Update password</button>
            </form>
          ) : (
            <>
              <form onSubmit={requestReset} className="space-y-4">
                <label className="block"><span className="label">Email</span><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" /></label>
                <button type="submit" disabled={loading} className="btn-primary w-full">{loading && <SpinnerIcon />}Email reset options</button>
              </form>
              {sent && <form onSubmit={verifyCode} className="space-y-4 border-t border-line pt-5">
                <label className="block"><span className="label">Security code</span><input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} className="input" placeholder="Enter the code from your email" /></label>
                <button type="submit" disabled={loading} className="btn-secondary w-full">{loading && <SpinnerIcon />}Verify code</button>
              </form>}
            </>
          )}
          {notice && <p role={notice.error ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${notice.error ? "border-red-200 bg-red-50 text-red-800" : "border-accent/20 bg-accent-soft text-accent-deep"}`}>
            {notice.error ? <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> : canSetPassword && !verified ? <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />}{notice.text}
          </p>}
        </section>
      </div>
    </main>
  );
}
