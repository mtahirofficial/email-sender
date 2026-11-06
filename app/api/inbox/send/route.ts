import { inboxRoute } from "@/lib/inbox-route";
import { InboxError, sendConversation } from "@/lib/inbox";
import { targetFrom } from "@/lib/inbox-target";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = (request: Request) =>
  inboxRoute(async ({ supabase, user }) => {
    const body = await request.json().catch(() => ({}));
    if ((body?.kind !== "reply" && body?.kind !== "followup") || typeof body.body !== "string") throw new InboxError("Nothing to send.", 400);
    return sendConversation(supabase, user.id, targetFrom(body), body.kind, body.body);
  });
