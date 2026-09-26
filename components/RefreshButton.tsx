"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RefreshButton() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  function handleClick() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 400);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-sm text-ink-soft underline underline-offset-2 hover:text-ink"
    >
      {refreshing ? "Refreshing…" : "Refresh results"}
    </button>
  );
}
