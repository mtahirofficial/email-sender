import type { ElementSummary, RawTrackingEvent } from "@/lib/email-test/store";

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

export default function EmailTestResults({
  summary,
  events,
}: {
  summary: ElementSummary[];
  events: RawTrackingEvent[];
}) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-serif text-base text-ink mb-2">Requests by element</h3>
        <div className="border border-line bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-soft">
                <th className="px-3 py-2 font-medium">Element</th>
                <th className="px-3 py-2 font-medium">Requests</th>
                <th className="px-3 py-2 font-medium">First request</th>
                <th className="px-3 py-2 font-medium">Last request</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.slug} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-ink">
                    {row.label}
                    {row.isControl && (
                      <span className="text-ink-soft text-xs"> — expect 0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink">{row.requestCount}</td>
                  <td className="px-3 py-2 text-ink-soft">{formatTime(row.firstRequestAt)}</td>
                  <td className="px-3 py-2 text-ink-soft">{formatTime(row.lastRequestAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-soft mt-2">
          "Requests" counts resource requests received by the tracking
          endpoint — a tracking signal, not a confirmed human "open". Some
          mail providers pre-fetch or proxy images, which can register a
          request the person never consciously saw.
        </p>
      </div>

      <div>
        <h3 className="font-serif text-base text-ink mb-2">Raw tracking signals</h3>
        {events.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No requests recorded yet. Send the test, open it in a mail client, then refresh.
          </p>
        ) : (
          <div className="border border-line bg-white divide-y divide-line">
            {events.map((event) => (
              <div key={event.id} className="px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink font-medium">{event.element_type}</span>
                  <span
                    className={`text-[11px] px-1.5 py-0.5 border ${
                      event.signal === "first"
                        ? "border-accent text-accent-deep"
                        : "border-amber text-amber"
                    }`}
                  >
                    {event.signal === "first" ? "First Request" : "Repeat Request"}
                  </span>
                  <span className="text-ink-soft text-xs">{formatTime(event.occurred_at)}</span>
                </div>
                <p className="text-xs text-ink-soft mt-1 break-all">
                  {event.method} · {event.user_agent ?? "no user-agent"} · {event.ip ?? "no ip captured"}
                </p>
                {event.headers && Object.keys(event.headers).length > 0 && (
                  <details className="mt-1">
                    <summary className="text-xs text-ink-soft cursor-pointer">Headers</summary>
                    <pre className="text-[11px] text-ink-soft mt-1 whitespace-pre-wrap break-all">
                      {JSON.stringify(event.headers, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
