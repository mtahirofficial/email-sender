import { NextRequest } from "next/server";
import { GmailApiError } from "@/lib/gmail-read";
import { inboxRoute } from "@/lib/inbox-route";
import { InboxError, listMailPage } from "@/lib/inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One page (50) of a Gmail account's inbox. ?account=ID&page=TOKEN&q=SEARCH */
export const GET = (request: NextRequest) =>
  inboxRoute(async ({ supabase, user }) => {
    const q = request.nextUrl.searchParams;
    try {
      return await listMailPage(supabase, user.id, q.get("account") ?? "", { pageToken: q.get("page") || undefined, q: q.get("q") || undefined });
    } catch (err) {
      if (!(err instanceof GmailApiError)) throw err;
      console.error("inbox: Gmail search/list request failed", { status: err.status, message: err.message });
      const friendlyMessage = err.status === 400
        ? "That search couldn’t be used. Try a shorter or simpler search."
        : "We couldn’t load your inbox right now. Please try again in a moment.";
      const wrapped = new InboxError(friendlyMessage, err.status === 400 ? 400 : 502);
      (wrapped as Error & { cause?: unknown }).cause = err;
      throw wrapped;
    }
  }, request);
