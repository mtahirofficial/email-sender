"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshIcon } from "@/components/icons";

export default function RefreshButton() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  function handleClick() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  }

  return (
    <button type="button" onClick={handleClick} className="btn-secondary" aria-live="polite">
      <RefreshIcon className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
      {refreshing ? "Refreshing…" : "Refresh results"}
    </button>
  );
}
