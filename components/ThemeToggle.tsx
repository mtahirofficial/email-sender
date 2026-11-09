"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@/components/icons";
import { hasSessionCookieString } from "@/lib/supabase/session-cookie";

export default function ThemeToggle({
  collapsed = true,
  className,
  signedInOnly = false,
}: {
  /** Hide the text label when placing the compact control in a public header. */
  collapsed?: boolean;
  className?: string;
  signedInOnly?: boolean;
}) {
  const [dark, setDark] = useState(false);
  const [signedIn, setSignedIn] = useState(!signedInOnly);

  useEffect(() => {
    const syncTheme = () => {
      let storedDark = false;
      try {
        storedDark = window.localStorage.getItem("outbox:theme") === "dark";
      } catch {
        // Read the active document theme when storage is unavailable.
      }
      setDark(storedDark || document.documentElement.dataset.theme === "dark");
    };
    syncTheme();
    window.addEventListener("storage", syncTheme);
    window.addEventListener("outbox:theme-change", syncTheme);
    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("outbox:theme-change", syncTheme);
    };
  }, []);

  useEffect(() => {
    if (!signedInOnly || !hasSessionCookieString(document.cookie)) return;
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setSignedIn(Boolean(data.user)); })
      .catch(() => { if (!cancelled) setSignedIn(false); });
    return () => { cancelled = true; };
  }, [signedInOnly]);

  function toggle() {
    const next = !dark;
    document.documentElement.dataset.theme = next ? "dark" : "light";
    setDark(next);
    try {
      window.localStorage.setItem("outbox:theme", next ? "dark" : "light");
    } catch {
      // The current page still changes theme if storage is unavailable.
    }
    window.dispatchEvent(new Event("outbox:theme-change"));
  }

  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  if (signedInOnly && !signedIn) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={dark}
      title={label}
      className={className ?? `group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-ink-soft transition-colors hover:bg-mist hover:text-ink ${collapsed ? "justify-center px-0" : ""}`}
    >
      {dark ? <SunIcon className="h-[18px] w-[18px] shrink-0" /> : <MoonIcon className="h-[18px] w-[18px] shrink-0" />}
      {!collapsed && <span>{dark ? "Light theme" : "Dark theme"}</span>}
    </button>
  );
}
