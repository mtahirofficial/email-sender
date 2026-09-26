"use client";

import { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export default function AlertBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const error = searchParams.get("error");
  const connected = searchParams.get("connected");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || (!error && !connected)) return null;

  const message = error
    ? error
    : connected === "google"
    ? "Gmail account connected. It's ready to send from below."
    : "Outlook account connected. It's ready to send from below.";

  function dismiss() {
    setDismissed(true);
    router.replace(pathname);
  }

  return (
    <div
      className={`mb-8 flex items-start justify-between gap-4 border px-4 py-3 text-sm ${
        error
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-accent-soft bg-accent-soft text-accent-deep"
      }`}
      role="status"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 text-xs underline underline-offset-2"
      >
        Dismiss
      </button>
    </div>
  );
}
