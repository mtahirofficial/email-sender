import { GoogleModifyScopeError, GoogleReadScopeError } from "@/lib/google";
import { fetchGmailApi } from "@/lib/gmail-quota";

// Reads replies from Gmail. Only used when the person turned on the Inbox for that account.
// Message text is read on demand and never stored by Outbox.

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public upstreamResponse?: { status: number; statusText: string; contentType: string | null; date: string | null; body: string }
  ) {
    super(message);
  }
}

async function gmailGet(accessToken: string, path: string, retried = false): Promise<any> {
  const res = await fetchGmailApi(accessToken, `${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  }, path);
  // Gmail may answer an empty search with 204. Treat it as an empty collection,
  // so the inbox can show its normal "no matches" state instead of a server error.
  if (res.status === 204) return { messages: [] };
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403 && /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions|insufficient authentication scopes/i.test(text)) {
      throw new GoogleReadScopeError("This account did not allow Outbox to read replies.");
    }
    throw new GmailApiError(res.status, `Gmail ${res.status}: ${text.slice(0, 300)}`, {
      status: res.status,
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
      status: res.status,
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

function tagEnd(html: string, tag: string, start: number) {
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  token.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(html))) {
    if (match[0].startsWith("</")) depth--;
    else if (!/\/>$/.test(match[0])) depth++;
    if (depth === 0) return token.lastIndex;
  }
  return -1;
}

function splitQuotedHtml(html: string): { text: string; quotedText?: string } {
  const blockquote = /<blockquote\b[^>]*\btype\s*=\s*["']cite["'][^>]*>/i.exec(html);
  if (blockquote) {
    const end = tagEnd(html, "blockquote", blockquote.index);
    if (end >= 0) {
      const before = html.slice(0, blockquote.index);
      const attributionPattern = /On\b[\s\S]{0,700}?wrote:\s*/gi;
      let attribution: RegExpExecArray | null;
      let lastAttribution: RegExpExecArray | null = null;
      while ((attribution = attributionPattern.exec(before))) lastAttribution = attribution;
      const quoteStart = lastAttribution?.index ?? blockquote.index;
      const quoteHtml = html.slice(quoteStart, end);
      const bodyHtml = `${html.slice(0, quoteStart)}${html.slice(end)}`;
      return { text: htmlToText(bodyHtml).trim(), quotedText: htmlToText(quoteHtml).trim() || undefined };
    }
  }

  const markers = [
    /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bgmail_quote\b[^"']*["'][^>]*>/i,
    /<div\b[^>]*\bid\s*=\s*["']divRplyFwdMsg["'][^>]*>/i,
    /<div\b[^>]*\bclass\s*=\s*["'][^"']*\byahoo_quoted\b[^"']*["'][^>]*>/i,
  ];
  const marker = markers.map((regex) => regex.exec(html)).filter((x): x is RegExpExecArray => Boolean(x)).sort((a, b) => a.index - b.index)[0];
  if (!marker) return { text: htmlToText(html).trim() };
  const tag = /^<([a-z]+)/i.exec(marker[0])?.[1] ?? "div";
  const end = tagEnd(html, tag, marker.index);
  if (end < 0) return { text: htmlToText(html).trim() };
  const quoteStart = marker.index;
  return {
    text: htmlToText(`${html.slice(0, quoteStart)}${html.slice(end)}`).trim(),
    quotedText: htmlToText(html.slice(quoteStart, end)).trim() || undefined,
  };
}

function splitQuotedPlain(text: string): { text: string; quotedText?: string } {
  const normalized = text.replace(/\r\n?/g, "\n").trim();

  // Some CRM systems (including IEEE's support center) append their complete
  // ticket history as plain text, separated by headings and horizontal rules
  // instead of Gmail's usual quote markup. Keep the current response visible
  // and place the appended history behind the existing three-dot toggle.
  const subjectSection = /\nSubject\s*\n\s*-{3,}\s*\n/i.exec(normalized);
  const discussionSection = /\nDiscussion Thread\s*\n\s*-{3,}\s*\n/i.exec(normalized);
  if (subjectSection && /^Response\s*(?:\n|$)/i.test(normalized)) {
    const current = normalized.slice(0, subjectSection.index).trim();
    const quoted = normalized.slice(subjectSection.index + 1).trim();
    return { text: current, ...(quoted ? { quotedText: quoted } : {}) };
  }
  if (discussionSection) {
    const discussionStart = discussionSection.index + discussionSection[0].length;
    const replyMarker = /(?:^|\n)Response By Email\s*\([^\n]*\)\s*\([^\n]*\)\s*/i.exec(normalized.slice(discussionStart));
    if (replyMarker) {
      const replyStart = discussionStart + replyMarker.index + replyMarker[0].length;
      const remaining = normalized.slice(replyStart);
      const oldCustomerMessage = /\nCustomer By\s[^\n]*\n/i.exec(remaining);
      const oldAgentMessage = /\nResponse By Email\s\([^\n]*\)\s\([^\n]*\)\s/i.exec(remaining);
      const quoteStart = [oldCustomerMessage?.index, oldAgentMessage?.index]
        .filter((index): index is number => index !== undefined && index > 0)
        .sort((a, b) => a - b)[0];
      const current = (quoteStart === undefined ? remaining : remaining.slice(0, quoteStart)).trim();
      const quoted = normalized.slice(0, replyStart).trim();
      if (current) return { text: current, quotedText: quoted };
    }
  }

  const attribution = /^\s*(?:On\s+[^\n]{5,500}?wrote:?|(?:Le|Am|El|Il|Op)\s+[^\n]{5,500}?(?:schrieb|wrote|a écrit|escribió|ha scritto|schreef):?)\s*$/im.exec(normalized);
  if (!attribution) return { text: stripQuoted(normalized) };
  const before = normalized.slice(0, attribution.index).trim();
  const after = normalized.slice(attribution.index + attribution[0].length);
  if (before) return { text: stripQuoted(before), quotedText: after.trim() || attribution[0].trim() };

  const lines = after.split("\n");
  let lastQuoted = -1;
  for (let index = 0; index < lines.length; index++) {
    if (/^\s*>/.test(lines[index])) lastQuoted = index;
    else if (lastQuoted >= 0 && lines[index].trim()) {
      const quotedText = `${attribution[0].trim()}\n${lines.slice(0, index).join("\n")}`.trim();
      return { text: stripQuoted(lines.slice(index).join("\n")), quotedText };
    }
  }
  return { text: "", quotedText: `${attribution[0].trim()}\n${after}`.trim() };
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
export function messageContent(payload: Part): { text: string; quotedText?: string } {
  const plain: string[] = [];
  collect(payload, "text/plain", plain);
  const html: string[] = [];
  collect(payload, "text/html", html);
  const plainText = plain.join("\n").trim();
  const htmlText = html.join("\n").trim();
  if (htmlText) {
    const htmlContent = splitQuotedHtml(htmlText);
    if (htmlContent.quotedText) return { ...htmlContent, text: stripQuoted(htmlContent.text) };
  }
  if (plainText) return splitQuotedPlain(plainText);
  return { text: stripQuoted(htmlToText(htmlText)) };
}

/** Removes the quoted earlier messages and signatures noise from a reply, and cuts it to a sensible length. */
export function stripQuoted(text: string, maxChars = 2500): string {
  let t = text.replace(/\r\n/g, "\n").replace(/[\u200B-\u200D\uFEFF]/g, "");
  const cuts = [
    /^\s*On\s+[\s\S]{5,500}?\s+wrote\s*:?\s*$/im, // Gmail and Apple Mail
    /^\s*(?:Le|Am|El|Il|Op)\s+[\s\S]{5,500}?(?:schrieb|wrote|a écrit|escribió|ha scritto|schreef)\s*:?\s*$/im,
    /^\s*-{2,}\s*(?:Original Message|Forwarded message)\s*-{2,}\s*$/im,
    /^\s*Begin forwarded message:\s*$/im,
    /^\s*From:\s.+\n(?:Sent|Date|To|Subject):\s/im, // Outlook style header block
  ];
  let firstCut = -1;
  for (const re of cuts) {
    const m = re.exec(t);
    if (m && m.index > 0 && (firstCut < 0 || m.index < firstCut)) firstCut = m.index;
  }
  if (firstCut >= 0) t = t.slice(0, firstCut);
  t = t
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
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
  quotedText?: string;
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
    ...(withText && raw.payload ? { ...messageContent(raw.payload), attachments: attachmentList(raw.payload, withAttachmentData) } : {}),
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

/** Lists Gmail conversations directly, so copies/replies to multiple recipients stay in one row. */
export async function listInboxPage(accessToken: string, opts: { pageToken?: string; q?: string } = {}): Promise<{ items: MailListItem[]; nextPageToken: string | null }> {
  const params = [`labelIds=INBOX`, `maxResults=${INBOX_PAGE_SIZE}`, `fields=threads(id),nextPageToken`];
  if (opts.q?.trim()) params.push(`q=${encodeURIComponent(opts.q.trim().slice(0, 200))}`);
  if (opts.pageToken) {
    if (!/^[A-Za-z0-9_-]{1,300}$/.test(opts.pageToken)) throw new GmailApiError(400, "Bad page token");
    params.push(`pageToken=${opts.pageToken}`);
  }
  const list = await gmailGet(accessToken, `/threads?${params.join("&")}`);
  const threads: { id: string }[] = list.threads ?? [];
  const detail = "format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=In-Reply-To&fields=id,messages(id,labelIds,snippet,internalDate,payload)";
  const found: (MailListItem | null)[] = new Array(threads.length).fill(null);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(5, threads.length) }, async () => {
    while (next < threads.length) {
      const index = next++;
      try {
        const thread = await gmailGet(accessToken, `/threads/${encodeURIComponent(threads[index].id)}?${detail}`);
        const inboxMessages = ((thread.messages ?? []) as RawMessage[])
          .filter((message) => (message.labelIds ?? []).includes("INBOX"))
          .sort((a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0));
        const raw = inboxMessages[0];
        if (!raw) continue;
        const h = (name: string) => raw.payload?.headers?.find((x: { name: string }) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
        const subject = decodeMimeWords(h("Subject"));
        found[index] = {
          id: raw.id,
          threadId: threads[index].id,
          from: decodeMimeWords(h("From")),
          subject,
          snippet: decodeEntities(raw.snippet ?? ""),
          at: Number(raw.internalDate ?? 0),
          unread: inboxMessages.some((message) => (message.labelIds ?? []).includes("UNREAD")),
          starred: (raw.labelIds ?? []).includes("STARRED"),
          isReply: Boolean(h("In-Reply-To")) || /^\s*re:/i.test(subject),
          attachmentCount: inboxMessages.reduce((total, message) => total + attachmentList(message.payload).length, 0),
        };
      } catch (err) {
        if (err instanceof GoogleReadScopeError) throw err;
        if (!(err instanceof GmailApiError) || err.status !== 404) throw err;
        // A thread deleted while listing can be skipped safely.
      }
    }
  }));
  return { items: found.filter((m): m is MailListItem => m !== null).sort((a, b) => b.at - a.at), nextPageToken: list.nextPageToken ?? null };
}

/** Gmail's modify scope is required to update labels on a thread or message. */
async function gmailModify(accessToken: string, path: string, body: { addLabelIds?: string[]; removeLabelIds?: string[] }) {
  const res = await fetchGmailApi(accessToken, `${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  }, path);
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
