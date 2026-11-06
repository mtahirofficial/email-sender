import { inboxRoute } from "@/lib/inbox-route";
import { InboxError, draftConversation } from "@/lib/inbox";
import { targetFrom } from "@/lib/inbox-target";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = (request: Request) =>
  inboxRoute(async ({ supabase, user }) => {
    const body = await request.json().catch(() => ({}));
    if (body?.kind !== "reply" && body?.kind !== "followup") throw new InboxError("Choose a conversation first.", 400);
    const target = targetFrom(body);
    const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 1000) : "";
    return draftConversation(supabase, user.id, target, body.kind, instruction);
  });
