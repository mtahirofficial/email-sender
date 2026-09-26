const MS_AUTH_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_SEND_URL = "https://graph.microsoft.com/v1.0/me/sendMail";
const GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me";

function redirectUri() {
  return `${process.env.NEXT_PUBLIC_APP_URL}/oauth/microsoft/callback`;
}

/** Builds the URL that starts the "Connect Outlook" consent flow. */
export function getMicrosoftAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    response_mode: "query",
    // Mail.Send only lets this app send mail — it cannot read the inbox.
    scope: ["offline_access", "Mail.Send", "User.Read"].join(" "),
    state,
    prompt: "consent",
  });
  return `${MS_AUTH_URL}?${params.toString()}`;
}

export async function exchangeMicrosoftCode(code: string) {
  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Microsoft token exchange failed: ${await res.text()}`);
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

export async function refreshMicrosoftAccessToken(refreshToken: string) {
  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Microsoft token refresh failed: ${await res.text()}`);
  }
  // Microsoft rotates refresh tokens; the caller should persist the new one if present.
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

export async function getMicrosoftUserEmail(accessToken: string) {
  const res = await fetch(GRAPH_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Could not fetch Microsoft account email");
  const data = await res.json();
  return (data.mail || data.userPrincipalName) as string;
}

/** Sends an email through Microsoft Graph, as the connected Outlook account. */
export async function sendOutlookMail(
  accessToken: string,
  opts: { to: string; subject: string; body: string; isHtml?: boolean }
) {
  const res = await fetch(GRAPH_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: opts.subject,
        body: { contentType: opts.isHtml ? "HTML" : "Text", content: opts.body },
        toRecipients: [{ emailAddress: { address: opts.to } }],
      },
      saveToSentItems: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`Outlook send failed: ${await res.text()}`);
  }
  // Graph returns 202 Accepted with an empty body on success.
  return true;
}
