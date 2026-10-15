import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/accounts";
import { sendGmail } from "@/lib/google";
import { sendOutlookMail } from "@/lib/microsoft";
import { logEmailAttempt } from "@/lib/email-logs";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Splits a free-typed recipients field on commas, semicolons and newlines. */
function parseRecipients(raw: string): string[] {
  const parts = raw
    .split(/[\n,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)); // de-duplicate
}

// Recipients are sent one after another, so large batches need more time
// than the default serverless limit.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const accountId = body?.accountId as string | undefined;
  const rawTo = body?.to as string | string[] | undefined;
  const subject = (body?.subject as string | undefined)?.trim();
  const message = body?.body as string | undefined;

  // Optional { "<recipient email>": "<subject>" } map. When present, a
  // recipient listed in it gets that subject; everyone else gets `subject`.
  const rawSubjects =
    body?.subjects && typeof body.subjects === "object" && !Array.isArray(body.subjects)
      ? (body.subjects as Record<string, unknown>)
      : null;

  function subjectFor(to: string): string {
    if (rawSubjects && Object.prototype.hasOwnProperty.call(rawSubjects, to)) {
      const specific = rawSubjects[to];
      return typeof specific === "string" ? specific.trim() : "";
    }
    return subject ?? "";
  }

  const recipients = Array.isArray(rawTo)
    ? rawTo.map((r) => r.trim()).filter(Boolean)
    : parseRecipients(rawTo ?? "");

  if (!accountId || recipients.length === 0 || !message) {
    return NextResponse.json(
      { error: "accountId, at least one recipient, subject and body are all required." },
      { status: 400 }
    );
  }

  const invalid = recipients.filter((r) => !isValidEmail(r));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `These addresses don't look valid: ${invalid.join(", ")}` },
      { status: 400 }
    );
  }

  const missingSubject = recipients.filter((r) => !subjectFor(r));
  if (missingSubject.length > 0) {
    return NextResponse.json(
      { error: `Every recipient needs a subject. Missing for: ${missingSubject.join(", ")}` },
      { status: 400 }
    );
  }

  let provider: "google" | "microsoft";
  let fromEmail: string;
  let accessToken: string;
  try {
    const account = await getValidAccessToken(supabase, user.id, accountId);
    provider = account.provider;
    fromEmail = account.email;
    accessToken = account.accessToken;
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Could not use that connected account. It may need to be reconnected." },
      { status: 502 }
    );
  }

  // Every recipient gets their own, separate email — never combined via
  // To/Cc/Bcc — so each send is independent and logged on its own.
  const results: { to: string; ok: boolean; error?: string }[] = [];

  for (const to of recipients) {
    const recipientSubject = subjectFor(to);
    try {
      if (provider === "google") {
        await sendGmail(accessToken, { fromEmail, to, subject: recipientSubject, body: message });
      } else {
        await sendOutlookMail(accessToken, { to, subject: recipientSubject, body: message });
      }

      await logEmailAttempt(supabase, {
        userId: user.id,
        accountId,
        fromEmail,
        toEmail: to,
        subject: recipientSubject,
        status: "sent",
      });

      results.push({ to, ok: true });
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";

      await logEmailAttempt(supabase, {
        userId: user.id,
        accountId,
        fromEmail,
        toEmail: to,
        subject: recipientSubject,
        status: "failed",
        error: errorMessage.slice(0, 500),
      });

      results.push({ to, ok: false, error: "Send failed" });
    }
  }

  const sentCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - sentCount;

  return NextResponse.json({
    ok: failedCount === 0,
    from: fromEmail,
    sentCount,
    failedCount,
    results,
  });
}
