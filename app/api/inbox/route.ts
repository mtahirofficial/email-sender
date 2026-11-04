import { inboxRoute } from "@/lib/inbox-route";
import { listInbox, saveInboxSettings } from "@/lib/inbox";

export const dynamic = "force-dynamic";

export const GET = () => inboxRoute(({ supabase, user }) => listInbox(supabase, user.id));

/** Saves the follow-up settings and the notes the AI uses when it writes. */
export const PUT = (request: Request) =>
  inboxRoute(async ({ supabase, user }) => {
    const body = await request.json().catch(() => ({}));
    await saveInboxSettings(supabase, user.id, { follow_up_after_days: body.followUpAfterDays, max_follow_ups: body.maxFollowUps, instructions: body.instructions });
    return { ok: true };
  });
