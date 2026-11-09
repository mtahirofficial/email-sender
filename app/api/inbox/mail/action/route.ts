import { NextRequest } from "next/server";
import { inboxRoute } from "@/lib/inbox-route";
import { InboxError, updateInboxMail } from "@/lib/inbox";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return inboxRoute(({ supabase, user }) => {
    if (!body || typeof body !== "object") throw new InboxError("Invalid request.", 400);
    const { account, threadId, messageId, action } = body as Record<string, unknown>;
    if (typeof account !== "string" || typeof threadId !== "string" || !["mark-read", "star", "unstar"].includes(String(action))) {
      throw new InboxError("Invalid inbox action.", 400);
    }
    return updateInboxMail(supabase, user.id, {
      account,
      threadId,
      ...(typeof messageId === "string" ? { messageId } : {}),
      action: action as "mark-read" | "star" | "unstar",
    });
  });
}
