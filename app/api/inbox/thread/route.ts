import { NextRequest } from "next/server";
import { inboxRoute } from "@/lib/inbox-route";
import { openThread } from "@/lib/inbox";
import { targetFrom } from "@/lib/inbox-target";

export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) => inboxRoute(({ supabase, user }) => {
    const q = request.nextUrl.searchParams;
    return openThread(supabase, user.id, targetFrom({ id: q.get("id"), account: q.get("account"), thread: q.get("thread") }));
  });
