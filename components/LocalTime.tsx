"use client";

import { useEffect, useState } from "react";

/**
 * Renders a timestamp in the *viewer's* timezone. Server-rendered dates would
 * otherwise show the server's timezone (UTC on Vercel).
 */
export default function LocalTime({
  iso,
  seconds = false,
  dateOnly = false,
}: {
  iso: string;
  seconds?: boolean;
  dateOnly?: boolean;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    const date = new Date(iso);
    setText(
      dateOnly
        ? date.toLocaleDateString(undefined, { dateStyle: "medium" })
        : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: seconds ? "medium" : "short" })
    );
  }, [iso, seconds, dateOnly]);

  return <time dateTime={iso}>{text || "\u00A0"}</time>;
}
