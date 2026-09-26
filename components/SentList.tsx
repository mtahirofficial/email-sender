import type { EmailLog } from "@/lib/email-logs";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function SentList({ logs }: { logs: EmailLog[] }) {
  return (
    <section aria-labelledby="sent-heading">
      <h2 id="sent-heading" className="font-serif text-lg text-ink mb-1">
        Sent
      </h2>
      <p className="text-sm text-ink-soft mb-4">
        Your last {logs.length > 0 ? logs.length : ""} send attempts from this
        app, most recent first.
      </p>

      <div className="border border-line bg-white divide-y divide-line">
        {logs.length === 0 && (
          <p className="px-4 py-4 text-sm text-ink-soft">
            Nothing sent yet — messages you send will show up here.
          </p>
        )}
        {logs.map((log) => (
          <div key={log.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-ink truncate">{log.subject}</p>
                <p className="text-xs text-ink-soft mt-0.5 truncate">
                  {log.from_email} → {log.to_email}
                </p>
                {log.status === "failed" && log.error && (
                  <p className="text-xs text-red-700 mt-1">{log.error}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={`text-[11px] px-1.5 py-0.5 border ${
                    log.status === "sent"
                      ? "border-accent text-accent-deep"
                      : "border-red-300 text-red-700"
                  }`}
                >
                  {log.status === "sent" ? "Sent" : "Failed"}
                </span>
                <p className="text-xs text-ink-soft mt-1">{formatTime(log.sent_at)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
