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
      throw new InboxError(
        err.status === 400
          ? "Gmail could not use that search. Try a simpler search term."
          : "Gmail could not load the inbox. Please try again.",
        502
      );
    }
  });
