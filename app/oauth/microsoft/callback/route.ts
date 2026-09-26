import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeMicrosoftCode, getMicrosoftUserEmail } from "@/lib/microsoft";
import { saveConnectedAccount } from "@/lib/accounts";

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get("microsoft_oauth_state")?.value;
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent("Microsoft connection was cancelled.")}`, appUrl)
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
    const tokens = await exchangeMicrosoftCode(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL(
          `/?error=${encodeURIComponent("Microsoft didn't return a refresh token. Please try connecting again.")}`,
          appUrl
        )
      );
    }

    const email = await getMicrosoftUserEmail(tokens.access_token);

    await saveConnectedAccount(supabase, {
      userId: user.id,
      provider: "microsoft",
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expires_in,
    });

    const response = NextResponse.redirect(new URL("/?connected=microsoft", appUrl));
    response.cookies.delete("microsoft_oauth_state");
    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent("Could not connect this Outlook account.")}`, appUrl)
    );
  }
}
