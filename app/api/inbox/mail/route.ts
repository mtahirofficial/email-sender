import { NextRequest } from "next/server";
import { inboxRoute } from "@/lib/inbox-route";
import { listMailPage } from "@/lib/inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One page (50) of a Gmail account's inbox. ?account=ID&page=TOKEN&q=SEARCH */
export const GET = (request: NextRequest) =>
  inboxRoute(({ supabase, user }) => {
    const q = request.nextUrl.searchParams;
    return listMailPage(supabase, user.id, q.get("account") ?? "", { pageToken: q.get("page") || undefined, q: q.get("q") || undefined });
  });
