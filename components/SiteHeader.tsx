"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { hasSessionCookieString } from "@/lib/supabase/session-cookie";
import type { HeaderUser } from "@/lib/header-user";
import ThemeToggle from "@/components/ThemeToggle";
import {
  FlaskIcon,
  InboxIcon,
  LogOutIcon,
  Logo,
  MailIcon,
  PenIcon,
  SendIcon,
  SheetIcon,
  SparkleIcon,
  SettingsIcon,
  UserIcon,
  DashboardIcon,
  MenuIcon,
  ClockIcon,
  UsersIcon,
  BookOpenIcon,
} from "@/components/icons";


const PUBLIC_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#security", label: "Security" },
  { href: "/#faq", label: "FAQ" },
  { href: "/blog", label: "Blog" },
];

const MEMBER_LINKS = [
  { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { href: "/compose", label: "Compose email", Icon: SendIcon },
  { href: "/automation", label: "Automation", Icon: SheetIcon },
  { href: "/inbox", label: "Inbox", Icon: InboxIcon },
  { href: "/sent", label: "Sent history", Icon: ClockIcon },
  { href: "/settings#accounts", label: "Connected accounts", Icon: UsersIcon },
  { href: "/blog", label: "Blog", Icon: BookOpenIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

const ADMIN_LINKS = [
  { href: "/admin/blog", label: "Blog manager", Icon: PenIcon },
  { href: "/admin/messages", label: "Messages", Icon: MailIcon },
  { href: "/admin/presets", label: "AI presets", Icon: SparkleIcon },
  { href: "/admin/scheduler", label: "Scheduler", Icon: SheetIcon },
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
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 transition-colors hover:bg-mist"
      >
        <Avatar user={user} />
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

          <Link href="/profile" role="menuitem" onClick={() => setOpen(false)} className="menu-item">
            <UserIcon className="h-4 w-4 text-ink-soft" /> Profile
          </Link>
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

/** Shared persistent shell for the public site and signed-in workspace routes. */
export default function SiteHeader({ initialUser }: { initialUser?: HeaderUser | null }) {
  const pathname = usePathname();
  const [fetched, setFetched] = useState<HeaderUser | null | undefined>(undefined);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hash, setHash] = useState("");

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("outbox:sidebar-collapsed") === "1");
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  function toggleSidebar() {
    setCollapsed((value) => {
      try { window.localStorage.setItem("outbox:sidebar-collapsed", value ? "0" : "1"); } catch { /* appearance preference is optional */ }
      return !value;
    });
  }

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

  const isWorkspacePath = MEMBER_LINKS.some((item) => item.href.split("#")[0] !== "/blog" && pathname === item.href.split("#")[0])
    || pathname === "/profile"
    || pathname.startsWith("/admin")
    || pathname === "/email-test"
    || pathname === "/verify";

  if (user || isWorkspacePath) {
    const pageTitle = MEMBER_LINKS.find((item) => item.href.split("#")[0] === pathname && (!item.href.includes("#") || hash === item.href.slice(item.href.indexOf("#"))))?.label
      ?? MEMBER_LINKS.find((item) => item.href === pathname)?.label
      ?? (pathname.startsWith("/admin") ? "Admin workspace" : "Outbox");
    const linkClass = (href: string) => {
      const [path, anchor] = href.split("#");
      const active = (pathname === path || (path === "/blog" && pathname.startsWith("/blog/"))) && (!anchor || hash === `#${anchor}` || (pathname === "/settings" && hash === "" && anchor === "accounts"));
      return `group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors ${active ? "bg-accent-soft font-semibold text-accent-deep" : "text-ink-soft hover:bg-mist hover:text-ink"}`;
    };

    return (
      <>
        {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-ink/30 md:hidden" onClick={() => setMobileOpen(false)} />}
        <aside className={`app-sidebar fixed inset-y-0 left-0 z-50 flex flex-col overflow-x-hidden overflow-y-auto overscroll-contain border-r border-line bg-white px-3 py-5 transition-[width,transform] duration-200 ${collapsed ? "app-sidebar-collapsed" : ""} ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
          <Link href="/" className={`mb-4 flex h-10 shrink-0 items-center gap-3 px-2 ${collapsed ? "mb-8 justify-center" : ""}`} aria-label="Outbox home">
            <Logo className={`shrink-0 ${collapsed ? "h-6 w-8" : "h-9 w-20"}`} />
            {!collapsed && <span className="font-brand text-2xl font-semibold tracking-wide text-ink">Outbox</span>}
          </Link>
          {!collapsed && <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[.14em] text-ink-soft/70">Workspace</p>}
          <nav aria-label="Workspace" className="flex-none space-y-1">
            {MEMBER_LINKS.map(({ href, label, Icon }) => (
              <Link key={href} href={href} aria-current={linkClass(href).includes("bg-accent-soft") ? "page" : undefined} title={collapsed ? label : undefined} onClick={() => setMobileOpen(false)} className={`${linkClass(href)} ${collapsed ? "justify-center px-0" : ""}`}>
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            ))}
          </nav>
          <div className="mt-auto border-t border-line pt-4">
            <ThemeToggle collapsed={collapsed} />
            {user ? (
              <Link href="/profile" title={collapsed ? "Profile" : undefined} className={`${linkClass("/profile")} ${collapsed ? "justify-center px-0" : ""}`}>
                <UserIcon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="min-w-0 truncate">{user.name ?? user.email}</span>}
              </Link>
            ) : (
              <div aria-hidden="true" className={`flex min-h-11 items-center gap-3 px-3 ${collapsed ? "justify-center px-0" : ""}`}>
                <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-line" />
                {!collapsed && <span className="h-3 w-28 animate-pulse rounded bg-line" />}
              </div>
            )}
          </div>
        </aside>

        <header className={`app-topbar fixed right-0 top-0 z-30 flex h-[68px] items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur transition-[left] duration-200 sm:px-6 ${collapsed ? "left-0 md:left-[76px]" : "left-0 md:left-[252px]"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => { if (window.innerWidth < 768) setMobileOpen(true); else toggleSidebar(); }} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-soft hover:bg-mist" aria-label={collapsed ? "Expand sidebar or open navigation" : "Collapse sidebar or open navigation"}>
              <MenuIcon className="h-5 w-5" />
            </button>
            <span className="max-w-[calc(50vw-5rem)] truncate text-sm font-semibold text-ink md:max-w-none">{pageTitle}</span>
          </div>
          {!mobileOpen && <Link href="/dashboard" aria-label="Outbox home" className="absolute left-1/2 -translate-x-1/2 md:hidden">
            <Logo className="h-7 w-10 shrink-0" />
          </Link>}
          <div className="flex items-center gap-2">
            {user && <div className="hidden sm:block"><AccountMenu user={user} onSignedOut={() => setFetched(null)} /></div>}
            {user && <div className="sm:hidden"><AccountMenu user={user} onSignedOut={() => setFetched(null)} /></div>}
          </div>
        </header>
      </>
    );
  }

  const isActive = (href: string) =>
    href === "/blog" ? pathname.startsWith("/blog") : href.startsWith("/#") ? false : pathname === href;

  const linkClass = (active: boolean) =>
    `inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-3.5 text-sm transition-colors ${active ? "bg-accent-soft font-medium text-accent-deep" : "text-ink-soft hover:bg-mist hover:text-ink"
    }`;

  const links = (
    <>
      {PUBLIC_LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined} className={linkClass(isActive(l.href))}>
          {l.label}
        </Link>
      ))}
    </>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="w-full px-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Outbox home">
              <Logo className="h-8 w-16" />
              <span className="font-brand text-2xl font-semibold tracking-wide text-ink">Outbox</span>
            </Link>
            <nav aria-label="Main" className="hidden items-center gap-0.5 md:flex">
              {links}
            </nav>
          </div>

          <div className="flex min-h-[44px] items-center gap-2">
            {user === undefined ? (
              <span aria-hidden="true" className="block h-8 w-24" />
            ) : user ? (
              <>
                {MEMBER_LINKS.map(({ href, label, Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    aria-label={label}
                    title={label}
                    aria-current={isActive(href) ? "page" : undefined}
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors ${isActive(href) ? "bg-accent-soft text-accent-deep" : "text-ink-soft hover:bg-mist hover:text-ink"
                      }`}
                  >
                    <Icon className="h-5 w-5" />
                  </Link>
                ))}
                <AccountMenu user={user} onSignedOut={() => setFetched(null)} />
              </>
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
