import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeGoogleCode, getGoogleUserEmail, hasGmailSendScope } from "@/lib/google";
import { saveConnectedAccount } from "@/lib/accounts";

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get("google_oauth_state")?.value;
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent("Google connection was cancelled.")}`, appUrl)
    );
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent("Invalid or expired connection request.")}`, appUrl)
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  try {
    const tokens = await exchangeGoogleCode(code);
    const email = await getGoogleUserEmail(tokens.access_token);

    // When adding Inbox permission to an existing Google connection, Google may
    // omit a new refresh token. Keep the saved one; a new account still needs one.
    if (!tokens.refresh_token) {
      const { data: existing, error } = await supabase
        .from("connected_accounts")
        .select("refresh_token")
        .eq("user_id", user.id)
        .eq("provider", "google")
        .eq("email", email)
        .maybeSingle();
      if (error) throw error;
      if (!existing?.refresh_token) {
        return NextResponse.redirect(
          new URL(
            `/settings?error=${encodeURIComponent(
              "Google didn't return a refresh token. Remove this app's access in your Google Account and try connecting again."
            )}`,
            appUrl
          )
        );
      }
    }

    // Google lets people untick individual permissions, so check what was really granted.
    const sheetsFlow = request.cookies.get("google_oauth_sheets")?.value === "1";

    // Without the "send email" permission every send would fail later, so don't save a broken connection.
    if (!hasGmailSendScope(tokens.scope)) {
      const message =
        'Google did not give Outbox permission to send email. Connect again and keep every box ticked on Google\'s screen, especially "Send email on your behalf".';
      const failed = NextResponse.redirect(
        new URL(`${sheetsFlow ? "/automation" : "/settings"}?error=${encodeURIComponent(message)}`, appUrl)
      );
      failed.cookies.delete("google_oauth_state");
      failed.cookies.delete("google_oauth_sheets");
      failed.cookies.delete("google_oauth_inbox");
      failed.cookies.delete("google_oauth_next");
      return failed;
    }

    const sheetsGranted = (tokens.scope ?? "").includes("/auth/spreadsheets");
    const inboxFlow = request.cookies.get("google_oauth_inbox")?.value === "1";
    const inboxGranted = (tokens.scope ?? "").includes("/auth/gmail.modify");

    await saveConnectedAccount(supabase, {
      userId: user.id,
      provider: "google",
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expires_in,
      sheetsEnabled: sheetsGranted,
      inboxEnabled: inboxGranted,
    });

    const returnTo = request.cookies.get("google_oauth_next")?.value;
    const safeReturn = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : null;

    let destination = "/settings?connected=google";
    if (inboxFlow) {
      destination = inboxGranted
        ? "/inbox?connected=inbox"
        : `/inbox?error=${encodeURIComponent("Google did not give Outbox permission to manage inbox messages. Try again and keep the inbox permission ticked on Google's screen.")}`;
    } else if (safeReturn && (!sheetsFlow || sheetsGranted)) {
      destination = `${safeReturn}${safeReturn.includes("?") ? "&" : "?"}connected=${sheetsFlow ? "sheets" : "google"}`;
    } else if (sheetsFlow) {
      destination = sheetsGranted
        ? "/automation?connected=sheets"
        : `/automation?error=${encodeURIComponent("Google Sheets permission wasn't granted. Tick it on Google's screen to use automation.")}`;
    }
    const response = NextResponse.redirect(new URL(destination, appUrl));
    response.cookies.delete("google_oauth_state");
    response.cookies.delete("google_oauth_sheets");
    response.cookies.delete("google_oauth_inbox");
    response.cookies.delete("google_oauth_next");
    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent("Could not connect this Gmail account.")}`, appUrl)
    );
  }
}
