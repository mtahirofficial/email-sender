"use client";

import { useState } from "react";
import { AlertIcon, CheckIcon, SpinnerIcon, XIcon } from "@/components/icons";

export default function SmtpAccountConnectForm({ onClose, onConnected }: { onClose: () => void; onConnected: (email: string) => void }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("465");
  const [secure, setSecure] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [connected, setConnected] = useState("");

  async function connect() {
    setBusy(true);
    setProblem("");
    try {
      const response = await fetch("/api/accounts/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port: Number(port), secure, username, password, email }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not connect this mail server.");
      setConnected(result.email as string);
      onConnected(result.email as string);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Could not connect this mail server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="smtp-connect-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-lift sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="smtp-connect-title" className="font-serif text-xl">Connect a mail server</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">Use Hostinger or any provider that gives you SMTP sending details. We test the connection before saving it.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-mist hover:text-ink"><XIcon className="h-4 w-4" /></button>
        </div>

        {connected ? (
          <div role="status" className="rounded-xl border border-accent/20 bg-accent-soft p-4 text-sm text-accent-deep">
            <p className="flex items-center gap-2 font-semibold"><CheckIcon className="h-4 w-4" /> Mail server connected</p>
            <p className="mt-1">{connected} is ready to send. Close this window to see it in your sending accounts.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">SMTP host
                <input autoFocus className="input mt-1.5" placeholder="smtp.example.com" value={host} onChange={(event) => setHost(event.target.value)} />
              </label>
              <label className="text-sm font-medium">Port
                <input className="input mt-1.5" type="number" inputMode="numeric" min="1" max="65535" placeholder="465" value={port} onChange={(event) => setPort(event.target.value)} />
              </label>
              <label className="text-sm font-medium">Mailbox username
                <input className="input mt-1.5" autoComplete="username" placeholder="you@yourdomain.com" value={username} onChange={(event) => setUsername(event.target.value)} />
              </label>
              <label className="text-sm font-medium">Mailbox password
                <input className="input mt-1.5" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              <label className="text-sm font-medium sm:col-span-2">Send from this email
                <input className="input mt-1.5" type="email" autoComplete="email" placeholder="you@yourdomain.com" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper p-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-accent" checked={secure} onChange={(event) => setSecure(event.target.checked)} />
              <span><span className="block font-medium">Use secure SSL/TLS</span><span className="mt-0.5 block text-xs text-ink-soft">Usually on for 465. For port 587, switch this off; STARTTLS will be used automatically.</span></span>
            </label>
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">Your SMTP password is encrypted before storage and only used to send from your mailbox. This connection can’t read replies. Use Inbox with Gmail for reply tracking.</p>
            {problem && <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"><AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />{problem}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
              <button type="button" onClick={() => void connect()} disabled={busy} className="btn-primary min-h-10 px-4">{busy ? <SpinnerIcon /> : null}Test and connect</button>
            </div>
          </>
        )}
        {connected && <div className="mt-5 flex justify-end"><button type="button" onClick={onClose} className="btn-primary min-h-10 px-4">Done</button></div>}
      </section>
    </div>
  );
}
