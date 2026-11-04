"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Pages that need a signed-in user. A tab can stay open after the session has ended (the computer slept,
// the cookie expired ...). Then the page still looks signed in, but every action says "Not signed in.".
// This sends the person to the sign-in page instead: as soon as a request says the session is gone,
// and also when they come back to the tab.
const SIGNED_IN_AREAS = ["/compose", "/automation", "/inbox", "/sent", "/settings", "/admin", "/email-test"];
const isSignedInArea = (path: string) => SIGNED_IN_AREAS.some((area) => path === area || path.startsWith(`${area}/`));

export default function SessionGuard() {
  const pathname = usePathname();
  const leaving = useRef(false);

  useEffect(() => {
    if (!isSignedInArea(pathname)) return;

    const goToLogin = () => {
      if (leaving.current) return;
      leaving.current = true;
      const next = window.location.pathname + window.location.search;
      window.location.assign(`/login?expired=1&next=${encodeURIComponent(next)}`);
    };

    // 1) any of our own API calls answering 401 means the session ended
    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        try {
          const input = args[0];
          const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          const url = new URL(raw, window.location.href);
          if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) goToLogin();
        } catch {
          // not a URL we can read: leave it alone
        }
      }
      return response;
    };

    // 2) coming back to the tab: ask the server whether the session is still alive
    let lastCheck = 0;
    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck < 5000) return;
      lastCheck = Date.now();
      try {
        const res = await originalFetch("/api/auth/check", { cache: "no-store" });
        if (res.ok && (await res.json()).signedIn === false) goToLogin();
      } catch {
        // offline or server restarting: do nothing
      }
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);

    return () => {
      window.fetch = originalFetch;
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [pathname]);

  return null;
}
