import { inboxRoute } from "@/lib/inbox-route";
import { InboxError, sendConversation } from "@/lib/inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = (request: Request) =>
  inboxRoute(async ({ supabase, user }) => {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.id !== "string" || (body.kind !== "reply" && body.kind !== "followup") || typeof body.body !== "string") throw new InboxError("Nothing to send.", 400);
    return sendConversation(supabase, user.id, body.id, body.kind, body.body);
  });
