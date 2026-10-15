import type { ElementSummary, RawTrackingEvent } from "@/lib/email-test/store";
import LocalTime from "@/components/LocalTime";

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
        <h3 className="mb-3 font-serif text-lg text-ink">Requests by element</h3>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line bg-mist/60 text-left text-ink-soft">
                <th scope="col" className="px-4 py-2.5 font-medium">Element</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Requests</th>
                <th scope="col" className="px-4 py-2.5 font-medium">First request</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Last request</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.slug} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal text-ink">
                    {row.label}
                    {row.isControl && <span className="text-xs text-ink-soft"> (expect 0)</span>}
                  </th>
                  <td className="px-4 py-2.5">
                    <span
                      className={`pill ${
                        row.requestCount > 0
                          ? "border-accent/20 bg-accent-soft text-accent-deep"
                          : "border-line bg-paper text-ink-soft"
                      }`}
                    >
                      {row.requestCount}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">
                    {row.firstRequestAt ? <LocalTime iso={row.firstRequestAt} seconds /> : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">
                    {row.lastRequestAt ? <LocalTime iso={row.lastRequestAt} seconds /> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          &ldquo;Requests&rdquo; counts resource requests received by the tracking endpoint: a tracking signal,
          not a confirmed human &ldquo;open&rdquo;. Some mail providers pre-fetch or proxy images, which can
          register a request the person never consciously saw.
        </p>
      </div>

      <div>
        <h3 className="mb-3 font-serif text-lg text-ink">Raw tracking signals</h3>
        {events.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-ink-soft">
            No requests recorded yet. Send the test, open it in a mail client, then refresh.
          </p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {events.map((event) => (
              <li key={event.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{event.element_type}</span>
                  <span
                    className={`pill ${
                      event.signal === "first"
                        ? "border-accent/20 bg-accent-soft text-accent-deep"
                        : "border-amber/30 bg-amber-soft text-amber"
                    }`}
                  >
                    {event.signal === "first" ? "First Request" : "Repeat Request"}
                  </span>
                  <span className="text-xs text-ink-soft">
                    <LocalTime iso={event.occurred_at} seconds />
                  </span>
                </div>
                <p className="mt-1 break-all text-xs text-ink-soft">
                  {event.method} · {event.user_agent ?? "no user-agent"} · {event.ip ?? "no ip captured"}
                </p>
                {event.headers && Object.keys(event.headers).length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-ink-soft">Headers</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-all text-xs text-ink-soft">
                      {JSON.stringify(event.headers, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
