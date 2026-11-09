import { GoogleReadScopeError } from "@/lib/google";

// Reads replies from Gmail. Only used when the person turned on the Inbox for that account.
// Message text is read on demand and never stored by Outbox.

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function gmailGet(accessToken: string, path: string, retried = false): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429 && !retried) {
    await new Promise((resolve) => setTimeout(resolve, 1200)); // Gmail's per-second limit: wait a moment, then try once more
    return gmailGet(accessToken, path, true);
  }
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403 && /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions|insufficient authentication scopes/i.test(text)) {
      throw new GoogleReadScopeError("This account did not allow Outbox to read replies.");
    }
    throw new GmailApiError(res.status, `Gmail ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return await res.json();
  } catch {
    if (!retried) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return gmailGet(accessToken, path, true);
    }
    throw new GmailApiError(502, "Gmail returned an empty or invalid response.");
  }
}

// ---- text helpers ----------------------------------------------------------

/** Turns "=?UTF-8?B?...?=" (and Q) header text into normal text. */
export function decodeMimeWords(value: string): string {
  return value.replace(/=\?([\w-]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, charset: string, enc: string, text: string) => {
    try {
      const bytes =
        enc.toUpperCase() === "B"
          ? Buffer.from(text, "base64")
          : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_x, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1");
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return text;
    }
  });
}

/** "Ann Lee <ann@x.com>" -> "ann@x.com" */
export function addressOf(header: string): string {
  const m = /<([^>]+)>/.exec(header);
  return (m ? m[1] : header).trim().toLowerCase();
}

function fromBase64Url(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function htmlToText(html: string) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<img\b[^>]*\balt\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi, (_m, doubleAlt: string, singleAlt: string) => `[image: ${doubleAlt ?? singleAlt}]`)
    .replace(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi, (_m, doubleHref: string, singleHref: string, bareHref: string, label: string) => {
      const href = doubleHref ?? singleHref ?? bareHref;
      const text = label.replace(/<[^>]+>/g, "").trim();
      return href && text ? `${text} <${href}>` : text;
    })
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "_$2_")
    .replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_m, code: string) => {
      const point = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      try { return String.fromCodePoint(point); } catch { return ""; }
    })
    .replace(/\n{3,}/g, "\n\n");
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };

function collect(part: Part, kind: "text/plain" | "text/html", out: string[]) {
  if (part.mimeType === kind && part.body?.data) out.push(fromBase64Url(part.body.data));
  for (const child of part.parts ?? []) collect(child, kind, out);
}

/** Readable text of a message: the plain part if there is one, otherwise the HTML with tags removed. */
export function messageText(payload: Part): string {
  const plain: string[] = [];
  collect(payload, "text/plain", plain);
  if (plain.join("").trim()) return plain.join("\n");
  const html: string[] = [];
  collect(payload, "text/html", html);
  return htmlToText(html.join("\n"));
}

/** Removes the quoted earlier messages and signatures noise from a reply, and cuts it to a sensible length. */
export function stripQuoted(text: string, maxChars = 2500): string {
  let t = text.replace(/\r\n/g, "\n");
  const cuts = [
    /^On [\s\S]{5,250}?wrote:\s*$/m, // "On Tue, 3 Nov 2026, Ann <a@x.com> wrote:"
    /^-{2,}\s*Original Message\s*-{2,}/im,
    /^From:\s.+\n(?:Sent|Date):\s/m, // Outlook style header block
    /^_{5,}\s*$/m,
  ];
  for (const re of cuts) {
    const m = re.exec(t);
    if (m && m.index > 0) t = t.slice(0, m.index);
  }
  t = t
    .split("\n")
    .filter((line) => !line.startsWith(">"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t.length > maxChars ? `${t.slice(0, maxChars)}...` : t;
}

// ---- messages and threads --------------------------------------------------

export type ThreadMessage = {
  id: string;
  labelIds: string[];
  snippet: string;
  at: number; // ms
  from: string;
  to: string;
  subject: string;
  messageId: string; // the Message-ID header, used to reply inside the same conversation
  references: string;
  text?: string;
};

type RawMessage = { id: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: Part & { headers?: { name: string; value: string }[] } };

function toMessage(raw: RawMessage, withText: boolean): ThreadMessage {
  const h = (name: string) => raw.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  return {
    id: raw.id,
    labelIds: raw.labelIds ?? [],
    snippet: decodeEntities(raw.snippet ?? ""),
    at: Number(raw.internalDate ?? 0),
    from: decodeMimeWords(h("From")),
    to: decodeMimeWords(h("To")),
    subject: decodeMimeWords(h("Subject")),
    messageId: h("Message-ID") || h("Message-Id"),
    references: h("References"),
    ...(withText && raw.payload ? { text: stripQuoted(messageText(raw.payload)) } : {}),
  };
}

const decodeEntities = (s: string) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Ids of conversations that received a message (not sent by this account) in the last `days` days. */
export async function listRecentInboundThreadIds(accessToken: string, days = 30): Promise<Set<string>> {
  const ids = new Set<string>();
  let pageToken = "";
  for (let page = 0; page < 10; page++) { // up to 5,000 recent incoming messages (ids only)
    const q = encodeURIComponent(`newer_than:${days}d -in:sent -in:drafts`);
    const data = await gmailGet(accessToken, `/messages?q=${q}&maxResults=500&fields=messages(threadId),nextPageToken${pageToken ? `&pageToken=${pageToken}` : ""}`);
    for (const m of data.messages ?? []) ids.add(m.threadId);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return ids;
}

/** The conversation our first email to this address started (search in Sent). */
export async function findOutreachThread(accessToken: string, toEmail: string, sentAtMs: number): Promise<string | null> {
  if (!/^[^\s"'()<>,;]+@[^\s"'()<>,;]+$/.test(toEmail)) return null;
  const after = Math.floor(sentAtMs / 1000) - 86_400;
  const q = encodeURIComponent(`in:sent to:${toEmail} after:${after}`);
  const data = await gmailGet(accessToken, `/messages?q=${q}&maxResults=10&fields=messages(id,threadId)`);
  const list: { threadId: string }[] = data.messages ?? [];
  return list.length > 0 ? list[list.length - 1].threadId : null; // newest first, so the last one is the oldest
}

const META = "format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References";
const FIELDS = "fields=messages(id,labelIds,snippet,internalDate,payload/headers)";

export async function getThreadMeta(accessToken: string, threadId: string): Promise<ThreadMessage[]> {
  const data = await gmailGet(accessToken, `/threads/${encodeURIComponent(threadId)}?${META}&${FIELDS}`);
  return ((data.messages ?? []) as RawMessage[]).map((m) => toMessage(m, false)).sort((a, b) => a.at - b.at);
}

export async function getThreadFull(accessToken: string, threadId: string): Promise<ThreadMessage[]> {
  const data = await gmailGet(accessToken, `/threads/${encodeURIComponent(threadId)}?format=full&fields=messages(id,labelIds,snippet,internalDate,payload)`);
  return ((data.messages ?? []) as RawMessage[]).map((m) => toMessage(m, true)).sort((a, b) => a.at - b.at);
}

// ---- what happened in a conversation ---------------------------------------

export type ThreadState = {
  state: "waiting" | "replied" | "answered" | "bounced";
  /** emails we sent after the first one, while nobody had answered */
  followUps: number;
  lastInbound?: ThreadMessage;
};

const isBounce = (m: ThreadMessage) => /mailer-daemon|postmaster/i.test(m.from) || /delivery status notification|undeliverable|returned mail|delivery has failed/i.test(m.subject);

export function analyzeThread(messages: ThreadMessage[], accountEmail: string): ThreadState {
  const me = accountEmail.toLowerCase();
  const mine = (m: ThreadMessage) => m.labelIds.includes("SENT") || addressOf(m.from) === me;
  const outbound = messages.filter(mine);
  const inbound = messages.filter((m) => !mine(m));
  const real = inbound.filter((m) => !isBounce(m));
  const followUps = Math.max(0, outbound.length - 1);

  if (inbound.length === 0) return { state: "waiting", followUps };
  if (real.length === 0) return { state: "bounced", followUps, lastInbound: inbound[inbound.length - 1] };

  const lastInbound = real[real.length - 1];
  const last = messages[messages.length - 1];
  return { state: mine(last) ? "answered" : "replied", followUps, lastInbound };
}

// ---- the whole inbox, one page at a time -------------------------------------

export type MailListItem = { id: string; threadId: string; from: string; subject: string; snippet: string; at: number; unread: boolean; starred: boolean; isReply: boolean };

export const INBOX_PAGE_SIZE = 50;

/**
 * One page (50) of the Inbox, newest first, like Gmail. `pageToken` is the token Gmail gave with the previous page.
 * Only the sender, subject, date and a short preview are read for the list; the full text is read when a message is opened.
 */
export async function listInboxPage(accessToken: string, opts: { pageToken?: string; q?: string } = {}): Promise<{ items: MailListItem[]; nextPageToken: string | null }> {
  const params = [`labelIds=INBOX`, `maxResults=${INBOX_PAGE_SIZE}`, `fields=messages(id,threadId),nextPageToken`];
  if (opts.q?.trim()) params.push(`q=${encodeURIComponent(opts.q.trim().slice(0, 200))}`);
  if (opts.pageToken) {
    if (!/^[A-Za-z0-9_-]{1,300}$/.test(opts.pageToken)) throw new GmailApiError(400, "Bad page token");
    params.push(`pageToken=${opts.pageToken}`);
  }
  const list = await gmailGet(accessToken, `/messages?${params.join("&")}`);
  const ids: { id: string; threadId: string }[] = list.messages ?? [];

  const detail = "format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=In-Reply-To&fields=id,threadId,labelIds,snippet,internalDate,payload/headers";
  const found: (MailListItem | null)[] = new Array(ids.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(5, ids.length) }, async () => {
      while (next < ids.length) {
        const index = next++;
        try {
          const raw = await gmailGet(accessToken, `/messages/${encodeURIComponent(ids[index].id)}?${detail}`);
          const h = (name: string) => raw.payload?.headers?.find((x: { name: string }) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
          const subject = decodeMimeWords(h("Subject"));
          found[index] = {
            id: raw.id,
            threadId: raw.threadId,
            from: decodeMimeWords(h("From")),
            subject,
            snippet: decodeEntities(raw.snippet ?? ""),
            at: Number(raw.internalDate ?? 0),
            unread: (raw.labelIds ?? []).includes("UNREAD"),
            starred: (raw.labelIds ?? []).includes("STARRED"),
            isReply: Boolean(h("In-Reply-To")) || /^\s*re:/i.test(subject),
          };
        } catch (err) {
          if (err instanceof GoogleReadScopeError) throw err;
          // a message deleted while we were listing: leave it out
        }
      }
    })
  );
  return { items: found.filter((m): m is MailListItem => m !== null), nextPageToken: list.nextPageToken ?? null };
}

/** Gmail's modify scope is required to update labels on a thread or message. */
async function gmailModify(accessToken: string, path: string, body: { addLabelIds?: string[]; removeLabelIds?: string[] }, retried = false) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429 && !retried) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return gmailModify(accessToken, path, body, true);
  }
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403 && /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions|insufficient authentication scopes/i.test(text)) {
      throw new GoogleReadScopeError("This account did not allow Outbox to manage inbox messages.");
    }
    throw new GmailApiError(res.status, `Gmail ${res.status}: ${text.slice(0, 300)}`);
  }
}

export function markThreadRead(accessToken: string, threadId: string) {
  return gmailModify(accessToken, `/threads/${encodeURIComponent(threadId)}/modify`, { removeLabelIds: ["UNREAD"] });
}

export function setMessageStarred(accessToken: string, messageId: string, starred: boolean) {
  return gmailModify(accessToken, `/messages/${encodeURIComponent(messageId)}/modify`, starred ? { addLabelIds: ["STARRED"] } : { removeLabelIds: ["STARRED"] });
}
