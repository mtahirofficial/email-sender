import { inboxRoute } from "@/lib/inbox-route";
import { InboxError, setConversationStatus } from "@/lib/inbox";

export const dynamic = "force-dynamic";

/** Marks a conversation done (it leaves the lists), or brings it back. */
export const POST = (request: Request) =>
  inboxRoute(async ({ supabase, user }) => {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.id !== "string" || (body.action !== "close" && body.action !== "reopen")) throw new InboxError("Nothing to change.", 400);
    await setConversationStatus(supabase, user.id, body.id, body.action);
    return { ok: true };
  });
