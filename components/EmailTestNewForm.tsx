"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EmailTestNewForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    const res = await fetch("/api/email-test/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label || null }),
    });
    const data = await res.json();
    setCreating(false);

    if (!res.ok) {
      setError(data.error ?? "Could not create the test.");
      return;
    }

    setLabel("");
    router.push(`/email-test?test=${data.testId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-line bg-white p-4 flex flex-col gap-3">
      <div>
        <label htmlFor="label" className="block text-sm text-ink-soft mb-1.5">
          Label (optional)
        </label>
        <input
          id="label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Gmail web attempt"
          className="w-full border border-line px-3 py-2 text-sm text-ink bg-paper focus:bg-white"
        />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={creating}
        className="self-start bg-accent text-white text-sm px-4 py-2 hover:bg-accent-deep transition-colors disabled:opacity-60"
      >
        {creating ? "Creating…" : "New test"}
      </button>
    </form>
  );
}
