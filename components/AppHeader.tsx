import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";

export default function AppHeader({
  userEmail,
  active,
}: {
  userEmail: string;
  active: "compose" | "sent" | "email-test";
}) {
  return (
    <header className="border-b border-line">
      <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div>
            <p className="font-serif text-xl text-ink">Outbox</p>
            <p className="text-xs text-ink-soft">{userEmail}</p>
          </div>
          <nav className="flex items-center gap-5 text-sm">
            <Link
              href="/"
              className={
                active === "compose"
                  ? "text-ink font-medium"
                  : "text-ink-soft hover:text-ink"
              }
            >
              Compose
            </Link>
            <Link
              href="/sent"
              className={
                active === "sent"
                  ? "text-ink font-medium"
                  : "text-ink-soft hover:text-ink"
              }
            >
              Sent List
            </Link>
            <Link
              href="/email-test"
              className={
                active === "email-test"
                  ? "text-ink font-medium"
                  : "text-ink-soft hover:text-ink"
              }
            >
              Tracking Test
            </Link>
          </nav>
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
