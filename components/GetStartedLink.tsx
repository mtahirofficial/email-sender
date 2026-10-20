"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasSessionCookieString } from "@/lib/supabase/session-cookie";

/** "Get started" for visitors, "Open Compose" for people who are already signed in. */
export default function GetStartedLink({ className, children = "Get started" }: { className?: string; children?: string }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(hasSessionCookieString(document.cookie)), []);

  return (
    <Link href={signedIn ? "/compose" : "/login"} className={className}>
      {signedIn ? "Open Compose" : children}
    </Link>
  );
}
