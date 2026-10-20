import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import { FlaskIcon, InboxIcon, Logo, PenIcon, SendIcon } from "@/components/icons";

type ActiveTab = "compose" | "sent" | "email-test" | "blog-admin";

const NAV = [
  { id: "compose", href: "/", label: "Compose", Icon: SendIcon },
  { id: "sent", href: "/sent", label: "Sent", Icon: InboxIcon },
  { id: "email-test", href: "/email-test", label: "Tracking test", Icon: FlaskIcon },
  { id: "blog-admin", href: "/admin/blog", label: "Blog manager", Icon: PenIcon },
] as const;

function NavLinks({ active, isAdmin }: { active?: ActiveTab; isAdmin: boolean }) {
  return (
    <>
      {NAV.filter((item) => (item.id !== "email-test" && item.id !== "blog-admin") || isAdmin).map(({ id, href, label, Icon }) => {
        const isActive = id === active;
        return (
          <Link
            key={id}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-3.5 text-sm transition-colors ${
              isActive
                ? "bg-accent-soft font-medium text-accent-deep"
                : "text-ink-soft hover:bg-mist hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </>
  );
}

export default function AppHeader({
  userEmail,
  active,
  isAdmin = false,
}: {
  userEmail: string;
  active?: ActiveTab;
  isAdmin?: boolean;
}) {
  const initial = (userEmail[0] ?? "?").toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Outbox dashboard">
              <Logo className="h-8 w-8" />
              <span className="font-serif text-xl text-ink">Outbox</span>
            </Link>
            <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
              <NavLinks active={active} isAdmin={isAdmin} />
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden max-w-[220px] truncate text-xs text-ink-soft md:inline" title={userEmail}>
              {userEmail}
            </span>
            <span
              aria-hidden="true"
              className="grid h-8 w-8 place-items-center rounded-full bg-accent text-sm font-medium text-white"
            >
              {initial}
            </span>
            <SignOutButton />
          </div>
        </div>

        <nav aria-label="Main (mobile)" className="flex items-center gap-1 overflow-x-auto pb-2 sm:hidden">
          <NavLinks active={active} isAdmin={isAdmin} />
        </nav>
      </div>
    </header>
  );
}
