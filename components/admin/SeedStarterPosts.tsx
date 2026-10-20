"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SpinnerIcon } from "@/components/icons";

export default function SeedStarterPosts() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function install() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/blog/seed", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setMessage(res.ok ? `Added ${data.added}, refreshed ${data.refreshed}, left ${data.skipped} edited article(s) untouched.` : data.error ?? "Failed.");
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={install} disabled={busy} className="btn-secondary">
        {busy && <SpinnerIcon />} Install starter articles
      </button>
      <span aria-live="polite" className="text-sm text-ink-soft">{message}</span>
    </div>
  );
}
