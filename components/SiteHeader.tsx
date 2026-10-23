"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { hasSessionCookieString } from "@/lib/supabase/session-cookie";
import type { HeaderUser } from "@/lib/header-user";
import {
  ChevronDownIcon,
  FlaskIcon,
  InboxIcon,
  LogOutIcon,
  Logo,
  MailIcon,
  PenIcon,
  SendIcon,
  SheetIcon,
  SettingsIcon,
} from "@/components/icons";

const PUBLIC_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#security", label: "Security" },
  { href: "/#faq", label: "FAQ" },
  { href: "/blog", label: "Blog" },
];

const MEMBER_LINKS = [
  { href: "/compose", label: "Compose", Icon: SendIcon },
  { href: "/sent", label: "Sent", Icon: InboxIcon },
  { href: "/automation", label: "Automation", Icon: SheetIcon },
];

const ADMIN_LINKS = [
  { href: "/admin/blog", label: "Blog manager", Icon: PenIcon },
  { href: "/admin/messages", label: "Messages", Icon: MailIcon },
  { href: "/email-test", label: "Tracking test", Icon: FlaskIcon },
];

function Avatar({ user, size = "h-8 w-8" }: { user: HeaderUser; size?: string }) {
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt="" width={32} height={32} className={`${size} shrink-0 rounded-full object-cover`} />;
  }
  const initial = (user.name ?? user.email)[0]?.toUpperCase() ?? "?";
  return (
    <span aria-hidden="true" className={`${size} grid shrink-0 place-items-center rounded-full bg-accent text-sm font-medium text-white`}>
      {initial}
    </span>
  );
}

function AccountMenu({ user, onSignedOut }: { user: HeaderUser; onSignedOut: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setOpen(false);
    // Loaded on demand so the Supabase client stays out of every page's first load.
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    onSignedOut();
    router.push("/");
    router.refresh();
  }

  const display = user.name ?? user.email.split("@")[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-mist"
      >
        <Avatar user={user} />
        <span className="hidden max-w-[140px] truncate text-sm text-ink sm:inline">{display}</span>
        <ChevronDownIcon className={`h-4 w-4 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} />
        <span className="sr-only">Account menu</span>
      </button>

      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-line bg-white p-1.5 shadow-lift">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Avatar user={user} size="h-10 w-10" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{display}</p>
              <p className="truncate text-xs text-ink-soft" title={user.email}>{user.email}</p>
            </div>
          </div>
          <hr className="my-1 border-line" />

          <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className="menu-item">
            <SettingsIcon className="h-4 w-4 text-ink-soft" /> Settings
          </Link>

          {user.isAdmin && (
            <>
              <p className="px-3 pb-1 pt-2 text-xs font-medium text-ink-soft">Admin</p>
              {ADMIN_LINKS.map(({ href, label, Icon }) => (
                <Link key={href} href={href} role="menuitem" onClick={() => setOpen(false)} className="menu-item">
                  <Icon className="h-4 w-4 text-ink-soft" /> {label}
                </Link>
              ))}
            </>
          )}

          <hr className="my-1 border-line" />
          <button type="button" role="menuitem" onClick={logout} className="menu-item">
            <LogOutIcon className="h-4 w-4 text-ink-soft" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One header for the whole site. Public links are always shown; Compose and
 * Sent appear once signed in; admin tools live in the account menu and are
 * only rendered for the admin. Pages that already know the user pass
 * `initialUser`; static pages leave it out and the header looks the user up
 * after load, so those pages can stay fully static.
 */
export default function SiteHeader({ initialUser }: { initialUser?: HeaderUser | null }) {
  const pathname = usePathname();
  const [fetched, setFetched] = useState<HeaderUser | null | undefined>(undefined);

  useEffect(() => {
    if (initialUser !== undefined) return;
    if (!hasSessionCookieString(document.cookie)) {
      setFetched(null);
      return;
    }
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => !cancelled && setFetched(data.user ?? null))
      .catch(() => !cancelled && setFetched(null));
    return () => {
      cancelled = true;
    };
  }, [initialUser]);

  const user = initialUser !== undefined ? initialUser : fetched; // undefined = still deciding

  const isActive = (href: string) =>
    href === "/blog" ? pathname.startsWith("/blog") : href.startsWith("/#") ? false : pathname === href;

  const linkClass = (active: boolean) =>
    `inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-3.5 text-sm transition-colors ${
      active ? "bg-accent-soft font-medium text-accent-deep" : "text-ink-soft hover:bg-mist hover:text-ink"
    }`;

  const links = (
    <>
      {PUBLIC_LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined} className={linkClass(isActive(l.href))}>
          {l.label}
        </Link>
      ))}
      {user &&
        MEMBER_LINKS.map(({ href, label, Icon }) => (
          <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className={linkClass(isActive(href))}>
            <Icon className="h-4 w-4" /> {label}
          </Link>
        ))}
    </>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Outbox home">
              <Logo className="h-8 w-8" />
              <span className="font-serif text-xl text-ink">Outbox</span>
            </Link>
            <nav aria-label="Main" className="hidden items-center gap-0.5 md:flex">
              {links}
            </nav>
          </div>

          <div className="flex min-h-[44px] items-center gap-2">
            {user === undefined ? (
              <span aria-hidden="true" className="block h-8 w-24" />
            ) : user ? (
              <AccountMenu user={user} onSignedOut={() => setFetched(null)} />
            ) : (
              <>
                <Link href="/login" className="btn-secondary">Sign in</Link>
                <Link href="/login" className="btn-primary hidden sm:inline-flex">Get started</Link>
              </>
            )}
          </div>
        </div>

        <nav aria-label="Main (mobile)" className="flex items-center gap-0.5 overflow-x-auto pb-2 md:hidden">
          {links}
        </nav>
      </div>
    </header>
  );
}
