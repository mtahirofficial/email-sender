"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, SpinnerIcon } from "@/components/icons";

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
    <form onSubmit={handleSubmit} className="card flex flex-col gap-3 p-4">
      <div>
        <label htmlFor="label" className="label">
          Label <span className="font-normal text-ink-soft">(optional)</span>
        </label>
        <input
          id="label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Gmail web attempt"
          className="input"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={creating} className="btn-primary">
        {creating ? <SpinnerIcon /> : <PlusIcon className="h-4 w-4" />}
        {creating ? "Creating…" : "New test"}
      </button>
    </form>
  );
}
