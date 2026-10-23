"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons";

export type PresetRow = { id: string; label: string; prompt: string; sort_order: number; active: boolean };

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

function Editor({ preset }: { preset?: PresetRow }) {
  const router = useRouter();
  const [label, setLabel] = useState(preset?.label ?? "");
  const [prompt, setPrompt] = useState(preset?.prompt ?? "");
  const [active, setActive] = useState(preset?.active ?? true);
  const [order, setOrder] = useState(preset?.sort_order ?? 0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const idp = preset?.id ?? "new";

  async function run(action: () => Promise<unknown>, success: string, reset = false) {
    setBusy(true);
    setNote(null);
    try {
      await action();
      setNote({ ok: true, text: success });
      if (reset) {
        setLabel("");
        setPrompt("");
      }
      router.refresh();
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "Failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
        <div>
          <label htmlFor={`label-${idp}`} className="label">Button name</label>
          <input id={`label-${idp}`} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} className="input" placeholder="e.g. Guest post inquiry" />
        </div>
        {preset && (
          <div>
            <label htmlFor={`order-${idp}`} className="label">Order</label>
            <input id={`order-${idp}`} type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} className="input" />
          </div>
        )}
      </div>

      <div>
        <label htmlFor={`prompt-${idp}`} className="label">
          Prompt <span className="font-normal text-ink-soft">({prompt.length}/1500)</span>
        </label>
        <textarea id={`prompt-${idp}`} rows={5} maxLength={1500} value={prompt} onChange={(e) => setPrompt(e.target.value)} className="input resize-y" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {preset ? (
          <>
            <button type="button" disabled={busy} className="btn-primary" onClick={() => run(() => call({ action: "update", id: preset.id, label, prompt, active, sort_order: order }), "Saved.")}>
              {busy && <SpinnerIcon />} Save
            </button>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[#2E5D50]" />
              Show to users
            </label>
            <button
              type="button"
              disabled={busy}
              className="btn-ghost ml-auto text-red-700 hover:text-red-800"
              onClick={() => window.confirm(`Delete "${preset.label}"?`) && run(() => call({ action: "delete", id: preset.id }), "Deleted.")}
            >
              Delete
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} className="btn-primary" onClick={() => run(() => call({ action: "create", label, prompt }), "Preset added.", true)}>
            {busy && <SpinnerIcon />} Add preset
          </button>
        )}
      </div>

      <div aria-live="polite" className="min-h-[1.25rem] text-sm">
        {note && (
          <p className={`flex items-center gap-2 ${note.ok ? "text-accent-deep" : "text-red-700"}`}>
            {note.ok ? <CheckIcon className="h-4 w-4" /> : <AlertIcon className="h-4 w-4" />} {note.text}
          </p>
        )}
      </div>
    </div>
  );
}

export default function PresetsManager({ presets }: { presets: PresetRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function restore() {
    setBusy(true);
    setMessage(null);
    try {
      const data = await call({ action: "restore" });
      setMessage(`Added ${data.added} built-in preset(s). Ones you edited were left alone.`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={restore} disabled={busy} className="btn-secondary">
          {busy && <SpinnerIcon />} {presets.length === 0 ? "Install the built-in presets" : "Restore missing built-in presets"}
        </button>
        <span aria-live="polite" className="text-sm text-ink-soft">{message}</span>
      </div>

      {presets.length === 0 && (
        <p className="rounded-xl border border-dashed border-line bg-paper px-4 py-3 text-sm text-ink-soft">
          Users currently see the built-in presets. Install them here to be able to edit them.
        </p>
      )}

      {presets.map((p) => (
        <Editor key={`${p.id}-${p.label}-${p.sort_order}-${p.active}`} preset={p} />
      ))}

      <section aria-labelledby="new-preset">
        <h2 id="new-preset" className="mb-3 font-serif text-xl text-ink">Add a new preset</h2>
        <Editor />
      </section>
    </div>
  );
}
