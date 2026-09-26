import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/accounts";
import { sendGmail } from "@/lib/google";
import { sendOutlookMail } from "@/lib/microsoft";
import { logEmailAttempt } from "@/lib/email-logs";
import { getOwnedTrackingTest } from "@/lib/email-test/store";
import { buildTestEmailHtml } from "@/lib/email-test/template";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const testId = body?.testId as string | undefined;
  const accountId = body?.accountId as string | undefined;
  const to = (body?.to as string | undefined)?.trim();

  if (!testId || !accountId || !to) {
    return NextResponse.json(
      { error: "testId, accountId and to are all required." },
      { status: 400 }
    );
  }
  if (!isValidEmail(to)) {
    return NextResponse.json({ error: "That recipient address doesn't look valid." }, { status: 400 });
  }

  const test = await getOwnedTrackingTest(supabase, user.id, testId);
  if (!test) {
    return NextResponse.json({ error: "Test not found." }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const html = buildTestEmailHtml(appUrl, test.public_test_id, test.element_tokens);

  try {
    const { provider, email, accessToken } = await getValidAccessToken(supabase, user.id, accountId);

    if (provider === "google") {
      await sendGmail(accessToken, {
        fromEmail: email,
        to,
        subject: test.subject,
        body: html,
        isHtml: true,
      });
    } else {
      await sendOutlookMail(accessToken, { to, subject: test.subject, body: html, isHtml: true });
    }

    // Reuses the existing Sent list so test sends show up there too.
    await logEmailAttempt(supabase, {
      userId: user.id,
      accountId,
      fromEmail: email,
      toEmail: to,
      subject: test.subject,
      status: "sent",
    });

    return NextResponse.json({ ok: true, from: email });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    await logEmailAttempt(supabase, {
      userId: user.id,
      accountId,
      fromEmail: "unknown",
      toEmail: to,
      subject: test.subject,
      status: "failed",
      error: errorMessage.slice(0, 500),
    });

    return NextResponse.json({ error: "Sending the test email failed." }, { status: 502 });
  }
}
