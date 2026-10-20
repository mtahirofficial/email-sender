import type { User } from "@supabase/supabase-js";
import { isAdminUser } from "@/lib/admin";

/** The few user fields the header needs. Safe to send to the browser. */
export type HeaderUser = {
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
};

export function toHeaderUser(user: User): HeaderUser {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  const avatar = typeof meta.avatar_url === "string" ? meta.avatar_url : "";
  return {
    email: user.email ?? "",
    name: name || null,
    avatarUrl: avatar || null,
    isAdmin: isAdminUser(user),
  };
}
