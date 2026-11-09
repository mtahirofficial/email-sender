"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { hasSessionCookieString } from "@/lib/supabase/session-cookie";
import ThemeToggle from "@/components/ThemeToggle";

export default function FloatingThemeToggle() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!hasSessionCookieString(document.cookie)) {
      setShow(true);
      return;
    }
    setShow(false);

    fetch("/api/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setShow(!data.user); })
      .catch(() => { if (!cancelled) setShow(true); });

    return () => { cancelled = true; };
  }, [pathname]);

  if (!show) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[90]">
      <ThemeToggle className="grid h-12 w-12 place-items-center rounded-full border border-line bg-surface text-ink shadow-lift transition-colors hover:bg-mist" />
    </div>
  );
}
