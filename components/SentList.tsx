import type { EmailLog } from "@/lib/email-logs";
import LocalTime from "@/components/LocalTime";
import { CheckIcon, InboxIcon, XIcon } from "@/components/icons";

export default function SentList({ logs }: { logs: EmailLog[] }) {
  const failed = logs.filter((l) => l.status === "failed").length;
  const sent = logs.length - failed;

  return (
    <section aria-labelledby="sent-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="sent-heading" className="font-serif text-3xl text-ink">
            Sent
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Your latest {logs.length > 0 ? logs.length : ""} send attempts from this app, most recent first.
          </p>
        </div>
        {logs.length > 0 && (
          <div className="flex gap-2">
            <span className="pill border-accent/20 bg-accent-soft text-accent-deep">{sent} sent</span>
            {failed > 0 && <span className="pill border-red-200 bg-red-50 text-red-700">{failed} failed</span>}
          </div>
        )}
      </div>

      {logs.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-mist text-ink-soft">
            <InboxIcon className="h-6 w-6" />
          </span>
          <p className="mt-4 font-serif text-xl text-ink">Nothing sent yet</p>
          <p className="mt-1 text-sm text-ink-soft">Messages you send will show up here.</p>
        </div>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {logs.map((log) => {
            const ok = log.status === "sent";
            return (
              <li key={log.id} className="flex items-start gap-3 px-4 py-4 sm:px-5">
                <span
                  className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                    ok ? "bg-accent-soft text-accent-deep" : "bg-red-50 text-red-700"
                  }`}
                >
                  {ok ? <CheckIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
                  <span className="sr-only">{ok ? "Sent" : "Failed"}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{log.subject}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-soft">
                    {log.from_email} &rarr; {log.to_email}
                  </p>
                  {!ok && log.error && <p className="mt-1 break-words text-xs text-red-700">{log.error}</p>}
                </div>
                <p className="shrink-0 text-right text-xs text-ink-soft">
                  <LocalTime iso={log.sent_at} />
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
