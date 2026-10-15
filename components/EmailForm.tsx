"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectedAccount } from "@/lib/accounts";
import { AlertIcon, CheckIcon, InfoIcon, SendIcon, SpinnerIcon } from "@/components/icons";

type SendResult = {
  ok: boolean;
  from?: string;
  sentCount?: number;
  failedCount?: number;
  results?: { to: string; ok: boolean; error?: string }[];
  error?: string;
};

// Per-recipient subject rows: fixed row height so exactly 10 fit before scrolling.
const ROW_HEIGHT_PX = 44;
const MAX_VISIBLE_ROWS = 10;

/** Splits the recipients field on commas, semicolons and new lines, without duplicates. */
function parseRecipients(raw: string): string[] {
  const parts = raw
    .split(/[\n,;]/)
    .map((r) => r.trim())
    .filter(Boolean);
  return Array.from(new Set(parts));
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function EmailForm({ accounts }: { accounts: ConnectedAccount[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  // true  = one subject for everyone (the main Subject input)
  // false = each recipient has their own subject row; the main input is hidden
  const [sameSubject, setSameSubject] = useState(true);
  const [perSubjects, setPerSubjects] = useState<Record<string, string>>({});

  const hasAccounts = accounts.length > 0;
  const recipients = useMemo(() => parseRecipients(to), [to]);
  const rowRecipients = useMemo(() => recipients.filter(looksLikeEmail), [recipients]);
  const recipientCount = recipients.length;

  function handleToChange(value: string) {
    setTo(value);

    // While in per-recipient mode, a newly added recipient starts with the
    // main subject as it is right now. Existing rows are left untouched.
    if (!sameSubject) {
      const added = parseRecipients(value)
        .filter(looksLikeEmail)
        .filter((email) => !Object.prototype.hasOwnProperty.call(perSubjects, email));
      if (added.length > 0) {
        setPerSubjects((prev) => {
          const next = { ...prev };
          for (const email of added) {
            if (!Object.prototype.hasOwnProperty.call(next, email)) next[email] = subject;
          }
          return next;
        });
      }
    }
  }

  function toggleSameSubject() {
    if (sameSubject) {
      // Turning OFF: copy the main subject into every recipient's row once.
      // The main input is hidden while off, and its text is kept for later.
      const filled: Record<string, string> = {};
      for (const email of rowRecipients) filled[email] = subject;
      setPerSubjects(filled);
      setSameSubject(false);
    } else {
      setSameSubject(true);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setSending(true);

    const payload = sameSubject
      ? { accountId, to, subject, body: message }
      : {
          accountId,
          to,
          subject,
          subjects: Object.fromEntries(recipients.map((r) => [r, perSubjects[r] ?? subject])),
          body: message,
        };

    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    setSending(false);
    setResult(data);
    router.refresh();

    if (res.ok && data.ok) {
      setTo("");
      setSubject("");
      setMessage("");
      setPerSubjects({});
    }
  }

  const total = (result?.sentCount ?? 0) + (result?.failedCount ?? 0);

  return (
    <section aria-labelledby="compose-heading" className="card overflow-hidden">
      <div className="airmail h-2" aria-hidden="true" />
      <div className="p-5 sm:p-7">
        <h2 id="compose-heading" className="font-serif text-2xl text-ink">
          Compose
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Recipients see exactly the &ldquo;From&rdquo; address you pick. Each one gets their own separate email,
          not a shared To, Cc or Bcc line.
        </p>

        {!hasAccounts ? (
          <div className="mt-6 rounded-xl border border-dashed border-line bg-paper px-5 py-10 text-center">
            <InfoIcon className="mx-auto h-6 w-6 text-ink-soft" />
            <p className="mt-3 text-sm text-ink-soft">
              Connect a Gmail or Outlook account before composing.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="from" className="label">
                From
              </label>
              <select
                id="from"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="input"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email} ({account.provider === "google" ? "Gmail" : "Outlook"})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="to" className="label">
                To
                {recipientCount > 1 && (
                  <span className="pill ml-2 border-accent/20 bg-accent-soft align-middle text-accent-deep">
                    {recipientCount} separate emails
                  </span>
                )}
              </label>
              <textarea
                id="to"
                required
                rows={3}
                value={to}
                onChange={(e) => handleToChange(e.target.value)}
                placeholder="one@example.com, two@example.com&#10;or one per line"
                className="input resize-y"
              />
              <p className="mt-1.5 text-xs text-ink-soft">
                Separate multiple addresses with a comma or a new line.
              </p>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                {sameSubject ? (
                  <label htmlFor="subject" className="text-sm font-medium text-ink">
                    Subject
                  </label>
                ) : (
                  <span id="subject-heading" className="text-sm font-medium text-ink">
                    Subject <span className="font-normal text-ink-soft">for each recipient</span>
                  </span>
                )}

                <button
                  type="button"
                  role="switch"
                  aria-checked={sameSubject}
                  onClick={toggleSameSubject}
                  className="-my-1.5 inline-flex min-h-[44px] items-center gap-2.5 rounded-lg px-1 text-xs text-ink-soft hover:text-ink sm:text-sm"
                >
                  <span>Same subject for all</span>
                  <span
                    aria-hidden="true"
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      sameSubject ? "bg-accent" : "bg-ink-soft/70"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        sameSubject ? "translate-x-[22px]" : "translate-x-0.5"
                      }`}
                    />
                  </span>
                </button>
              </div>

              {sameSubject && (
                <input
                  id="subject"
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="input"
                />
              )}

              {!sameSubject &&
                (rowRecipients.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line bg-paper px-4 py-3 text-xs text-ink-soft">
                    Add recipients above to set a separate subject for each one.
                  </p>
                ) : (
                  <div
                    role="group"
                    aria-labelledby="subject-heading"
                    className="divide-y divide-line overflow-y-auto rounded-lg border border-line bg-white"
                    style={{ maxHeight: ROW_HEIGHT_PX * MAX_VISIBLE_ROWS + 2 }}
                  >
                    {rowRecipients.map((email) => (
                      <div
                        key={email}
                        className="flex items-center gap-3 px-3"
                        style={{ height: ROW_HEIGHT_PX }}
                      >
                        <span className="w-2/5 shrink-0 truncate text-xs text-ink-soft" title={email}>
                          {email}
                        </span>
                        <input
                          type="text"
                          required
                          aria-label={`Subject for ${email}`}
                          value={perSubjects[email] ?? subject}
                          onChange={(e) =>
                            setPerSubjects((prev) => ({ ...prev, [email]: e.target.value }))
                          }
                          className="input-sm min-w-0 flex-1"
                        />
                      </div>
                    ))}
                  </div>
                ))}
            </div>

            <div>
              <label htmlFor="body" className="label">
                Message
              </label>
              <textarea
                id="body"
                required
                rows={8}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="input resize-y"
              />
            </div>

            <div aria-live="polite">
              {result?.error && (
                <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> {result.error}
                </p>
              )}
              {typeof result?.sentCount === "number" && (
                <div
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    result.failedCount
                      ? "border-amber/30 bg-amber-soft text-amber"
                      : "border-accent/20 bg-accent-soft text-accent-deep"
                  }`}
                >
                  <p className="flex items-center gap-2 font-medium">
                    {result.failedCount ? (
                      <AlertIcon className="h-4 w-4 shrink-0" />
                    ) : (
                      <CheckIcon className="h-4 w-4 shrink-0" />
                    )}
                    Sent {result.sentCount} of {total} from {result.from}.
                  </p>
                  {result.results
                    ?.filter((r) => !r.ok)
                    .map((r) => (
                      <p key={r.to} className="mt-1 pl-6 text-xs text-red-700">
                        Failed: {r.to}
                      </p>
                    ))}
                </div>
              )}
            </div>

            <button type="submit" disabled={sending} className="btn-primary w-full sm:w-auto">
              {sending ? <SpinnerIcon /> : <SendIcon className="h-4 w-4" />}
              {sending
                ? "Sending…"
                : recipientCount > 1
                ? `Send ${recipientCount} separate emails`
                : "Send"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
