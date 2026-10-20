"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LocalTime from "@/components/LocalTime";

export type ContactMessage = { id: string; name: string; email: string; subject: string | null; message: string; created_at: string };

export default function MessagesList({ messages }: { messages: ContactMessage[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(id: string) {
    if (!window.confirm("Delete this message?")) return;
    setBusyId(id);
    await fetch(`/api/admin/messages/${id}`, { method: "DELETE" });
    setBusyId(null);
    router.refresh();
  }

  if (messages.length === 0) {
    return <div className="card px-6 py-12 text-center text-sm text-ink-soft">No messages yet.</div>;
  }

  return (
    <ul className="space-y-3">
      {messages.map((m) => (
        <li key={m.id} className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{m.subject || "(no subject)"}</p>
              <p className="text-sm text-ink-soft">
                {m.name} · <a href={`mailto:${m.email}`} className="text-accent-deep underline underline-offset-2">{m.email}</a>
              </p>
            </div>
            <p className="text-xs text-ink-soft"><LocalTime iso={m.created_at} /></p>
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">{m.message}</p>
          <div className="mt-3 flex gap-2">
            <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject || "Your message"}`)}`} className="btn-secondary min-h-[40px]">Reply</a>
            <button type="button" onClick={() => remove(m.id)} disabled={busyId === m.id} className="btn-ghost min-h-[40px] text-red-700 hover:text-red-800">Delete</button>
          </div>
        </li>
      ))}
    </ul>
  );
}
