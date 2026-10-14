"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectedAccount } from "@/lib/accounts";

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
  // false = each recipient has their own subject row below the main input
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
      // Editing the main input afterwards does not touch the rows.
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

  return (
    <section aria-labelledby="compose-heading">
      <h2 id="compose-heading" className="font-serif text-lg text-ink mb-1">
        Compose
      </h2>
      <p className="text-sm text-ink-soft mb-4">
        The recipient sees exactly the "From" address you pick — this app
        never substitutes its own. Add several recipients and each one gets
        their own separate email, not a shared To/Cc/Bcc line.
      </p>

      {!hasAccounts ? (
        <div className="border border-line bg-white px-4 py-6 text-sm text-ink-soft">
          Connect a Gmail or Outlook account on the left before composing.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="border border-line bg-white p-5 space-y-4">
          <div>
            <label htmlFor="from" className="block text-sm text-ink-soft mb-1.5">
              From
            </label>
            <select
              id="from"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full border border-line px-3 py-2 text-sm text-ink bg-paper focus:bg-white"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.email} ({account.provider === "google" ? "Gmail" : "Outlook"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="to" className="block text-sm text-ink-soft mb-1.5">
              To
              {recipientCount > 1 && (
                <span className="text-ink-soft"> — {recipientCount} separate emails</span>
              )}
            </label>
            <textarea
              id="to"
              required
              rows={3}
              value={to}
              onChange={(e) => handleToChange(e.target.value)}
              placeholder="one@example.com, two@example.com&#10;or one per line"
              className="w-full border border-line px-3 py-2 text-sm text-ink bg-paper focus:bg-white resize-y"
            />
            <p className="text-xs text-ink-soft mt-1">
              Separate multiple addresses with a comma or a new line.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <label htmlFor="subject" className="block text-sm text-ink-soft">
                Subject
              </label>
              <div className="flex items-center gap-2">
                <span id="same-subject-label" className="text-xs text-ink-soft">
                  Same subject for all
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={sameSubject}
                  aria-labelledby="same-subject-label"
                  onClick={toggleSameSubject}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    sameSubject ? "bg-accent" : "bg-ink-soft/40"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      sameSubject ? "translate-x-[18px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
            <input
              id="subject"
              type="text"
              required={sameSubject}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-line px-3 py-2 text-sm text-ink bg-paper focus:bg-white"
            />

            {!sameSubject &&
              (rowRecipients.length === 0 ? (
                <p className="text-xs text-ink-soft mt-2">
                  Add recipients above to set a separate subject for each one.
                </p>
              ) : (
                <div
                  role="group"
                  aria-label="Subject for each recipient"
                  className="mt-2 border border-line divide-y divide-line overflow-y-auto"
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
                        className="flex-1 min-w-0 border border-line px-2 py-1.5 text-sm text-ink bg-paper focus:bg-white"
                      />
                    </div>
                  ))}
                </div>
              ))}
          </div>

          <div>
            <label htmlFor="body" className="block text-sm text-ink-soft mb-1.5">
              Message
            </label>
            <textarea
              id="body"
              required
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full border border-line px-3 py-2 text-sm text-ink bg-paper focus:bg-white resize-y"
            />
          </div>

          {result && (
            <div className="text-sm space-y-1">
              {result.error && <p className="text-red-700">{result.error}</p>}
              {typeof result.sentCount === "number" && (
                <>
                  <p className={result.failedCount ? "text-amber" : "text-accent-deep"}>
                    Sent {result.sentCount} of {(result.sentCount ?? 0) + (result.failedCount ?? 0)}{" "}
                    from {result.from}.
                  </p>
                  {result.results
                    ?.filter((r) => !r.ok)
                    .map((r) => (
                      <p key={r.to} className="text-red-700 text-xs">
                        Failed: {r.to}
                      </p>
                    ))}
                </>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="bg-accent text-white text-sm px-5 py-2.5 hover:bg-accent-deep transition-colors disabled:opacity-60"
          >
            {sending
              ? "Sending…"
              : recipientCount > 1
              ? `Send ${recipientCount} separate emails`
              : "Send"}
          </button>
        </form>
      )}
    </section>
  );
}
