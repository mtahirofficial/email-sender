"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Sign in / Get started buttons that become "Dashboard" for signed-in
 * visitors. It only looks for the session cookie in the browser (no network),
 * so the pages around it can stay fully static.
 */
export default function HeaderActions() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(/(?:^|;\s*)sb-[^=]+-auth-token(?:\.\d+)?=/.test(document.cookie));
  }, []);

  if (signedIn) {
    return (
      <Link href="/" className="btn-primary">
        Dashboard
      </Link>
    );
  }

  return (
    <>
      <Link href="/login" className="btn-secondary">
        Sign in
      </Link>
      <Link href="/login" className="btn-primary hidden sm:inline-flex">
        Get started
      </Link>
    </>
  );
}
