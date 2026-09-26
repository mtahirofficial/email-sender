"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <p className="font-serif text-2xl text-ink">Outbox</p>
          <p className="mt-1 text-sm text-ink-soft">
            Send email that arrives from your own address.
          </p>
        </div>

        <div className="border border-line bg-white">
          <div className="flex border-b border-line text-sm">
            <button
              type="button"
              onClick={() => setMode("sign_in")}
              className={`flex-1 py-3 ${
                mode === "sign_in" ? "text-ink font-medium" : "text-ink-soft"
              }`}
              aria-pressed={mode === "sign_in"}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("sign_up")}
              className={`flex-1 py-3 border-l border-line ${
                mode === "sign_up" ? "text-ink font-medium" : "text-ink-soft"
              }`}
              aria-pressed={mode === "sign_up"}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm text-ink-soft mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-line px-3 py-2 text-sm text-ink bg-paper focus:bg-white"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm text-ink-soft mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-line px-3 py-2 text-sm text-ink bg-paper focus:bg-white"
                placeholder="At least 6 characters"
              />
            </div>

            {status && (
              <p
                className={`text-sm ${
                  status.type === "error" ? "text-red-700" : "text-accent-deep"
                }`}
              >
                {status.message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-white text-sm py-2.5 hover:bg-accent-deep transition-colors disabled:opacity-60"
            >
              {loading ? "Please wait…" : mode === "sign_in" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-xs text-ink-soft leading-relaxed">
          This account only signs you into Outbox. To actually send mail, you'll
          connect a Gmail or Outlook account afterward — that's what appears in
          the recipient's inbox as the sender.
        </p>
      </div>
    </main>
  );
}
