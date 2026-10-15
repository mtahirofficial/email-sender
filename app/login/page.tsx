"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AlertIcon, CheckIcon, EyeIcon, EyeOffIcon, InfoIcon, Logo, SpinnerIcon } from "@/components/icons";

const BENEFITS = [
  "Send from your real Gmail or Outlook address",
  "One separate email per recipient, never Cc or Bcc",
  "Send-only access. Your inbox stays private",
];

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<{ type: "error" | "info"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    if (mode === "sign_in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setStatus({ type: "error", message: error.message });
        return;
      }
      router.push("/");
      router.refresh();
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setLoading(false);
      if (error) {
        setStatus({ type: "error", message: error.message });
        return;
      }
      setStatus({
        type: "info",
        message: "Check your inbox to confirm your address, then sign in.",
      });
      setMode("sign_in");
    }
  }

  const isSignIn = mode === "sign_in";

  return (
    <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-accent-deep p-12 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Outbox home">
          <Logo className="h-9 w-9" />
          <span className="font-serif text-2xl">Outbox</span>
        </Link>

        <div>
          <p className="font-serif text-4xl leading-tight">Email that arrives from your own address.</p>
          <ul className="mt-8 space-y-4">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-3 text-white/90">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/15">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <div className="airmail absolute inset-x-0 bottom-0 h-3" aria-hidden="true" />
      </aside>

      <main id="main" className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2.5 lg:hidden" aria-label="Outbox home">
            <Logo className="h-9 w-9" />
            <span className="font-serif text-2xl text-ink">Outbox</span>
          </Link>

          <h1 className="font-serif text-3xl text-ink">{isSignIn ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-2 text-sm text-ink-soft">
            {isSignIn
              ? "Sign in to send from your connected mailboxes."
              : "Takes a minute. You'll connect Gmail or Outlook next."}
          </p>

          <div className="card mt-7 p-6">
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-mist p-1 text-sm">
              {(["sign_in", "sign_up"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`min-h-[44px] rounded-md transition-colors ${
                    mode === m ? "bg-white font-medium text-ink shadow-sm" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {m === "sign_in" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="label">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete={isSignIn ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pr-12"
                    placeholder="At least 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-0 top-0 grid h-full w-11 place-items-center text-ink-soft hover:text-ink"
                  >
                    {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div aria-live="polite">
                {status && (
                  <p
                    role={status.type === "error" ? "alert" : "status"}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                      status.type === "error"
                        ? "border-red-200 bg-red-50 text-red-800"
                        : "border-accent/20 bg-accent-soft text-accent-deep"
                    }`}
                  >
                    {status.type === "error" ? (
                      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    {status.message}
                  </p>
                )}
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading && <SpinnerIcon />}
                {loading ? "Please wait…" : isSignIn ? "Sign in" : "Create account"}
              </button>
            </form>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-ink-soft">
            This account only signs you into Outbox. To send mail you&rsquo;ll connect a Gmail or Outlook account
            afterward; that&rsquo;s the address recipients see. By continuing you agree to our{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
