const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

function redirectUri() {
  return `${process.env.NEXT_PUBLIC_APP_URL}/oauth/google/callback`;
}

/** Builds the URL that starts the "Connect Gmail" consent flow. */
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
// Reading replies is a separate, optional permission (Google calls it a "restricted" scope).
export const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

/**
 * Google lets people untick single permissions on its consent screen, so a
 * token can come back without the "send email" permission. If Google gives no
 * scope text at all we can't tell, so that counts as fine.
 */
export function hasGmailSendScope(scope?: string | null) {
  if (!scope || !scope.trim()) return true;
  return scope.split(/\s+/).includes(GMAIL_SEND_SCOPE);
}

/** Thrown by sendGmail when Google says the token has no permission to send. */
export class GoogleScopeError extends Error {}

/** Thrown when reading mail fails because the account did not allow Outbox to read replies. */
export class GoogleReadScopeError extends Error {}

/**
 * Asks Google which permissions an access token really has.
 * true / false when Google answers, null when it can't be checked right now.
 */
export async function googleTokenHasSendScope(accessToken: string): Promise<boolean | null> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { scope?: string };
    if (!data.scope) return null;
    return data.scope.split(/\s+/).includes(GMAIL_SEND_SCOPE);
  } catch {
    return null;
  }
}

/** `withSheets` additionally asks for Google Sheets access (used only by the automation feature). */
export function getGoogleAuthUrl(state: string, withSheets = false, withInbox = false) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    // gmail.send only sends mail. Gmail modify access is requested only when someone turns on the inbox, to allow read and star actions.
    scope: [
      GMAIL_SEND_SCOPE,
      "https://www.googleapis.com/auth/userinfo.email",
      ...(withSheets ? [SHEETS_SCOPE] : []),
      ...(withInbox ? [GMAIL_READ_SCOPE] : []),
    ].join(" "),
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // forces Google to re-issue a refresh_token every time
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${await res.text()}`);
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
    scope?: string;
  }>;
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${await res.text()}`);
  }
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

export async function getGoogleUserEmail(accessToken: string) {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Could not fetch Google account email");
  const data = await res.json();
  return data.email as string;
}

function toBase64Url(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

/** Header text with accents or other languages must be sent as an RFC 2047 "encoded word". */
function encodeHeader(value: string) {
  const text = oneLine(value);
  return /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

/** Sends an email through the Gmail API, as the connected Gmail account. */
export async function sendGmail(
  accessToken: string,
  opts: {
    fromName?: string;
    fromEmail: string;
    to: string;
    subject: string;
    body: string;
    /** Defaults to false (plain text) to preserve existing compose behavior. */
    isHtml?: boolean;
    /** Sends as a reply inside an existing conversation. */
    threadId?: string;
    inReplyTo?: string;
    references?: string;
  }
) {
  const from = opts.fromName
    ? `${opts.fromName} <${opts.fromEmail}>`
    : opts.fromEmail;

  const mime = [
    `From: ${from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    ...(opts.inReplyTo ? [`In-Reply-To: ${oneLine(opts.inReplyTo)}`] : []),
    ...(opts.references ? [`References: ${oneLine(opts.references)}`] : []),
    "MIME-Version: 1.0",
    opts.isHtml
      ? 'Content-Type: text/html; charset="UTF-8"'
      : 'Content-Type: text/plain; charset="UTF-8"',
    "",
    opts.body,
  ].join("\r\n");

  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: toBase64Url(mime), ...(opts.threadId ? { threadId: opts.threadId } : {}) }),
  });

  if (!res.ok) {
    const text = await res.text();
    // The token works but was never given the "send email" permission.
    if (res.status === 403 && /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions|insufficient authentication scopes/i.test(text)) {
      throw new GoogleScopeError(`Gmail send failed: ${text}`);
    }
    throw new Error(`Gmail send failed: ${text}`);
  }
  return res.json();
}
