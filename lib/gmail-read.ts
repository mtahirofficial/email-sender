import { GoogleModifyScopeError, GoogleReadScopeError } from "@/lib/google";

// Reads replies from Gmail. Only used when the person turned on the Inbox for that account.
// Message text is read on demand and never stored by Outbox.

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public upstreamResponse?: { statusText: string; contentType: string | null; date: string | null; body: string }
  ) {
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
    throw new GmailApiError(res.status, `Gmail ${res.status}: ${text.slice(0, 300)}`, {
      statusText: res.statusText,
      contentType: res.headers.get("content-type"),
      date: res.headers.get("date"),
      body: text.slice(0, 8_000),
    });
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (!retried) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return gmailGet(accessToken, path, true);
    }
    throw new GmailApiError(502, "Gmail returned an empty or invalid response.", {
      statusText: res.statusText,
      contentType: res.headers.get("content-type"),
      date: res.headers.get("date"),
      body: text.slice(0, 8_000),
    });
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

type Part = { partId?: string; mimeType?: string; filename?: string; body?: { data?: string; attachmentId?: string; size?: number }; parts?: Part[] };

export type ThreadAttachment = { id: string; filename: string; mimeType: string; size: number; inlineData?: string };

function collectAttachments(part: Part, out: ThreadAttachment[], withData = false) {
  if (part.filename?.trim() && (part.body?.attachmentId || part.body?.data) && part.partId) {
    out.push({
      id: part.body.attachmentId || part.partId,
      filename: decodeMimeWords(part.filename),
      mimeType: part.mimeType || "application/octet-stream",
      size: Number(part.body.size ?? 0),
      ...(withData && part.body.data ? { inlineData: part.body.data } : {}),
    });
  }
  for (const child of part.parts ?? []) collectAttachments(child, out, withData);
}

function attachmentList(payload?: Part, withData = false): ThreadAttachment[] {
  if (!payload) return [];
  const out: ThreadAttachment[] = [];
  collectAttachments(payload, out, withData);
  return out;
}

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
  attachments?: ThreadAttachment[];
};

type RawMessage = { id: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: Part & { headers?: { name: string; value: string }[] } };

function toMessage(raw: RawMessage, withText: boolean, withAttachmentData = false): ThreadMessage {
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
    ...(withText && raw.payload ? { text: stripQuoted(messageText(raw.payload)), attachments: attachmentList(raw.payload, withAttachmentData) } : {}),
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

export async function getThreadFull(accessToken: string, threadId: string, withAttachmentData = false): Promise<ThreadMessage[]> {
  const data = await gmailGet(accessToken, `/threads/${encodeURIComponent(threadId)}?format=full&fields=messages(id,labelIds,snippet,internalDate,payload)`);
  return ((data.messages ?? []) as RawMessage[]).map((m) => toMessage(m, true, withAttachmentData)).sort((a, b) => a.at - b.at);
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

export type MailListItem = { id: string; threadId: string; from: string; subject: string; snippet: string; at: number; unread: boolean; starred: boolean; isReply: boolean; attachmentCount: number };

export const INBOX_PAGE_SIZE = 50;

async function listInboxMessagesPage(accessToken: string, opts: { pageToken?: string; q?: string }) {
  const params = [`labelIds=INBOX`, `maxResults=${INBOX_PAGE_SIZE}`, `fields=messages(id,threadId),nextPageToken`];
  if (opts.q?.trim()) params.push(`q=${encodeURIComponent(opts.q.trim().slice(0, 200))}`);
  if (opts.pageToken) {
    if (!/^[A-Za-z0-9_-]{1,300}$/.test(opts.pageToken)) throw new GmailApiError(400, "Bad page token");
    params.push(`pageToken=${opts.pageToken}`);
  }
  const list = await gmailGet(accessToken, `/messages?${params.join("&")}`);
  const ids: { id: string; threadId: string }[] = list.messages ?? [];
  const detail = "format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=In-Reply-To&fields=id,threadId,labelIds,snippet,internalDate,payload";
  const found: (MailListItem | null)[] = new Array(ids.length).fill(null);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(5, ids.length) }, async () => {
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
          attachmentCount: attachmentList(raw.payload).length,
        };
      } catch (err) {
        if (err instanceof GoogleReadScopeError) throw err;
        // A message deleted while listing can be skipped safely.
      }
    }
  }));
  return { items: found.filter((m): m is MailListItem => m !== null), nextPageToken: list.nextPageToken ?? null };
}

/** Inbox search uses Gmail's message query, then collapses matching hits by conversation. */
export async function listInboxPage(accessToken: string, opts: { pageToken?: string; q?: string } = {}): Promise<{ items: MailListItem[]; nextPageToken: string | null }> {
  const page = await listInboxMessagesPage(accessToken, opts);
  if (!opts.q?.trim()) return page;

  // Gmail's messages.list query returns only messages matching the search term.
  // Keep the newest matching message per thread so unrelated conversations/messages
  // don't leak into search results and each conversation appears only once.
  const byThread = new Map<string, MailListItem>();
  for (const item of page.items) {
    if (!byThread.has(item.threadId)) byThread.set(item.threadId, item);
  }
  return { items: [...byThread.values()], nextPageToken: page.nextPageToken };
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
      throw new GoogleModifyScopeError("This account did not allow Outbox to change Gmail message labels.");
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

/** Downloads an attachment only after confirming its ID belongs to the requested message in its Gmail thread. */
export async function getMessageAttachment(
  accessToken: string,
  threadId: string,
  messageId: string,
  attachmentId: string,
  fallback: Pick<ThreadAttachment, "filename" | "mimeType" | "size">
) {
  // Gmail IDs are opaque. Keep path separators/control characters out, but do not
  // assume they only contain base64url characters (some include padding/punctuation).
  const validId = (value: string) => value.length > 0 && value.length <= 500 && /^[A-Za-z0-9._~+=-]+$/.test(value) && value !== "." && value !== "..";
  if (!validId(messageId) || !validId(attachmentId)) {
    throw new GmailApiError(400, "Invalid attachment reference");
  }
  if (!validId(threadId)) throw new GmailApiError(400, "Invalid Gmail thread reference");

  // Ask Gmail for external attachment data directly first. This API validates
  // that the ID belongs to this message and avoids relying on reconstructed MIME metadata.
  try {
    const data = await gmailGet(accessToken, `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
    return {
      attachment: { id: attachmentId, ...fallback },
      bytes: Buffer.from(String(data.data ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64"),
    };
  } catch (err) {
    if (!(err instanceof GmailApiError) || err.status !== 404) throw err;
  }

  // Small inline MIME parts have body data and no separate attachment resource.
  const messages = await getThreadFull(accessToken, threadId, true);
  const attachment = messages.find((message) => message.id === messageId)?.attachments?.find((item) => item.id === attachmentId);
  if (!attachment) throw new GmailApiError(404, "Attachment not found in this Gmail thread");
  if (attachment.inlineData) {
    const { inlineData, ...metadata } = attachment;
    return { attachment: metadata, bytes: Buffer.from(inlineData.replace(/-/g, "+").replace(/_/g, "/"), "base64") };
  }
  throw new GmailApiError(404, "Gmail could not find this attachment in the selected message");
}
