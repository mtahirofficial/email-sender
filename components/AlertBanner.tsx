"use client";

import { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { AlertIcon, CheckIcon, XIcon } from "@/components/icons";

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
    : connected === "sheets"
    ? "Google Sheets access enabled. You can import your sheet below."
    : connected === "google"
    ? "Gmail account connected. It's ready to send from below."
    : "Outlook account connected. It's ready to send from below.";

  function dismiss() {
    setDismissed(true);
    router.replace(pathname);
  }

  return (
    <div
      role={error ? "alert" : "status"}
      className={`mb-8 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
        error
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-accent/20 bg-accent-soft text-accent-deep"
      }`}
    >
      {error ? <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" /> : <CheckIcon className="mt-0.5 h-5 w-5 shrink-0" />}
      <p className="flex-1 leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss message"
        className="-mr-2 -mt-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-black/5"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
