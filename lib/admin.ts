// Admin-only tools are restricted to a single account. Server-side only:
// every admin page and API route checks this, the UI merely hides the links.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "hmtahirs1@gmail.com").trim().toLowerCase();

type MaybeUser = { email?: string | null; email_confirmed_at?: string | null } | null | undefined;

/** The address must match AND be confirmed, so nobody can claim it by signing up. */
export function isAdminUser(user: MaybeUser): boolean {
  return !!user?.email && !!user.email_confirmed_at && user.email.trim().toLowerCase() === ADMIN_EMAIL;
}
