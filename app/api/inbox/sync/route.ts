import { inboxRoute } from "@/lib/inbox-route";
import { syncInbox } from "@/lib/inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = (request: Request) =>
  inboxRoute(async ({ supabase, user }) => {
    const body = await request.json().catch(() => ({}));
    return syncInbox(supabase, user.id, body?.force === true);
  });
