"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isTransientAuthError } from "@/lib/supabase/auth-errors";

const SIGNED_IN_AREAS = ["/compose", "/automation", "/dashboard", "/inbox", "/sent", "/settings", "/profile", "/verify", "/admin", "/email-test"];
const isSignedInArea = (path: string) => SIGNED_IN_AREAS.some((area) => path === area || path.startsWith(`${area}/`));

type RefreshResult = "refreshed" | "invalid" | "temporary";
let refreshInFlight: Promise<RefreshResult> | null = null;

function refreshAppSession(): Promise<RefreshResult> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { data, error } = await createClient().auth.refreshSession();
      if (data.session) return "refreshed";
      if (isTransientAuthError(error)) return "temporary";
      return "invalid";
    } catch {
      return "temporary";
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function isAppApiRequest(input: RequestInfo | URL) {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

export default function SessionGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const leaving = useRef(false);

  useEffect(() => {
    if (!isSignedInArea(pathname)) {
      leaving.current = false;
      return;
    }

    let active = true;
    const goToLogin = () => {
      if (!active || leaving.current) return;
      leaving.current = true;
      const next = window.location.pathname + window.location.search;
      window.location.assign(`/login?expired=1&next=${encodeURIComponent(next)}`);
    };

    // Give the refresh token a chance to restore the session before treating an API 401 as sign-out.
    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const retryInput = args[0] instanceof Request ? args[0].clone() : args[0];
      const response = await originalFetch(...args);
      if (response.status !== 401 || !isAppApiRequest(args[0])) return response;

      const refresh = await refreshAppSession();
      if (!active) return response;
      if (refresh === "refreshed") {
        const retry = await originalFetch(retryInput, args[1]);
        if (retry.status !== 401) return retry;
        // Some API 401s are unrelated to the app session; a successful refresh must never force logout.
        return retry;
      }
      if (refresh === "invalid") goToLogin();
      return response;
    };

    // Middleware refreshes the cookie on focus when possible. If it cannot, use the browser refresh token.
    let lastCheck = 0;
    const check = async () => {
      if (!active || document.visibilityState !== "visible" || Date.now() - lastCheck < 5000) return;
      lastCheck = Date.now();
      try {
        const res = await originalFetch("/api/auth/check", { cache: "no-store" });
        if (!active || !res.ok || (await res.json()).signedIn !== false) return;
        const refresh = await refreshAppSession();
        if (!active) return;
        if (refresh === "invalid") goToLogin();
        else if (refresh === "refreshed") router.refresh();
      } catch {
        // Offline or a temporary auth service hiccup should leave the current page open.
      }
    };

    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);

    return () => {
      active = false;
      window.fetch = originalFetch;
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [pathname, router]);

  return null;
}
