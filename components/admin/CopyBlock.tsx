"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/icons";

export default function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the text can still be selected by hand
    }
  }

  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-ink p-4 pr-24 text-xs leading-relaxed text-white">{text}</pre>
      <button type="button" onClick={copy} className="absolute right-3 top-3 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-white/15 px-3 text-xs text-white hover:bg-white/25">
        {copied ? <><CheckIcon className="h-4 w-4" /> Copied</> : "Copy"}
      </button>
    </div>
  );
}
