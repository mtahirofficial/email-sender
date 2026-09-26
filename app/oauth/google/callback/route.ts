import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeGoogleCode, getGoogleUserEmail } from "@/lib/google";
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
      new URL(`/?error=${encodeURIComponent("Google connection was cancelled.")}`, appUrl)
    );
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent("Invalid or expired connection request.")}`, appUrl)
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  try {
    const tokens = await exchangeGoogleCode(code);
    if (!tokens.refresh_token) {
      // Happens if the user had already granted consent before without
      // revoking access — Google only issues a refresh_token on first consent.
      return NextResponse.redirect(
        new URL(
          `/?error=${encodeURIComponent(
            "Google didn't return a refresh token. Remove this app's access at https://myaccount.google.com/permissions and try connecting again."
          )}`,
          appUrl
        )
      );
    }

    const email = await getGoogleUserEmail(tokens.access_token);

    await saveConnectedAccount(supabase, {
      userId: user.id,
      provider: "google",
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expires_in,
    });

    const response = NextResponse.redirect(new URL("/?connected=google", appUrl));
    response.cookies.delete("google_oauth_state");
    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent("Could not connect this Gmail account.")}`, appUrl)
    );
  }
}
