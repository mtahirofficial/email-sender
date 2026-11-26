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
      const gmailBody = err.upstreamResponse?.body ?? "";
      const quotaLimited = (err.status === 403 || err.status === 429) && /rateLimitExceeded|userRateLimitExceeded|RATE_LIMIT_EXCEEDED|Total Query Cost/i.test(gmailBody);
      if (quotaLimited) {
        const windowStart = /"window_start_time"\s*:\s*"?(\d+)"?/i.exec(gmailBody)?.[1];
        const secondsUntilReset = windowStart
          ? Math.ceil((Number(windowStart) * 1000 + 60_000 - Date.now()) / 1000)
          : 30;
        const retryAfterSeconds = Math.max(3, Math.min(60, secondsUntilReset));
        const wrapped = new InboxError(
          "Gmail is temporarily busy because its request limit was reached. Outbox will try again shortly.",
          429,
          { gmailBusy: true, retryAfterSeconds }
        );
        (wrapped as Error & { cause?: unknown }).cause = err;
        throw wrapped;
      }
      const friendlyMessage = err.status === 400
        ? "That search couldn’t be used. Try a shorter or simpler search."
        : "We couldn’t load your inbox right now. Please try again in a moment.";
      const wrapped = new InboxError(friendlyMessage, err.status === 400 ? 400 : 502);
      (wrapped as Error & { cause?: unknown }).cause = err;
      throw wrapped;
    }
  }, request);
